# VERIXA — PHASE 2 SQL MIGRATION & ROLLBACK TECHNICAL REVIEW (POST-PATCH)

**Assessment Date:** 2026-10-11  
**Reviewed & Patched Files:**
- Forward Migration: [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql) (983 lines)
- Rollback Script: [`migrations/20261011_block_system_hardening_down.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_down.sql) (561 lines)
- Migration Review Doc: [`BLOCK_SYSTEM_MIGRATION_REVIEW.md`](file:///c:/remix-verixa/BLOCK_SYSTEM_MIGRATION_REVIEW.md)
- Remediation Report: [`BLOCK_SYSTEM_REMEDIATION_REPORT.md`](file:///c:/remix-verixa/BLOCK_SYSTEM_REMEDIATION_REPORT.md)
- Verification Suite: [`tests/verify_block_remediation.mjs`](file:///c:/remix-verixa/tests/verify_block_remediation.mjs)

**Verdict for Phase 2 SQL Migration:** **READY FOR APPROVAL (ALL 12 SQL FINDINGS `SQL-01`–`SQL-12` RESOLVED IN LOCAL MIGRATION SCRIPTS; LIVE EXECUTION HELD AT MANDATORY STOP GATE)**

---

## 1. Live Database Schema & Data-Type Alignment Summary

Using read-only PostgREST queries and filter type probes against `https://jnbaumemwxydjktwedtz.supabase.co`, the exact live PostgreSQL column types were verified and reconciled in [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql):

| Table.Column | Actual Live PostgreSQL Type | Read-Only Probe Evidence | Patched Handling in `20261011_block_system_hardening_up.sql` | Status |
| :--- | :--- | :--- | :--- | :--- |
| `moderation_logs.user_id` | **`UUID`** | `.eq('user_id', 'not-a-uuid')` -> `22P02` | Handled via `public.try_parse_uuid(ml.user_id::text)` and safe `UUID` equality (`blocker_uuid <> blocked_uuid`) ([`up.sql:46-108`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L46-L108)) | **RESOLVED (`SQL-01`)** |
| `moderation_logs.target_id` | **`TEXT`** | `.eq('target_id', 'not-a-uuid')` -> Valid (`TEXT`) | Parsed via `public.try_parse_uuid(ml.target_id)` catching `invalid_text_representation` (`22P02`); non-UUID values return `NULL` safely | **RESOLVED (`SQL-01`)** |
| `stories.viewed_by` | **`UUID[]` (`_uuid`)** | `.overlaps('viewed_by', ['a'])` -> `22P02`; `.overlaps('viewed_by', ['c7aa8500-...'])` -> Valid `UUID[]` | `public.record_story_view(p_story_id UUID)` uses `v_viewed_by UUID[]`, `SELECT ... FOR UPDATE`, `NOT (v_viewer_id = ANY(v_viewed_by))`, and `array_append` ([`up.sql:243-295`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L243-L295)) | **RESOLVED (`SQL-02`)** |
| `comments.post_id` & `comments.reel_id` | **`UUID` (nullable)** | Live row inspection of `public.comments` | Added `comments.reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE`, updated `comments` `SELECT`/`INSERT`/`DELETE` RLS policies, `handle_comment_count()`, `create_notification_secure`, and `enforce_notification_block_policy()` ([`up.sql:19-28`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L19-L28), [`up.sql:707-821`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L707-L821)) | **RESOLVED (`SQL-03`)** |
| `messages.id`, `sender_id`, `receiver_id` | **`UUID`** | `.eq('id', 'not-a-uuid')` -> `22P02` | `enforce_message_update_security()` enforces `public.is_blocked`, locks immutable metadata columns, and restricts content edits to `sender_id` ([`up.sql:298-358`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L298-L358)) | **RESOLVED (`SQL-08`)** |
| `storage.objects.owner` & `name` | `owner`: `UUID` (`NULL` on all 89 live files); `name`: `TEXT` (`<uuid>/<folder>/<file>`) | Recursive `.list()` across all 13 user folders in `app-files` (`89` files, all `owner: null`) | Created `public.storage_object_owner_uuid(p_name TEXT, p_owner UUID)` extracting `(storage.foldername(p_name))[1]` when `p_owner IS NULL`, plus both `AS PERMISSIVE` and `AS RESTRICTIVE` policies on `storage.objects` ([`up.sql:195-218`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L195-L218), [`up.sql:908-979`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L908-L979)) | **RESOLVED (`SQL-05`)** |

---

## 2. Detailed Resolution of SQL Findings (`SQL-01` Through `SQL-12`)

### `[SQL-01]` RESOLVED — Safe UUID/TEXT Handling in `moderation_logs` Backfill
- **File & Lines:** [`migrations/20261011_block_system_hardening_up.sql:46-108`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L46-L108)
- **Fix Applied:**
  - Created `public.try_parse_uuid(p_input TEXT) RETURNS UUID IMMUTABLE` that trims input, validates UUID format, and catches `invalid_text_representation` (`22P02`) returning `NULL` on any malformed or non-UUID identifier.
  - Added `public.extract_block_reason(p_raw TEXT)` that safely parses JSON-encoded `moderation_logs.reason` strings (`{"reason":"...","name":"..."}`) catching any JSON parse errors.
  - Backfill CTE `normalized_events` converts both `ml.user_id::text` and `ml.target_id` via `public.try_parse_uuid(...)`, filters `WHERE blocker_uuid IS NOT NULL AND blocked_uuid IS NOT NULL AND blocker_uuid <> blocked_uuid`, joins `auth.users` on both sides to prevent FK violations, and inserts only records whose latest chronological event (`ORDER BY blocker_uuid, blocked_uuid, created_at DESC, id DESC`) is `category = 'USER_BLOCK' AND status = 'blocked'`.

### `[SQL-02]` RESOLVED — `public.record_story_view` Uses `UUID[]` With Row-Level Locking
- **File & Lines:** [`migrations/20261011_block_system_hardening_up.sql:243-295`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L243-L295)
- **Fix Applied:**
  - Declared `v_viewed_by UUID[]` matching the live `public.stories.viewed_by` column (`_uuid`).
  - Acquires a row-level lock (`SELECT user_id, COALESCE(viewed_by, ARRAY[]::UUID[]) INTO v_story_owner, v_viewed_by FROM public.stories WHERE id = p_story_id FOR UPDATE`) to prevent concurrent race conditions when multiple viewers open a story simultaneously.
  - Enforces mutual block check (`IF public.is_blocked(v_viewer_id, v_story_owner) THEN RAISE EXCEPTION ... USING ERRCODE = '42501'`) and prevents duplicate entries via `IF NOT (v_viewer_id = ANY(v_viewed_by))` before appending `v_viewer_id` with `array_append(v_viewed_by, v_viewer_id)`.

### `[SQL-03]` RESOLVED — Full Support for Both Post Comments (`post_id`) and Reel Comments (`reel_id`)
- **File & Lines:** [`migrations/20261011_block_system_hardening_up.sql:19-28`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L19-L28), [`up.sql:361-462`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L361-L462), [`up.sql:707-821`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L707-L821)
- **Fix Applied:**
  - Ensured `public.comments.reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE` and index `idx_comments_reel_id` exist.
  - Updated `comments_select_auth`, `comments_insert_auth`, and `comments_delete_own` policies to authorize comments belonging to either a post (`comments.post_id IS NOT NULL`) or a reel (`comments.reel_id IS NOT NULL`), verifying in both cases that the caller is not mutually blocked with either the comment author or the post/reel owner.
  - Updated `public.handle_comment_count()` trigger function to maintain `comments_count` atomically on both `public.posts` (when `post_id IS NOT NULL`) and `public.reels` (when `reel_id IS NOT NULL`).
  - Updated `public.create_notification_secure` and `public.enforce_notification_block_policy()` to check both `public.posts` and `public.reels` when `post_id` references a post or reel.

### `[SQL-04]` RESOLVED — `public.is_blocked` Fails Closed (`RETURN TRUE`) for Unauthorized Callers & Invalid Inputs
- **File & Lines:** [`migrations/20261011_block_system_hardening_up.sql:113-163`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L113-L163)
- **Fix Applied:**
  - If `user_a IS NULL OR user_b IS NULL`, returns **`TRUE`** (fail-closed: restricted).
  - If `user_a = user_b`, returns `FALSE` (a user cannot block themselves).
  - Determines whether the caller is a trusted database/service context via `v_jwt_role = 'service_role' OR (COALESCE(current_setting('request.jwt.claims', true), '') = '' AND SESSION_USER IN ('postgres', 'supabase_admin'))`. (Never uses `CURRENT_USER` because `CURRENT_USER` inside a `SECURITY DEFINER` function is always the function owner).
  - If not a service call:
    - If `v_caller IS NULL`, returns **`TRUE`** (fail-closed for unauthenticated callers).
    - If `v_caller <> user_a AND v_caller <> user_b`, returns **`TRUE`** (fail-closed for third-party pair queries: denies access inside `NOT public.is_blocked(...)` and returns a constant `TRUE` regardless of whether `user_a` and `user_b` have blocked each other, preventing third-party block-graph enumeration).
  - Revoked execution from `PUBLIC` and `anon` (`REVOKE ALL ON FUNCTION public.is_blocked(UUID, UUID) FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role;`).

### `[SQL-05]` RESOLVED — Path-Based Ownership & `AS RESTRICTIVE` Policies on `storage.objects`
- **File & Lines:** [`migrations/20261011_block_system_hardening_up.sql:195-218`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L195-L218), [`up.sql:908-979`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L908-L979)
- **Fix Applied:**
  - Created `public.storage_object_owner_uuid(p_name TEXT, p_owner UUID) RETURNS UUID` which extracts the `<user_uuid>` from the first path segment `(storage.foldername(p_name))[1]` via `public.try_parse_uuid(...)` and falls back to `p_owner` only if the path prefix is not a UUID.
  - Dropped all 23 legacy permissive policies on `storage.objects` (including `"Public can view app-files"`, `"Public Access"`, `"Allow public read access"`, etc.).
  - Created permissive policies `storage_objects_select_auth`, `storage_objects_insert_own`, `storage_objects_update_own`, and `storage_objects_delete_own` requiring path-prefix ownership (`(storage.foldername(name))[1] = auth.uid()::text`) for all writes/deletes and non-blocked status (`NOT public.is_blocked(auth.uid(), public.storage_object_owner_uuid(name, owner))`) for reads.
  - Created `storage_objects_restrict_blocked` **`AS RESTRICTIVE` `FOR ALL` `TO PUBLIC`** so that even if any permissive policy is ever added via the Supabase Dashboard, PostgreSQL ANDs it with `storage_objects_restrict_blocked` and denies anonymous callers, unowned paths, and mutually blocked users.

### `[SQL-06]` RESOLVED — Narrowly Scoped Bilateral Block Helper RPC `public.get_my_restricted_user_ids()`
- **File & Lines:** [`migrations/20261011_block_system_hardening_up.sql:168-190`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L168-L190)
- **Fix Applied:**
  - Kept `public.blocked_users` `SELECT` policy restricted to `auth.uid() = blocker_id` (`blocked_users_select_own`) so `blocked_id` cannot query `public.blocked_users` to inspect `reason`, `created_at`, or `id`.
  - Created `public.get_my_restricted_user_ids() RETURNS SETOF UUID` (`SECURITY DEFINER`, zero parameters, bound strictly to `auth.uid()`) which returns the flat set of `UUID`s where `blocker_id = auth.uid() OR blocked_id = auth.uid()`.
  - Integrated `supabase.rpc('get_my_restricted_user_ids')` into both [`server/moderation/blockService.ts:346-365`](file:///c:/remix-verixa/server/moderation/blockService.ts#L346-L365) (`syncFromSupabase`) and [`src/lib/supabaseServices.ts:2216-2231`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L2216-L2231) (`fetchUserBlockRelations`).

### `[SQL-07]` RESOLVED — Complete, Non-Destructive Rollback Script Without Anonymous Bypasses
- **File & Lines:** [`migrations/20261011_block_system_hardening_down.sql:1-561`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_down.sql#L1-L561)
- **Fix Applied:**
  - Covers all **14 tables** modified by the forward migration (`blocked_users`, `profiles`, `posts`, `reels`, `stories`, `story_likes`, `likes`, `post_likes`, `saved_posts`, `comments`, `follows`, `messages`, `notifications`, `moderation_logs`, and `storage.objects`).
  - Drops all triggers and helper functions introduced by `up.sql` (`trg_blocked_user_cleanup`, `on_user_blocked_cleanup()`, `trg_enforce_message_update_security`, `enforce_message_update_security()`, `trg_enforce_notification_block_policy`, `enforce_notification_block_policy()`, `get_my_restricted_user_ids()`, `storage_object_owner_uuid(TEXT, UUID)`, `extract_block_reason(TEXT)`, `try_parse_uuid(TEXT)`).
  - Restores baseline functions (`is_blocked`, `record_story_view`, `create_notification_secure`, `log_moderation_entry`, `handle_comment_count`) with safe `UUID[]` and `reel_id` handling and `REVOKE ALL ... FROM PUBLIC, anon`.
  - **Zero anonymous bypasses:** `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` is preserved and zero `auth.uid() IS NULL` or `"Public can view"` policies exist anywhere in `down.sql`.
  - Clearly documents irreversible data changes in the header comments (`down.sql:11-21`): backfilled `blocked_users` rows are preserved, and `follows`/`notifications` deleted when blocks were created are not re-inserted on rollback.

### `[SQL-08]` through `[SQL-12]` RESOLVED — Additional Trigger, Legacy Policy, `post_likes`, Notification, and Grant Hardening
- **`SQL-08` (`enforce_message_update_security` trigger):** [`up.sql:298-358`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L298-L358) blocks any message update when `public.is_blocked(OLD.sender_id, OLD.receiver_id)` is true, locks `id`, `sender_id`, `receiver_id`, `conversation_id`, `created_at`, `reply_to_message_id`, `is_forwarded`, `forwarded_from_message_id`, `message_type`, `media_name`, `media_size`, `is_voice`, and `voice_duration`, and forbids non-senders (`v_caller <> OLD.sender_id`) from altering `text`, `media_url`, `edited_at`, or `deleted_at`.
- **`SQL-09` (Dynamic `pg_policies` purge):** [`up.sql:501-531`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L501-L531) loops over `pg_policies` across all 13 `public` tables and executes `DROP POLICY IF EXISTS` dynamically so no legacy permissive policy from [`supabase_schema.sql`](file:///c:/remix-verixa/supabase_schema.sql) can survive and OR-bypass the hardened policies.
- **`SQL-10` (`public.post_likes` coverage):** [`up.sql:33-41`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L33-L41) and [`up.sql:655-685`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L655-L685) enable RLS and apply full mutual-block policies (`post_likes_select_auth`, `post_likes_insert_auth`, `post_likes_delete_own`) to `public.post_likes`.
- **`SQL-11` (`enforce_notification_block_policy` & `delete_expired_stories`):** [`up.sql:433-495`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L433-L495) enforces a `BEFORE INSERT OR UPDATE` trigger on `public.notifications` blocking any notification between mutually blocked users, and restricts `delete_expired_stories()` to authenticated/service callers.
- **`SQL-12` (Revoke `anon` table grants):** [`up.sql:533-536`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L533-L536) executes `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` and `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;`.
