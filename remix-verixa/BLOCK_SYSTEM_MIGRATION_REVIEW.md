# VERIXA — SUPABASE MIGRATION REVIEW PACKAGE (PHASE 2 STOP GATE)

**Date:** 2026-10-11  
**Project:** `C:\remix-verixa` (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Forward Migration Script:** [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql)  
**Rollback Script:** [`migrations/20261011_block_system_hardening_down.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_down.sql)  
**Status:** **PREPARED FOR REVIEW ONLY — NOT EXECUTED ON LIVE SUPABASE**

---

## 1. Evidence That the Migration Matches the Actual Live Schema

Before authoring [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql), read-only schema probes were executed against the live Supabase project (`https://jnbaumemwxydjktwedtz.supabase.co`). Several discrepancies between the repository's `supabase_schema.sql` / `supabase_block_enforcement_migration.sql` and the actual live database were identified and reconciled:

| Table / Object | Repository SQL Assumption | Actual Live Supabase Schema (Verified Read-Only) | How `20261011_block_system_hardening_up.sql` Reconciles It |
| :--- | :--- | :--- | :--- |
| `public.likes` vs `public.post_likes` | `supabase_block_enforcement_migration.sql` referenced `public.post_likes` | `public.post_likes` **does not exist** (`404 PGRST205`). Live post likes are stored in `public.likes` (`id, post_id, user_id, created_at`). | Policies and `on_user_blocked_cleanup()` target `public.likes` (not `post_likes`). |
| `public.stories` vs `public.story_views` | `supabase_schema.sql` referenced `public.story_views` | `public.story_views` **does not exist** (`404 PGRST205`). Live story views are stored in `public.stories.views_count` (int) and `public.stories.viewed_by` (jsonb). | Adds `SECURITY DEFINER` RPC `public.record_story_view(p_story_id UUID)` that updates `public.stories` after verifying `NOT public.is_blocked(auth.uid(), user_id)`, and locks direct `UPDATE` on `public.stories` to `auth.uid() = user_id`. |
| `public.post_tags` & `public.user_reputation` | Referenced in legacy schema scripts | **Do not exist** on live DB (`404 PGRST205`). Tags are stored in `public.posts.tags`. | Omitted non-existent table references so the migration executes cleanly without `42P01 undefined_table` errors. |
| `public.notifications` | Some server endpoints previously queried `user_id, actor_id, title, body, is_read` | Live columns are `id, recipient_id, sender_id, type, post_id, message, read, created_at`. | All policies and `on_user_blocked_cleanup()` use `recipient_id` and `sender_id`. |
| `public.messages` | Extended columns (`edited_at`, `deleted_at`, `reply_to_message_id`, `is_forwarded`, `reactions`) assumed in `supabase_messages_upgrade.sql` | Live table currently has `[id, sender_id, receiver_id, text, media_url, status, delivered_at, read_at, is_voice, voice_duration, created_at]`. | Step 1 of migration runs `ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ...` non-destructively before creating message triggers/policies. |
| `public.moderation_logs` | Assumed `type` or `content` columns in some queries | Live columns are `[id, analysis_id, content_id, content_type, target_id, target_type, user_id, status, decision, category, confidence, reason, model, model_version, scores, labels, evidence, created_at]`. | Backfill query inspects `ml.user_id`, `ml.target_id`, `ml.category IN ('USER_BLOCK', 'USER_UNBLOCK')`, `ml.reason`, and `ml.created_at`. |

---

## 2. Current-Versus-Proposed RLS Policy Matrix

| Table / Function | Current Live Policy / Behavior | Security Flaw in Current Live State | Proposed Policy / Definition in `20261011_block_system_hardening_up.sql` |
| :--- | :--- | :--- | :--- |
| **`public.is_blocked(user_a, user_b)`** | `SECURITY DEFINER`, executable by `anon` & `authenticated`, no `auth.uid()` caller check, scans `moderation_logs` | Any caller (including `anon`) can enumerate whether any two users `(A, B)` have blocked each other; `moderation_logs` join degrades row-level query performance. | `SECURITY DEFINER SET search_path = public, pg_temp`; revokes `PUBLIC`/`anon`; requires `auth.uid() = user_a OR auth.uid() = user_b OR auth.role() = 'service_role'`; queries only indexed `public.blocked_users`. |
| **`public.blocked_users`** | `SELECT`: `auth.uid() = blocker_id OR auth.uid() = blocked_id`<br>`INSERT`: `auth.uid() = blocker_id`<br>`DELETE`: `auth.uid() = blocker_id`<br>(No `UPDATE` policy) | Blocked target (`blocked_id`) can query `blocked_users` directly to read private `reason` and see who blocked them; `UPSERT` fails due to missing `UPDATE` policy. | `SELECT`: `auth.uid() = blocker_id`<br>`INSERT`: `auth.uid() = blocker_id AND blocker_id <> blocked_id`<br>`UPDATE`: `auth.uid() = blocker_id`<br>`DELETE`: `auth.uid() = blocker_id` |
| **`public.profiles`** | `SELECT`: `auth.uid() IS NULL OR NOT public.is_blocked(auth.uid(), id)` | Anonymous requests (`auth.uid() IS NULL`) bypass block filtering and can scrape all profiles. | `SELECT` (`TO authenticated`): `auth.uid() = id OR NOT public.is_blocked(auth.uid(), id)`<br>`INSERT`/`UPDATE`: `auth.uid() = id` |
| **`public.posts`** | `SELECT`: `auth.uid() IS NULL OR NOT public.is_blocked(auth.uid(), user_id)` | Anonymous requests bypass block filtering and can read all posts. | `SELECT` (`TO authenticated`): `auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id)`<br>`INSERT`/`UPDATE`/`DELETE`: `auth.uid() = user_id` |
| **`public.reels`** | `SELECT`: `auth.uid() IS NULL OR NOT public.is_blocked(auth.uid(), user_id)` | Anonymous requests bypass block filtering and can read all reels. | `SELECT` (`TO authenticated`): `auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id)`<br>`INSERT`/`UPDATE`/`DELETE`: `auth.uid() = user_id` |
| **`public.stories`** | `SELECT`: `auth.uid() IS NULL OR NOT public.is_blocked(auth.uid(), user_id)`<br>`UPDATE`: `auth.uid() IS NOT NULL` | Anonymous requests can read all stories; **any authenticated user can `UPDATE` any user's story row** (caption, media_url, views). | `SELECT` (`TO authenticated`): `auth.uid() = user_id OR NOT public.is_blocked(auth.uid(), user_id)`<br>`INSERT`/`UPDATE`/`DELETE`: `auth.uid() = user_id` (story views recorded via `public.record_story_view` RPC). |
| **`public.story_likes`** | Permissive `SELECT` / `INSERT` | Users can view/insert likes on stories of users who blocked them. | `SELECT`/`INSERT` (`TO authenticated`): requires `NOT public.is_blocked(auth.uid(), user_id)` and `NOT public.is_blocked(auth.uid(), story.user_id)`. |
| **`public.likes`** | Permissive `SELECT` / `INSERT` | Users can view/insert likes on posts of users who blocked them. | `SELECT`/`INSERT` (`TO authenticated`): requires `NOT public.is_blocked(auth.uid(), user_id)` and `NOT public.is_blocked(auth.uid(), post.user_id)`. |
| **`public.comments`** | `SELECT`: `auth.uid() IS NULL OR ...` | Anonymous requests bypass block filtering; comments on blocked users' posts/reels not fully restricted. | `SELECT`/`INSERT` (`TO authenticated`): checks `NOT public.is_blocked(auth.uid(), comment.user_id)` AND `NOT public.is_blocked(auth.uid(), post_or_reel.user_id)`. |
| **`public.follows`** | `SELECT`: `auth.uid() IS NULL OR ...` | Anonymous requests can read social graph edges. | `SELECT` (`TO authenticated`): `NOT public.is_blocked(auth.uid(), follower_id) AND NOT public.is_blocked(auth.uid(), following_id)`<br>`INSERT`: `auth.uid() = follower_id AND follower_id <> following_id AND NOT public.is_blocked(follower_id, following_id)`<br>`DELETE`: `auth.uid() = follower_id OR auth.uid() = following_id` |
| **`public.messages`** | Multiple overlapping `UPDATE` policies (`auth.uid() = sender_id OR auth.uid() = receiver_id` without block check) | 1. Receiver can overwrite `text`, `media_url`, or `deleted_at` of sender's message.<br>2. Blocked sender/receiver can still edit historical messages. | 1. Drops all conflicting `UPDATE` policies.<br>2. Single `UPDATE` policy requiring `(auth.uid() = sender_id OR auth.uid() = receiver_id) AND NOT public.is_blocked(sender_id, receiver_id)`.<br>3. `BEFORE UPDATE` trigger `trg_enforce_message_update_security` prevents receiver from modifying `text`, `media_url`, `is_voice`, `edited_at`, or `deleted_at`, and locks `id`, `sender_id`, `receiver_id`. |
| **`public.notifications`** | `INSERT` did not verify `auth.uid() = sender_id` or mutual block | Forged cross-user notifications or notifications to blocked users. | `SELECT`: `auth.uid() = recipient_id AND (sender_id IS NULL OR NOT public.is_blocked(recipient_id, sender_id))`<br>`INSERT`: `auth.uid() = sender_id AND recipient_id <> sender_id AND NOT public.is_blocked(sender_id, recipient_id)` |
| **`public.saved_posts`** | No mutual block filter on saved posts | Saved posts from a user who subsequently blocked the viewer remain visible via `saved_posts` join. | `SELECT`/`INSERT`: requires `auth.uid() = user_id` and `NOT public.is_blocked(auth.uid(), post.user_id)`. |
| **`storage.objects`** | No mutual block check on `storage.objects` | Authenticated users can request signed URLs for objects owned by users who blocked them. | `SELECT` (`TO authenticated`): `bucket_id = 'app-files' AND (owner IS NULL OR owner = auth.uid() OR NOT public.is_blocked(auth.uid(), owner))`. |

---

## 3. Exact Migration Execution Order & SQL Diff Summary

When approved, [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql) executes inside a single transactional `BEGIN ... COMMIT` block in the following deterministic order:

1. **Step 1 — Non-Destructive Schema Additions & Indexes (Lines 15–31):**
   - Adds missing extended columns (`reply_to_message_id`, `is_forwarded`, `forwarded_from_message_id`, `message_type`, `media_name`, `media_size`, `edited_at`, `deleted_at`, `reactions`) to `public.messages` using `ADD COLUMN IF NOT EXISTS`.
   - Creates composite indexes `idx_blocked_users_blocker_blocked (blocker_id, blocked_id)` and `idx_blocked_users_blocked_blocker (blocked_id, blocker_id)`.
2. **Step 2 — Reconciled Legacy Block Backfill (Lines 39–63):**
   - Reconciles `public.moderation_logs` (`USER_BLOCK` vs. `USER_UNBLOCK`) into `public.blocked_users` (details in Section 4 below).
3. **Step 3 — Harden `SECURITY DEFINER` Functions & Triggers (Lines 74–211):**
   - Replaces `public.is_blocked(user_a, user_b)` with caller-identity authorization (`auth.uid() = user_a OR auth.uid() = user_b OR auth.role() = 'service_role'`), `SET search_path = public, pg_temp`, and revokes `PUBLIC`/`anon` execution.
   - Replaces `public.on_user_blocked_cleanup()` and attaches `trg_on_user_blocked_cleanup` on `public.blocked_users` (`AFTER INSERT`) targeting live tables (`follows`, `profiles`, `notifications`, `likes`, `story_likes`).
   - Creates `public.record_story_view(p_story_id UUID)` (`SECURITY DEFINER SET search_path = public, pg_temp`).
4. **Step 4 — Message Content Immutability Trigger (Lines 216–265):**
   - Creates `public.enforce_message_update_security()` and attaches `trg_enforce_message_update_security` (`BEFORE UPDATE ON public.messages`).
5. **Step 5 — Replace RLS Policies Across All 13 Tables (Lines 271–522):**
   - Drops legacy/conflicting policies and creates hardened `TO authenticated` policies on `blocked_users`, `profiles`, `posts`, `reels`, `stories`, `story_likes`, `likes`, `comments`, `follows`, `messages`, `notifications`, `saved_posts`, and `storage.objects`.

---

## 4. Backfill and Conflict-Reconciliation Plan

### 4.1 Live Source Record Inspection Findings
Read-only inspection of the live database prior to migration showed:
- `public.blocked_users`: `0` active rows (following test cleanup).
- `public.moderation_logs`: Contains historical `USER_BLOCK` and `USER_UNBLOCK` entries written via `log_moderation_entry`.

### 4.2 Reconciliation Rules in Step 2 of the Migration
Unlike the earlier naïve backfill that copied every `USER_BLOCK` entry from `moderation_logs` (including pairs that were later unblocked via `USER_UNBLOCK` or entries with non-UUID/deleted user IDs), Step 2 in [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L39-L63) enforces four strict reconciliation rules:
1. **Latest-State Wins (`DISTINCT ON (ml.user_id, ml.target_id) ... ORDER BY ml.created_at DESC`):** Groups by `(user_id, target_id)` and selects only the single newest log entry across `('USER_BLOCK', 'USER_UNBLOCK')`. If the newest entry is `USER_UNBLOCK`, the pair is excluded from backfill.
2. **Valid UUID Filtering:** Filters both `ml.user_id` and `ml.target_id` against `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
3. **Self-Block Exclusion:** Enforces `ml.user_id <> ml.target_id`.
4. **Referential Integrity Verification (`JOIN auth.users`):** Joins both `blocker_id` and `blocked_id` against `auth.users(id)` and uses `ON CONFLICT (blocker_id, blocked_id) DO NOTHING` so existing rows in `public.blocked_users` are never overwritten and foreign-key violations cannot occur.

---

## 5. Backup and Rollback Procedure

### 5.1 Pre-Migration Snapshot (Before Executing UP Script)
1. Export current RLS policies and function definitions (already captured in [`BLOCK_SYSTEM_INDEPENDENT_SECURITY_REVIEW.md`](file:///c:/remix-verixa/BLOCK_SYSTEM_INDEPENDENT_SECURITY_REVIEW.md) and mirrored in [`migrations/20261011_block_system_hardening_down.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_down.sql)).
2. Take a logical snapshot of `public.blocked_users` and `public.follows` counts prior to running the migration.

### 5.2 Transactional Rollback (`migrations/20261011_block_system_hardening_down.sql`)
- Because [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql) is wrapped in `BEGIN; ... COMMIT;`, any syntax or constraint error during execution automatically aborts the transaction with zero partial changes.
- If post-migration rollback is required after commit, executing [`migrations/20261011_block_system_hardening_down.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_down.sql):
  1. Drops `trg_enforce_message_update_security`, `public.enforce_message_update_security()`, and `public.record_story_view(UUID)`.
  2. Restores the prior `public.is_blocked(UUID, UUID)` definition and grants.
  3. Restores the prior RLS policies on `blocked_users`, `profiles`, `posts`, `reels`, `stories`, and `messages`.
  4. **Preserves all user accounts, posts, reels, stories, messages, likes, follows, and `blocked_users` rows** (does not drop any tables or columns).

---

## 6. Expected User-Visible Impact & Compatibility Risks

1. **Unauthenticated (`anon`) Direct PostgREST Reads Blocked:**
   - **Impact:** Unauthenticated visitors who are not signed in to a Supabase session (`auth.uid() IS NULL`) will no longer be able to query `profiles`, `posts`, `reels`, `stories`, `comments`, or `follows` directly via PostgREST. Since Verixa requires authentication before rendering the main feed/social UI (`AuthModal` / login gate), signed-in users are unaffected.
   - **Compatibility Note:** During signup (`AuthModal`), username availability checks or profile creation run after `supabase.auth.signUp` / `signInWithPassword` establishes an authenticated session (`auth.uid() = id`). If pre-signup username uniqueness checks are desired for unauthenticated visitors, a dedicated `SECURITY DEFINER` RPC `public.check_username_available(p_username TEXT) RETURNS BOOLEAN` (returning only a boolean) can be added without exposing `public.profiles` rows to `anon`.
2. **Tightened `public.blocked_users` `SELECT` Policy (`auth.uid() = blocker_id`):**
   - **Impact:** Prevents a blocked user (`blocked_id`) from querying `SELECT * FROM public.blocked_users` to see who blocked them or read the blocker's private `reason` string.
   - **Compatibility Requirement:** Because a user-scoped client for User B (`blocked_id`) can no longer see rows where `blocked_id = User B` via `SELECT * FROM public.blocked_users`, the Express backend **must** have `SUPABASE_SERVICE_ROLE_KEY` configured in its server environment (Phase 3) before or alongside applying Phase 2, OR `syncFromSupabase` can invoke `public.is_blocked(auth.uid(), target_id)` per peer. Configuring `SUPABASE_SERVICE_ROLE_KEY` on the server is the cleanest, O(1) solution.
3. **Story View Recording (`public.stories` `UPDATE` Locked to Owner):**
   - **Impact:** Non-owners can no longer run `UPDATE public.stories SET ...` directly. Story views are recorded via the new `public.record_story_view(p_story_id UUID)` RPC and the backend `POST /api/stories/:id/view` endpoint.

---

## 7. Required Deployment & Environment Configuration Changes

Before executing [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql) on the live Supabase project:
1. **Set Server-Only Secrets in Hosting Environment (Render / Local `.env`):**
   - `SUPABASE_SERVICE_ROLE_KEY=<service_role_secret>` (Server-only; never in `VITE_*`).
   - `ADMIN_SECRET_TOKEN=<32+_byte_random_hex>` (Server-only; never in `VITE_*`).
   - `NODE_ENV=production` (on Render).
2. **Deploy Phase 1 Backend & Frontend Code (`server.ts`, `server/`, `src/`):**
   - Ensures all client `/api/*` requests carry `Authorization: Bearer <access_token>` and all backend endpoints enforce strict JWT verification.
3. **Apply Phase 2 SQL Migration (`migrations/20261011_block_system_hardening_up.sql`):**
   - Run in Supabase SQL Editor inside a transaction after explicit approval.
4. **Re-run Phase 5 Verification Suite (`npx tsx tests/verify_block_remediation.mjs`):**
   - Verify all 16 existing tests + direct PostgREST RLS tests pass against the migrated database.
