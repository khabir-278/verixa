-- ============================================================================
-- VERIXA BLOCK SYSTEM SECURITY REMEDIATION — PHASE 2 ROLLBACK SCRIPT (DOWN)
-- Migration ID: 20261011_block_system_hardening_down.sql
-- Target: Supabase PostgreSQL (Full Coverage Rollback for 20261011_block_system_hardening_up.sql)
-- STATUS: PREPARED FOR REVIEW ONLY — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
-- ============================================================================
--
-- ROLLBACK COVERAGE, DATA PRESERVATION & IRREVERSIBLE SIDE-EFFECT NOTES:
-- 1. Schema Columns & Indexes Preserved (Non-Destructive):
--    - Columns added via `ADD COLUMN IF NOT EXISTS` on `public.messages`
--      (`reply_to_message_id`, `is_forwarded`, `forwarded_from_message_id`,
--      `message_type`, `media_name`, `media_size`, `edited_at`, `deleted_at`,
--      `reactions`) and `public.comments` (`reel_id`) are intentionally NOT dropped
--      so that user messages and reel comments created after migration are never lost.
-- 2. Backfilled Block Rows (`public.blocked_users`):
--    - Rows inserted during forward migration Step 3 with the sentinel reason
--      `'Backfilled from moderation_logs'` are removed by this rollback script,
--      while legitimate user-created rows in `public.blocked_users` are preserved.
-- 3. Irreversible Trigger Cleanup Side Effects:
--    - If a new block was inserted into `public.blocked_users` while the forward
--      migration was active, `trg_on_user_blocked_cleanup` deleted mutual rows in
--      `public.follows`, `public.notifications`, `public.likes`, and `public.story_likes`.
--      Those deleted social interactions cannot be automatically reconstructed by SQL
--      rollback without restoring from a pre-migration point-in-time backup.
-- 4. Security Floor Guarantee:
--    - Per security policy, this rollback script NEVER re-introduces `auth.uid() IS NULL`
--      anonymous RLS bypasses, `USING (true)` write policies, or `anon` execute grants
--      on security-sensitive functions. All restored policies remain scoped to
--      `authenticated` users with strict ownership checks.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REMOVE BACKFILLED SENTINEL ROWS FROM public.blocked_users
-- ============================================================================
DELETE FROM public.blocked_users
WHERE reason = 'Backfilled from moderation_logs';

-- ============================================================================
-- 2. DROP PHASE 2 TRIGGERS & HELPER FUNCTIONS, RESTORE BASELINE FUNCTIONS
-- ============================================================================
DROP TRIGGER IF EXISTS trg_enforce_message_update_security ON public.messages;
DROP FUNCTION IF EXISTS public.enforce_message_update_security();

DROP FUNCTION IF EXISTS public.get_my_restricted_user_ids();

-- Restore baseline public.is_blocked (maintaining authenticated-only grant & search_path)
CREATE OR REPLACE FUNCTION public.is_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF user_a IS NULL OR user_b IS NULL THEN
    RETURN TRUE;
  END IF;
  IF user_a = user_b THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.blocked_users b
    WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
       OR (b.blocker_id = user_b AND b.blocked_id = user_a)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked(UUID, UUID) TO authenticated, service_role;

-- Restore baseline on_user_blocked_cleanup trigger function (follows + notifications cleanup)
CREATE OR REPLACE FUNCTION public.on_user_blocked_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);

  DELETE FROM public.notifications
  WHERE (recipient_id = NEW.blocker_id AND sender_id = NEW.blocked_id)
     OR (recipient_id = NEW.blocked_id AND sender_id = NEW.blocker_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_user_blocked_cleanup ON public.blocked_users;
CREATE TRIGGER trg_on_user_blocked_cleanup
  AFTER INSERT ON public.blocked_users
  FOR EACH ROW
  EXECUTE FUNCTION public.on_user_blocked_cleanup();

-- Restore baseline record_story_view (UUID[] implementation from supabase_schema.sql)
DROP FUNCTION IF EXISTS public.record_story_view(UUID);
CREATE OR REPLACE FUNCTION public.record_story_view(p_story_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_story public.stories%ROWTYPE;
  v_viewer_id UUID;
BEGIN
  v_viewer_id := auth.uid();
  IF v_viewer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Story not found');
  END IF;

  IF NOT (COALESCE(v_story.viewed_by, ARRAY[]::uuid[]) @> ARRAY[v_viewer_id]) THEN
    UPDATE public.stories
    SET views_count = COALESCE(views_count, 0) + 1,
        viewed_by = array_append(COALESCE(viewed_by, ARRAY[]::uuid[]), v_viewer_id)
    WHERE id = p_story_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'views_count', COALESCE(v_story.views_count, 0) + CASE WHEN NOT (COALESCE(v_story.viewed_by, ARRAY[]::uuid[]) @> ARRAY[v_viewer_id]) THEN 1 ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_story_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_story_view(UUID) TO authenticated, service_role;

-- Restore baseline comment counter & notification functions (keeping search_path hardened)
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
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_id IS NOT NULL THEN
      UPDATE public.posts
      SET comments_count = GREATEST(0, COALESCE(comments_count, 1) - 1),
          updated_at = timezone('utc'::text, now())
      WHERE id = OLD.post_id;
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
  IF v_post_author IS NOT NULL AND v_post_author != NEW.user_id THEN
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
  v_post_author UUID;
  v_sender_name TEXT;
BEGIN
  SELECT user_id INTO v_post_author FROM public.posts WHERE id = NEW.post_id;
  IF v_post_author IS NOT NULL AND v_post_author != NEW.user_id THEN
    SELECT COALESCE(name, username, 'Someone') INTO v_sender_name FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.notifications (recipient_id, sender_id, type, post_id, message, read, created_at)
    VALUES (
      v_post_author,
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
  IF NEW.follower_id != NEW.following_id THEN
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
  v_notif_id UUID;
  v_sender_name TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() = p_recipient_id THEN
    RETURN NULL;
  END IF;

  IF p_type NOT IN ('like', 'comment', 'follow', 'mention') THEN
    RAISE EXCEPTION 'Invalid notification type: %', p_type;
  END IF;

  IF p_type = 'like' THEN
    IF NOT EXISTS (SELECT 1 FROM public.likes WHERE post_id = p_post_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized notification: Like record does not exist';
    END IF;
  ELSIF p_type = 'comment' THEN
    IF NOT EXISTS (SELECT 1 FROM public.comments WHERE (post_id = p_post_id OR reel_id = p_post_id) AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized notification: Comment record does not exist';
    END IF;
  ELSIF p_type = 'follow' THEN
    IF NOT EXISTS (SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = p_recipient_id) THEN
      RAISE EXCEPTION 'Unauthorized notification: Follow record does not exist';
    END IF;
  END IF;

  SELECT COALESCE(name, username, 'Someone') INTO v_sender_name FROM public.profiles WHERE id = auth.uid();

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
    auth.uid(),
    p_type,
    p_post_id,
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
-- 3. RESTORE RLS POLICIES ACROSS ALL 14 AFFECTED TABLES (WITHOUT ANON BYPASSES)
-- ============================================================================

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

-- 3A. public.blocked_users (Restores blocker_id OR blocked_id SELECT for authenticated users only)
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocked users"
  ON public.blocked_users FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

CREATE POLICY "Users can block other users"
  ON public.blocked_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id);

CREATE POLICY "Users can unblock users"
  ON public.blocked_users FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

-- 3B. public.profiles (Authenticated only — no anon bypass)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR NOT public.is_blocked(auth.uid(), id));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3C. public.posts (Authenticated only — no anon bypass)
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved posts are viewable by everyone"
  ON public.posts FOR SELECT
  TO authenticated
  USING (
    (moderation_status IN ('approved', 'APPROVED', 'allowed', 'ALLOWED') OR auth.uid() = user_id)
    AND (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
  );

CREATE POLICY "Authenticated users can create posts"
  ON public.posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3D. public.reels (Authenticated only, with ownership checks)
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved reels are viewable by everyone"
  ON public.reels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id));

CREATE POLICY "Authenticated users can create reels"
  ON public.reels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reels"
  ON public.reels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reels"
  ON public.reels FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3E. public.stories (Authenticated only, with ownership checks)
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved active stories are viewable by everyone"
  ON public.stories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id));

CREATE POLICY "Authenticated users can create stories"
  ON public.stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stories"
  ON public.stories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stories"
  ON public.stories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3F. public.story_likes
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story likes visible when not blocked"
  ON public.story_likes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id));

CREATE POLICY "Authenticated users can like stories"
  ON public.story_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike stories"
  ON public.story_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3G. public.likes (and public.post_likes if present)
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
  ON public.likes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id));

CREATE POLICY "Users can toggle their own likes"
  ON public.likes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_id AND public.is_blocked(auth.uid(), p.user_id)
    )
  );

CREATE POLICY "Users can delete their own likes"
  ON public.likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF to_regclass('public.post_likes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY';
    EXECUTE '
      CREATE POLICY "Post likes are viewable by everyone"
        ON public.post_likes FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
    ';
    EXECUTE '
      CREATE POLICY "Users can toggle their own post likes"
        ON public.post_likes FOR INSERT
        TO authenticated
        WITH CHECK (
          auth.uid() = user_id
          AND NOT EXISTS (
            SELECT 1 FROM public.posts p
            WHERE p.id = post_id AND public.is_blocked(auth.uid(), p.user_id)
          )
        )
    ';
    EXECUTE '
      CREATE POLICY "Users can delete their own post likes"
        ON public.post_likes FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id)
    ';
  END IF;
END $$;

-- 3H. public.comments (Preserves both post_id and reel_id support)
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved comments are viewable by everyone"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    (moderation_status IN ('approved', 'APPROVED', 'allowed', 'ALLOWED') OR auth.uid() = user_id)
    AND (auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id))
  );

CREATE POLICY "Authenticated users can add comments"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      post_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.posts p
        WHERE p.id = post_id AND public.is_blocked(auth.uid(), p.user_id)
      )
    )
    AND (
      reel_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.reels r
        WHERE r.id = reel_id AND public.is_blocked(auth.uid(), r.user_id)
      )
    )
  );

CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3I. public.follows
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = follower_id OR NOT public.is_blocked(auth.uid(), follower_id))
    AND (auth.uid() = following_id OR NOT public.is_blocked(auth.uid(), following_id))
  );

CREATE POLICY "Users can follow others"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = follower_id
    AND follower_id <> following_id
    AND NOT public.is_blocked(follower_id, following_id)
  );

CREATE POLICY "Users can unfollow others"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- 3J. public.messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversation messages"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND sender_id <> receiver_id
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = sender_id
    AND NOT public.is_blocked(sender_id, receiver_id)
  )
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

CREATE POLICY "Sender can delete own message"
  ON public.messages FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id);

-- 3K. public.notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = recipient_id
    AND (sender_id IS NULL OR NOT public.is_blocked(recipient_id, sender_id))
  );

CREATE POLICY "Users can create notifications when not blocked"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND recipient_id <> sender_id
    AND NOT public.is_blocked(sender_id, recipient_id)
  );

CREATE POLICY "Users can update their notifications (mark read)"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = recipient_id);

-- 3L. public.saved_posts
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved posts"
  ON public.saved_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save posts"
  ON public.saved_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove saved posts"
  ON public.saved_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3M. storage.objects (Removes restrictive/permissive Phase 2 policies & restores UID-folder policies without anon bypass)
DROP POLICY IF EXISTS "Blocked users cannot access storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view unblocked app-files" ON storage.objects;
DROP POLICY IF EXISTS "Restrict blocked users from app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to own UID folder in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to app-files under their UID folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own app-files" ON storage.objects;

CREATE POLICY "Authenticated users can view app-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'app-files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT public.is_blocked(auth.uid(), ((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "Authenticated users can upload to app-files under their UID folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'app-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own app-files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'app-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'app-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own app-files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'app-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Drop Phase 2 helper functions after policy replacement
DROP FUNCTION IF EXISTS public.storage_object_owner_uuid(TEXT, UUID);
DROP FUNCTION IF EXISTS public.try_parse_uuid(TEXT);

-- Preserve anonymous table revocation on rollback (never restore anonymous access)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

COMMIT;
