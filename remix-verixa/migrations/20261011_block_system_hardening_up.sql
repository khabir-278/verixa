-- ============================================================================
-- VERIXA BLOCK SYSTEM SECURITY REMEDIATION — PHASE 2 MIGRATION (UP)
-- Migration ID: 20261011_block_system_hardening_up.sql
-- Target: Supabase PostgreSQL (Live Schema Reconciled & Patched for SQL-01..SQL-12)
-- STATUS: PREPARED FOR REVIEW ONLY — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SCHEMA RECONCILIATION (NON-DESTRUCTIVE ADDITIONS FOR LIVE TABLES)
-- ============================================================================
-- Verified against live public.messages and public.comments schema: adds extended
-- metadata columns if not yet present, preserving all existing rows and data.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_name TEXT,
  ADD COLUMN IF NOT EXISTS media_size BIGINT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- Ensure comments supports both post_id and reel_id (reconciled with live schema)
ALTER TABLE public.comments
  ALTER COLUMN post_id DROP NOT NULL;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_reel_id
  ON public.comments (reel_id);

-- Ensure composite and reverse indexes exist on public.blocked_users for O(1) RLS lookups
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_blocked
  ON public.blocked_users (blocker_id, blocked_id);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_blocker
  ON public.blocked_users (blocked_id, blocker_id);

-- ============================================================================
-- 2. SAFE TYPE-HANDLING & PATH-OWNERSHIP HELPER FUNCTIONS
-- ============================================================================

-- 2A. Safe UUID parser that never throws 22P02 on arbitrary text identifiers (Fixes SQL-01 & SQL-05)
CREATE OR REPLACE FUNCTION public.try_parse_uuid(p_val TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_val IS NULL OR p_val !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN p_val::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.try_parse_uuid(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_parse_uuid(TEXT) TO anon, authenticated, service_role;

-- 2B. Storage object owner extractor using path-based ownership when storage.objects.owner IS NULL (Fixes SQL-05)
CREATE OR REPLACE FUNCTION public.storage_object_owner_uuid(p_name TEXT, p_owner UUID)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = public, storage, pg_temp
AS $$
  SELECT COALESCE(
    p_owner,
    public.try_parse_uuid((storage.foldername(p_name))[1])
  );
$$;

REVOKE ALL ON FUNCTION public.storage_object_owner_uuid(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_object_owner_uuid(TEXT, UUID) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. RECONCILED LEGACY BLOCK BACKFILL (moderation_logs -> blocked_users)
-- ============================================================================
-- Fixes SQL-01: Explicitly converts both ml.user_id and ml.target_id via
-- public.try_parse_uuid(val::text) before comparing UUIDs. Never compares
-- UUID directly against TEXT or applies regex operators to a UUID column.
-- Takes ONLY the latest event per (blocker_uuid, blocked_uuid) pair so
-- historical blocks that were later unblocked are NOT re-activated.
WITH normalized_block_events AS (
  SELECT
    public.try_parse_uuid(ml.user_id::text) AS blocker_uuid,
    public.try_parse_uuid(ml.target_id::text) AS blocked_uuid,
    ml.category,
    ml.status,
    ml.reason,
    ml.created_at
  FROM public.moderation_logs ml
  WHERE ml.category IN ('USER_BLOCK', 'USER_UNBLOCK')
),
latest_block_events AS (
  SELECT DISTINCT ON (nbe.blocker_uuid, nbe.blocked_uuid)
    nbe.blocker_uuid,
    nbe.blocked_uuid,
    nbe.category,
    nbe.status,
    nbe.reason,
    nbe.created_at
  FROM normalized_block_events nbe
  WHERE nbe.blocker_uuid IS NOT NULL
    AND nbe.blocked_uuid IS NOT NULL
    AND nbe.blocker_uuid <> nbe.blocked_uuid
  ORDER BY nbe.blocker_uuid, nbe.blocked_uuid, nbe.created_at DESC
)
INSERT INTO public.blocked_users (blocker_id, blocked_id, reason, created_at)
SELECT
  lbe.blocker_uuid,
  lbe.blocked_uuid,
  COALESCE(lbe.reason, 'Backfilled from moderation_logs'),
  COALESCE(lbe.created_at, timezone('utc'::text, now()))
FROM latest_block_events lbe
JOIN public.profiles p1 ON p1.id = lbe.blocker_uuid
JOIN public.profiles p2 ON p2.id = lbe.blocked_uuid
WHERE lbe.category = 'USER_BLOCK'
  AND COALESCE(lbe.status, 'blocked') <> 'approved'
ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

-- ============================================================================
-- 4. HARDEN SECURITY DEFINER FUNCTIONS, TRIGGERS & SEARCH PATHS
-- ============================================================================

-- 4A. Authoritative mutual block check function (Fixes SQL-04):
-- - Hardens search_path to public, pg_temp
-- - FAILS CLOSED (returns TRUE) on NULL inputs or unauthorized callers so
--   `NOT public.is_blocked(a, b)` evaluates to FALSE (access denied) and
--   third-party callers cannot enumerate the block graph.
-- - Preserves accurate evaluation for authorized participants (auth.uid() IN (user_a, user_b))
--   and privileged service execution (service_role / direct SQL admin).
CREATE OR REPLACE FUNCTION public.is_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_role TEXT := COALESCE(auth.role(), '');
  v_is_privileged BOOLEAN := (
    v_role = 'service_role'
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR (
      SESSION_USER IN ('postgres', 'supabase_admin', 'supabase_storage_admin')
      AND COALESCE(current_setting('request.jwt.claims', true), '') = ''
    )
  );
BEGIN
  -- 1. Fail closed on NULL inputs (including anonymous callers where auth.uid() is NULL)
  IF user_a IS NULL OR user_b IS NULL THEN
    RETURN TRUE;
  END IF;

  -- 2. Fail closed for unauthorized callers (prevents third-party enumeration and
  --    ensures `NOT public.is_blocked(...)` evaluates to FALSE for non-participants)
  IF NOT v_is_privileged AND (v_caller IS NULL OR (v_caller <> user_a AND v_caller <> user_b)) THEN
    RETURN TRUE;
  END IF;

  -- 3. An authorized user is never blocked from their own account
  IF user_a = user_b THEN
    RETURN FALSE;
  END IF;

  -- 4. Mutual block lookup using composite indexes on public.blocked_users
  RETURN EXISTS (
    SELECT 1
    FROM public.blocked_users bu
    WHERE (bu.blocker_id = user_a AND bu.blocked_id = user_b)
       OR (bu.blocker_id = user_b AND bu.blocked_id = user_a)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated, service_role;

-- 4B. Narrowly-scoped bilateral restriction helper RPC (Fixes SQL-06):
-- Returns ONLY the flat set of user UUIDs mutually restricted with auth.uid()
-- (either blocked by auth.uid() or blocking auth.uid()) without exposing
-- block direction, private block reasons, timestamps, or third-party rows.
CREATE OR REPLACE FUNCTION public.get_my_restricted_user_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    CASE
      WHEN bu.blocker_id = v_caller THEN bu.blocked_id
      ELSE bu.blocker_id
    END AS restricted_user_id
  FROM public.blocked_users bu
  WHERE bu.blocker_id = v_caller
     OR bu.blocked_id = v_caller;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_restricted_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_restricted_user_ids() TO authenticated, service_role;

-- 4C. Harden on_user_blocked_cleanup() trigger function using actual live tables:
-- - Deletes mutual follows (public.follows)
-- - Recomputes followers_count and following_count on public.profiles
-- - Deletes mutual notifications (public.notifications)
-- - Deletes cross-account post likes (public.likes & public.post_likes if present)
-- - Deletes cross-account story likes (public.story_likes)
CREATE OR REPLACE FUNCTION public.on_user_blocked_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Remove follow relationships in both directions
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);

  -- 2. Recompute accurate follower/following counters on both profiles
  UPDATE public.profiles
  SET
    followers_count = (SELECT COUNT(*) FROM public.follows WHERE following_id = NEW.blocker_id),
    following_count = (SELECT COUNT(*) FROM public.follows WHERE follower_id = NEW.blocker_id)
  WHERE id = NEW.blocker_id;

  UPDATE public.profiles
  SET
    followers_count = (SELECT COUNT(*) FROM public.follows WHERE following_id = NEW.blocked_id),
    following_count = (SELECT COUNT(*) FROM public.follows WHERE follower_id = NEW.blocked_id)
  WHERE id = NEW.blocked_id;

  -- 3. Remove cross-account notifications
  DELETE FROM public.notifications
  WHERE (recipient_id = NEW.blocker_id AND sender_id = NEW.blocked_id)
     OR (recipient_id = NEW.blocked_id AND sender_id = NEW.blocker_id);

  -- 4. Remove cross-account likes on posts (live table: public.likes)
  DELETE FROM public.likes
  WHERE (user_id = NEW.blocker_id AND post_id IN (SELECT id FROM public.posts WHERE user_id = NEW.blocked_id))
     OR (user_id = NEW.blocked_id AND post_id IN (SELECT id FROM public.posts WHERE user_id = NEW.blocker_id));

  -- 4b. Also clean public.post_likes if present in schema
  IF to_regclass('public.post_likes') IS NOT NULL THEN
    EXECUTE '
      DELETE FROM public.post_likes
      WHERE (user_id = $1 AND post_id IN (SELECT id FROM public.posts WHERE user_id = $2))
         OR (user_id = $2 AND post_id IN (SELECT id FROM public.posts WHERE user_id = $1))
    ' USING NEW.blocker_id, NEW.blocked_id;
  END IF;

  -- 5. Remove cross-account likes on stories (live table: public.story_likes)
  DELETE FROM public.story_likes
  WHERE (user_id = NEW.blocker_id AND story_id IN (SELECT id FROM public.stories WHERE user_id = NEW.blocked_id))
     OR (user_id = NEW.blocked_id AND story_id IN (SELECT id FROM public.stories WHERE user_id = NEW.blocker_id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_user_blocked_cleanup ON public.blocked_users;
CREATE TRIGGER trg_on_user_blocked_cleanup
  AFTER INSERT ON public.blocked_users
  FOR EACH ROW
  EXECUTE FUNCTION public.on_user_blocked_cleanup();

-- 4D. Controlled RPC for recording story views using actual UUID[] type (Fixes SQL-02):
-- - Drops any prior signature (e.g. RETURNS jsonb) cleanly before recreating
-- - Uses UUID[] for stories.viewed_by
-- - Acquires row-level FOR UPDATE lock for concurrency safety
-- - Prevents duplicate views via v_viewer = ANY(v_viewed_by)
-- - Rejects blocked viewers via public.is_blocked(v_viewer, v_owner)
DROP FUNCTION IF EXISTS public.record_story_view(UUID);
CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer UUID := auth.uid();
  v_owner UUID;
  v_viewed_by UUID[];
  v_count INTEGER;
BEGIN
  IF v_viewer IS NULL OR p_story_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record story view';
  END IF;

  SELECT user_id, COALESCE(viewed_by, ARRAY[]::uuid[]), COALESCE(views_count, 0)
  INTO v_owner, v_viewed_by, v_count
  FROM public.stories
  WHERE id = p_story_id
  FOR UPDATE;

  IF NOT FOUND OR v_owner IS NULL THEN
    RETURN 0;
  END IF;

  IF v_owner <> v_viewer AND public.is_blocked(v_viewer, v_owner) THEN
    RAISE EXCEPTION 'Story is not available due to account privacy restrictions';
  END IF;

  IF NOT (v_viewer = ANY(v_viewed_by)) THEN
    v_viewed_by := array_append(v_viewed_by, v_viewer);
    v_count := GREATEST(v_count + 1, COALESCE(array_length(v_viewed_by, 1), 1));
    UPDATE public.stories
    SET viewed_by = v_viewed_by,
        views_count = v_count
    WHERE id = p_story_id;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_story_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_story_view(UUID) TO authenticated, service_role;

-- 4E. Harden comment counters & notification triggers/RPCs (Fixes SQL-03 & SQL-11)
CREATE OR REPLACE FUNCTION public.update_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_id IS NOT NULL THEN
      UPDATE public.posts
      SET comments_count = COALESCE(comments_count, 0) + 1,
          updated_at = timezone('utc'::text, now())
      WHERE id = NEW.post_id;
    END IF;
    IF NEW.reel_id IS NOT NULL THEN
      UPDATE public.reels
      SET comments_count = COALESCE(comments_count, 0) + 1,
          updated_at = timezone('utc'::text, now())
      WHERE id = NEW.reel_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.posts
      SET comments_count = GREATEST(0, COALESCE(comments_count, 1) - 1),
          updated_at = timezone('utc'::text, now())
      WHERE id = OLD.post_id;
    END IF;
    IF OLD.reel_id IS NOT NULL THEN
      UPDATE public.reels
      SET comments_count = GREATEST(0, COALESCE(comments_count, 1) - 1),
          updated_at = timezone('utc'::text, now())
      WHERE id = OLD.reel_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_like_created_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_post_author UUID;
  v_sender_name TEXT;
BEGIN
  SELECT user_id INTO v_post_author FROM public.posts WHERE id = NEW.post_id;
  IF v_post_author IS NOT NULL
     AND v_post_author <> NEW.user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.blocked_users bu
       WHERE (bu.blocker_id = NEW.user_id AND bu.blocked_id = v_post_author)
          OR (bu.blocker_id = v_post_author AND bu.blocked_id = NEW.user_id)
     ) THEN
    SELECT COALESCE(name, username, 'Someone') INTO v_sender_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications (recipient_id, sender_id, type, post_id, message, read, created_at)
    VALUES (
      v_post_author,
      NEW.user_id,
      'like',
      NEW.post_id,
      COALESCE(v_sender_name, 'A member') || ' liked your post.',
      false,
      timezone('utc'::text, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_comment_created_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_author UUID;
  v_sender_name TEXT;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT user_id INTO v_target_author FROM public.posts WHERE id = NEW.post_id;
  END IF;
  IF v_target_author IS NULL AND NEW.reel_id IS NOT NULL THEN
    SELECT user_id INTO v_target_author FROM public.reels WHERE id = NEW.reel_id;
  END IF;

  IF v_target_author IS NOT NULL
     AND v_target_author <> NEW.user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.blocked_users bu
       WHERE (bu.blocker_id = NEW.user_id AND bu.blocked_id = v_target_author)
          OR (bu.blocker_id = v_target_author AND bu.blocked_id = NEW.user_id)
     ) THEN
    SELECT COALESCE(name, username, 'Someone') INTO v_sender_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications (recipient_id, sender_id, type, post_id, message, read, created_at)
    VALUES (
      v_target_author,
      NEW.user_id,
      'comment',
      NEW.post_id,
      COALESCE(v_sender_name, 'A member') || ' commented: "' || substr(NEW.text, 1, 60) || '"',
      false,
      timezone('utc'::text, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_follow_created_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_name TEXT;
BEGIN
  IF NEW.follower_id <> NEW.following_id
     AND NOT EXISTS (
       SELECT 1 FROM public.blocked_users bu
       WHERE (bu.blocker_id = NEW.follower_id AND bu.blocked_id = NEW.following_id)
          OR (bu.blocker_id = NEW.following_id AND bu.blocked_id = NEW.follower_id)
     ) THEN
    SELECT COALESCE(name, username, 'Someone') INTO v_sender_name FROM public.profiles WHERE id = NEW.follower_id;
    INSERT INTO public.notifications (recipient_id, sender_id, type, message, read, created_at)
    VALUES (
      NEW.following_id,
      NEW.follower_id,
      'follow',
      COALESCE(v_sender_name, 'A member') || ' started following you.',
      false,
      timezone('utc'::text, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_interaction_notification(
  p_recipient_id UUID,
  p_type TEXT,
  p_post_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_notif_id UUID;
  v_sender_name TEXT;
BEGIN
  IF v_caller IS NULL OR p_recipient_id IS NULL OR v_caller = p_recipient_id THEN
    RETURN NULL;
  END IF;

  IF public.is_blocked(v_caller, p_recipient_id) THEN
    RAISE EXCEPTION 'Notification blocked due to account privacy restrictions';
  END IF;

  IF p_type NOT IN ('like', 'comment', 'follow', 'mention') THEN
    RAISE EXCEPTION 'Invalid notification type: %', p_type;
  END IF;

  IF p_type = 'like' THEN
    IF NOT EXISTS (SELECT 1 FROM public.likes WHERE post_id = p_post_id AND user_id = v_caller)
       AND NOT EXISTS (SELECT 1 FROM public.story_likes WHERE story_id = p_post_id AND user_id = v_caller) THEN
      RAISE EXCEPTION 'Unauthorized notification: Like record does not exist';
    END IF;
  ELSIF p_type = 'comment' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.comments
      WHERE (post_id = p_post_id OR reel_id = p_post_id)
        AND user_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Unauthorized notification: Comment record does not exist';
    END IF;
  ELSIF p_type = 'follow' THEN
    IF NOT EXISTS (SELECT 1 FROM public.follows WHERE follower_id = v_caller AND following_id = p_recipient_id) THEN
      RAISE EXCEPTION 'Unauthorized notification: Follow record does not exist';
    END IF;
  END IF;

  SELECT COALESCE(name, username, 'Someone') INTO v_sender_name FROM public.profiles WHERE id = v_caller;

  INSERT INTO public.notifications (
    recipient_id,
    sender_id,
    type,
    post_id,
    message,
    read,
    created_at
  ) VALUES (
    p_recipient_id,
    v_caller,
    p_type,
    CASE WHEN EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id) THEN p_post_id ELSE NULL END,
    COALESCE(p_message, v_sender_name || ' interacted with your content.'),
    false,
    timezone('utc'::text, now())
  ) RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_interaction_notification(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_interaction_notification(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.stories WHERE expires_at <= timezone('utc'::text, now());
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_stories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_stories() TO authenticated, service_role;

-- ============================================================================
-- 5. MESSAGE IMMUTABILITY TRIGGER (Fixes SQL-08)
-- ============================================================================
-- Prevents any non-participant update, blocks updates when mutually blocked,
-- locks structural/envelope columns for all users, and restricts recipients
-- strictly to updating delivery/read status and reactions.
CREATE OR REPLACE FUNCTION public.enforce_message_update_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_role TEXT := COALESCE(auth.role(), '');
BEGIN
  IF v_role = 'service_role' OR COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required to update messages';
  END IF;

  -- 1. Never allow anyone to mutate message identity, conversation envelope, or provenance
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reply_to_message_id IS DISTINCT FROM OLD.reply_to_message_id
     OR NEW.is_forwarded IS DISTINCT FROM OLD.is_forwarded
     OR NEW.forwarded_from_message_id IS DISTINCT FROM OLD.forwarded_from_message_id
     OR NEW.is_ai_verified IS DISTINCT FROM OLD.is_ai_verified THEN
    RAISE EXCEPTION 'Forbidden: cannot modify immutable message envelope or provenance fields';
  END IF;

  -- 2. Block any update if sender and receiver are mutually blocked
  IF public.is_blocked(OLD.sender_id, OLD.receiver_id) THEN
    RAISE EXCEPTION 'Messaging unavailable due to account privacy restrictions';
  END IF;

  -- 3. If the caller is the receiver (and not the sender), they may ONLY update
  --    status, delivered_at, read_at, and reactions. All content/media/deletion fields are locked.
  IF v_actor = OLD.receiver_id AND v_actor <> OLD.sender_id THEN
    IF NEW.text IS DISTINCT FROM OLD.text
       OR NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.media_name IS DISTINCT FROM OLD.media_name
       OR NEW.media_size IS DISTINCT FROM OLD.media_size
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.is_voice IS DISTINCT FROM OLD.is_voice
       OR NEW.voice_duration IS DISTINCT FROM OLD.voice_duration
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Forbidden: message recipient cannot modify message content, media, or deletion state';
    END IF;
  ELSIF v_actor = OLD.sender_id THEN
    -- Sender may edit text, soft-delete (setting media_url = NULL, is_voice = false, deleted_at),
    -- or update reactions/status, but may NEVER swap media_url to a different non-null file after creation.
    IF NEW.media_url IS NOT NULL AND NEW.media_url IS DISTINCT FROM OLD.media_url THEN
      RAISE EXCEPTION 'Forbidden: message sender cannot replace media attachment URL after creation';
    END IF;
  ELSE
    RAISE EXCEPTION 'Forbidden: not authorized to update this message';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_message_update_security ON public.messages;
CREATE TRIGGER trg_enforce_message_update_security
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_update_security();

-- ============================================================================
-- 6. RLS POLICIES — PURGE ALL LEGACY PERMISSIVE POLICIES & ENFORCE HARDENING
-- ============================================================================
-- Fixes SQL-09: Dynamically drops any pre-existing permissive policies on the
-- target public tables (from supabase_schema.sql or dashboard ad-hoc edits)
-- so no residual `USING (true)` or `auth.uid() IS NULL` policy can OR-bypass
-- the hardened policies below.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'blocked_users',
        'profiles',
        'posts',
        'reels',
        'stories',
        'story_likes',
        'likes',
        'post_likes',
        'comments',
        'follows',
        'messages',
        'notifications',
        'saved_posts'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 6A. public.blocked_users
-- Restrict SELECT strictly to blocker_id = auth.uid() so blocked targets cannot
-- read private block reasons or enumerate who blocked them via table SELECT.
-- Bilateral restriction checks use public.is_blocked() or public.get_my_restricted_user_ids().
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks"
  ON public.blocked_users
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can insert own blocks"
  ON public.blocked_users
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id);

CREATE POLICY "Users can update own blocks"
  ON public.blocked_users
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id);

CREATE POLICY "Users can delete own blocks"
  ON public.blocked_users
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

-- 6B. public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles visible when not blocked"
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR NOT public.is_blocked(auth.uid(), id));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 6C. public.posts
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts visible when author not blocked"
  ON public.posts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (moderation_status IN ('approved', 'APPROVED', 'allowed', 'ALLOWED') OR auth.uid() = user_id)
    AND (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
  );

CREATE POLICY "Users can create posts"
  ON public.posts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON public.posts
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6D. public.reels
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reels visible when author not blocked"
  ON public.reels
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (moderation_status IN ('approved', 'APPROVED', 'allowed', 'ALLOWED') OR auth.uid() = user_id)
    AND (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
  );

CREATE POLICY "Users can create reels"
  ON public.reels
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reels"
  ON public.reels
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reels"
  ON public.reels
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6E. public.stories
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories visible when author not blocked"
  ON public.stories
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (moderation_status IN ('approved', 'APPROVED', 'allowed', 'ALLOWED') OR auth.uid() = user_id)
    AND (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
  );

CREATE POLICY "Users can create stories"
  ON public.stories
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stories"
  ON public.stories
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
  ON public.stories
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6F. public.story_likes
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story likes visible when not blocked"
  ON public.story_likes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_likes.story_id
        AND (s.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), s.user_id))
    )
  );

CREATE POLICY "Users can like stories when not blocked"
  ON public.story_likes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_likes.story_id
        AND (s.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), s.user_id))
    )
  );

CREATE POLICY "Users can unlike stories"
  ON public.story_likes
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6G. public.likes (and public.post_likes if present — Fixes SQL-10)
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes visible when not blocked"
  ON public.likes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = likes.post_id
        AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
    )
  );

CREATE POLICY "Users can insert likes when not blocked"
  ON public.likes
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = likes.post_id
        AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
    )
  );

CREATE POLICY "Users can remove their own likes"
  ON public.likes
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF to_regclass('public.post_likes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY';
    EXECUTE '
      CREATE POLICY "Post likes visible when not blocked"
        ON public.post_likes
        AS PERMISSIVE
        FOR SELECT
        TO authenticated
        USING (
          (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
          AND EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = post_likes.post_id
              AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
          )
        )
    ';
    EXECUTE '
      CREATE POLICY "Users can insert post likes when not blocked"
        ON public.post_likes
        AS PERMISSIVE
        FOR INSERT
        TO authenticated
        WITH CHECK (
          auth.uid() = user_id
          AND EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = post_likes.post_id
              AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
          )
        )
    ';
    EXECUTE '
      CREATE POLICY "Users can remove their own post likes"
        ON public.post_likes
        AS PERMISSIVE
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id)
    ';
  END IF;
END $$;

-- 6H. public.comments (Fixes SQL-03: Supports both post_id and reel_id comments)
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments visible when not blocked"
  ON public.comments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (moderation_status IN ('approved', 'APPROVED', 'allowed', 'ALLOWED') OR auth.uid() = user_id)
    AND (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
    AND (
      (
        comments.post_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = comments.post_id
              AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
          )
          OR EXISTS (
            SELECT 1 FROM public.reels r
            WHERE r.id = comments.post_id
              AND (r.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), r.user_id))
          )
        )
      )
      OR (
        comments.reel_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.reels r
          WHERE r.id = comments.reel_id
            AND (r.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), r.user_id))
        )
      )
    )
  );

CREATE POLICY "Users can post comments when not blocked"
  ON public.comments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      (
        comments.post_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = comments.post_id
              AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
          )
          OR EXISTS (
            SELECT 1 FROM public.reels r
            WHERE r.id = comments.post_id
              AND (r.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), r.user_id))
          )
        )
      )
      OR (
        comments.reel_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.reels r
          WHERE r.id = comments.reel_id
            AND (r.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), r.user_id))
        )
      )
    )
  );

CREATE POLICY "Users can update own comments"
  ON public.comments
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      (
        comments.post_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = comments.post_id
              AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
          )
          OR EXISTS (
            SELECT 1 FROM public.reels r
            WHERE r.id = comments.post_id
              AND (r.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), r.user_id))
          )
        )
      )
      OR (
        comments.reel_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.reels r
          WHERE r.id = comments.reel_id
            AND (r.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), r.user_id))
        )
      )
    )
  )
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.comments
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6I. public.follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows visible when not blocked"
  ON public.follows
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = follower_id OR NOT public.is_blocked(auth.uid(), follower_id))
    AND (auth.uid() = following_id OR NOT public.is_blocked(auth.uid(), following_id))
  );

CREATE POLICY "Users can follow when not blocked"
  ON public.follows
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = follower_id
    AND follower_id <> following_id
    AND NOT public.is_blocked(follower_id, following_id)
  );

CREATE POLICY "Users can unfollow"
  ON public.follows
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- 6J. public.messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages visible to participants when not blocked"
  ON public.messages
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

CREATE POLICY "Users can send messages when not blocked"
  ON public.messages
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> receiver_id
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

-- Combined with trg_enforce_message_update_security:
-- - Sender can edit/soft-delete only when not blocked
-- - Receiver can mark delivered/read/reactions only when not blocked (content columns locked by trigger)
CREATE POLICY "Participants can update message when not blocked"
  ON public.messages
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.is_blocked(sender_id, receiver_id)
  )
  WITH CHECK (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

CREATE POLICY "Sender can delete own message"
  ON public.messages
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

-- 6K. public.notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications visible when sender not blocked"
  ON public.notifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = recipient_id
    AND (sender_id IS NULL OR NOT public.is_blocked(recipient_id, sender_id))
  );

CREATE POLICY "Users can create notifications when not blocked"
  ON public.notifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND recipient_id <> sender_id
    AND NOT public.is_blocked(sender_id, recipient_id)
  );

CREATE POLICY "Users can update own notifications"
  ON public.notifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = recipient_id);

-- 6L. public.saved_posts
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved posts"
  ON public.saved_posts
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = saved_posts.post_id
        AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
    )
  );

CREATE POLICY "Users can save posts"
  ON public.saved_posts
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = saved_posts.post_id
        AND (p.user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), p.user_id))
    )
  );

CREATE POLICY "Users can unsave posts"
  ON public.saved_posts
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6M. storage.objects (Fixes SQL-05: Path-based ownership + explicit PERMISSIVE & RESTRICTIVE policies)
-- Note: Switching storage.buckets.public = false is separately gated under Phase 4.
DROP POLICY IF EXISTS "Public can view app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to app-files under their UID folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own app files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own storage files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own storage files" ON storage.objects;
DROP POLICY IF EXISTS "Allow all authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow all uploads" ON storage.objects;
DROP POLICY IF EXISTS "Blocked users cannot access storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view unblocked app-files" ON storage.objects;
DROP POLICY IF EXISTS "Restrict blocked users from app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to own UID folder in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Restrict cross-user writes in app-files" ON storage.objects;

-- 1. Permissive SELECT policy for authenticated users when owner (or path prefix UUID) is not blocked
CREATE POLICY "Authenticated users can view unblocked app-files"
  ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'app-files'
    AND auth.uid() IS NOT NULL
    AND public.storage_object_owner_uuid(name, owner) IS NOT NULL
    AND (
      public.storage_object_owner_uuid(name, owner) = auth.uid()
      OR NOT public.is_blocked(auth.uid(), public.storage_object_owner_uuid(name, owner))
    )
  );

-- 2. Explicit RESTRICTIVE SELECT policy on storage.objects so even if another permissive
--    policy exists on storage.objects, blocked or anonymous callers are denied on app-files
CREATE POLICY "Restrict blocked users from app-files"
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT
  TO public
  USING (
    bucket_id <> 'app-files'
    OR (
      auth.uid() IS NOT NULL
      AND public.storage_object_owner_uuid(name, owner) IS NOT NULL
      AND (
        public.storage_object_owner_uuid(name, owner) = auth.uid()
        OR NOT public.is_blocked(auth.uid(), public.storage_object_owner_uuid(name, owner))
      )
    )
  );

-- 3. Permissive INSERT, UPDATE, DELETE policies enforcing first-folder UID ownership
CREATE POLICY "Authenticated users can upload to own UID folder in app-files"
  ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'app-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (owner IS NULL OR owner = auth.uid())
  );

CREATE POLICY "Users can update own files in app-files"
  ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'app-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (owner IS NULL OR owner = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'app-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (owner IS NULL OR owner = auth.uid())
  );

CREATE POLICY "Users can delete own files in app-files"
  ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'app-files'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (owner IS NULL OR owner = auth.uid())
  );

-- ============================================================================
-- 7. DEFENSE-IN-DEPTH TABLE GRANT HARDENING (Fixes SQL-12)
-- ============================================================================
-- Revoke direct anonymous access on protected social and messaging tables
REVOKE ALL ON TABLE
  public.blocked_users,
  public.profiles,
  public.posts,
  public.reels,
  public.stories,
  public.story_likes,
  public.likes,
  public.comments,
  public.follows,
  public.messages,
  public.notifications,
  public.saved_posts
FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.blocked_users,
  public.profiles,
  public.posts,
  public.reels,
  public.stories,
  public.story_likes,
  public.likes,
  public.comments,
  public.follows,
  public.messages,
  public.notifications,
  public.saved_posts
TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.post_likes') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.post_likes FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.post_likes TO authenticated, service_role';
  END IF;
END $$;

COMMIT;
