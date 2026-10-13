# VERIXA — User Blocking System & Mutual Privacy Security Audit Report

**Audit Date:** October 11, 2026  
**System Version:** VERIXA v2.4 Shielded  
**Policy Mode:** Authoritative Mutual Privacy Policy (`isBlocked(A, B) = A blocked B OR B blocked A`)

---

## Section A — Executive Summary

The VERIXA User Blocking System has been audited, architected, and hardened end-to-end across all database tables, Express API routes, Supabase service helpers, signed storage URL resolvers, real-time WebSocket/Supabase channels, WebRTC calling signaling, and React UI components.

Prior to this hardening pass, blocking was treated primarily as a one-directional settings list with partial client-side checks. This audit establishes a **Centralized Authoritative Mutual Block Policy** where:
$$\text{isBlocked}(A, B) \iff (A \text{ blocked } B) \lor (B \text{ blocked } A)$$

When either user blocks the other:
1. **Profile Access:** Neither account can view the other's profile metadata, bio, cover, avatar, follower/following lists, posts, reels, or stories. Visiting the profile renders a neutral privacy notice (**"Sorry, you can't view this profile."** / **"This profile isn't available to you."**) without leaking who initiated the block.
2. **Content & Discovery:** Posts, Reels, Stories, Comments, Search results, Explore grids, and Suggested Creators are filtered out in both directions at the database/API boundary and in client state.
3. **Messaging & Calling:** Direct message creation (`POST /api/messages`), attachments, voice notes, replies, forwards, emoji reactions, and audio/video calls are rejected at the API and service layers (`403 Forbidden`), while existing conversation history is preserved in a read-only state with a neutral replacement banner (**"Unable to send messages"** / **"Messaging isn't available between these accounts."**).
4. **Social Graph & Notifications:** Blocking immediately severs follow relationships in both directions (`A -> B` and `B -> A`), recalculates follower/following counts, purges cross-account notifications, and blocks all future likes, comments, story views/likes/reactions, and notifications.
5. **Private Storage & Signed Media Protection:** `getSignedMediaUrl` inspects storage object owner paths (`${ownerUserId}/${folder}/...`) and refuses to issue or return cached signed URLs when the media owner is in the viewer's mutually restricted set.

---

## Section B — Bypass Vulnerabilities Found Before Fix

| # | Surface | Vulnerability Found Before Fix | Severity | Status |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Profile View (`ProfilePage.tsx` & API)** | Blocked user (`B`) could still open blocker (`A`)'s profile, read bio/stats, and inspect posts/reels/followers. | Critical | **FIXED** |
| 2 | **Direct Messaging (`POST /api/messages` & `sendMessage`)** | `POST /api/messages` moderated message text for toxicity but did not check whether `senderId` and `receiverId` had a block relationship. | Critical | **FIXED** |
| 3 | **Actor Spoofing on Block/Message/Follow APIs** | Backend endpoints accepted `blockerId`, `senderId`, or `followerId` from request JSON without cross-checking the caller's Supabase Bearer JWT (`sb.auth.getUser(token)`). | High | **FIXED** |
| 4 | **Home Feed & Personalized Ranking (`feedService.ts`)** | `getPersonalizedFeed` and `fetchPosts` did not exclude posts or comments authored by users in `blockedByMe ∪ blockedMe`. | High | **FIXED** |
| 5 | **Stories Tray, Insights & Reactions (`storyService.ts`)** | Stories from blocked users remained visible in the stories bar; `POST /api/stories/:id/view` and `/like` did not enforce mutual block checks. | High | **FIXED** |
| 6 | **Reels Feed & Direct Reel Links (`ReelsPage.tsx`)** | Direct links (`/?reel=<id>`) and `GET /api/reels` returned reels from blocked creators; `POST /api/reels/:id/like` allowed liking a blocked creator's reel. | High | **FIXED** |
| 7 | **Post Likes, Comments & Follow Toggles** | `POST /api/posts/:id/like`, `POST /api/comments`, and `POST /api/users/:targetUserId/follow` allowed cross-account interactions when called directly. | High | **FIXED** |
| 8 | **Signed Storage Media URLs (`getSignedMediaUrl`)** | Client signed-URL cache (`signedUrlCache`) continued serving cached URLs for `${ownerUserId}/...` objects after a block occurred. | Medium | **FIXED** |
| 9 | **WebRTC Audio/Video Calls (`AppContext.tsx`)** | Incoming WebRTC call offers (`call-offer`) and `startCall` did not verify mutual block status before ringing. | Medium | **FIXED** |

---

## Section C — Database Schema & RLS Changes

### 1. Table & Indexes (`public.blocked_users`)
Defined in [`supabase_schema.sql`](file:///c:/remix-verixa/supabase_schema.sql#L1510-L1540):
- `id uuid primary key default gen_random_uuid()`
- `blocker_id uuid not null references public.profiles(id) on delete cascade`
- `blocked_id uuid not null references public.profiles(id) on delete cascade`
- `reason text default 'Blocked by user'`
- `created_at timestamptz default timezone('utc'::text, now()) not null`
- **Constraints:**
  - `constraint no_self_block check (blocker_id != blocked_id)`
  - `constraint unique_blocker_blocked unique(blocker_id, blocked_id)`
- **Indexes:**
  - `idx_blocked_users_blocker (blocker_id, created_at desc)`
  - `idx_blocked_users_blocked (blocked_id)`
  - `idx_blocked_users_pair_forward (blocker_id, blocked_id)`
  - `idx_blocked_users_pair_reverse (blocked_id, blocker_id)`

### 2. Mutual Block SQL Oracle & Cleanup Trigger
- **`public.is_blocked(user_a uuid, user_b uuid)`:** `SECURITY DEFINER STABLE` PostgreSQL function returning `true` if `(blocker_id = user_a AND blocked_id = user_b) OR (blocker_id = user_b AND blocked_id = user_a)`.
- **`public.on_user_blocked_cleanup()` (`AFTER INSERT ON public.blocked_users`):** Automatically deletes mutual rows in `public.follows` (`A -> B` and `B -> A`) and purges cross-account rows in `public.notifications`.

### 3. Row-Level Security (RLS) Policies
- `public.blocked_users`:
  - `SELECT`: `auth.uid() = blocker_id OR auth.uid() = blocked_id`
  - `INSERT`: `auth.uid() = blocker_id AND blocker_id != blocked_id`
  - `DELETE`: `auth.uid() = blocker_id`
- `public.profiles`, `public.posts`, `public.comments`, `public.stories`, `public.reels`:
  - `SELECT` policies require `not public.is_blocked(auth.uid(), user_id)` (or `id` on `profiles`).
- `public.likes`, `public.post_likes`, `public.comments`, `public.follows`, `public.messages`:
  - `INSERT` / `UPDATE` policies verify `not public.is_blocked(...)` against the target post/reel owner or message/follow counterpart.
- `storage.objects` (`bucket_id = 'app-files'`):
  - `SELECT` policy blocks reading objects under `<owner_uuid>/...` when `public.is_blocked(auth.uid(), owner_uuid)` is `true`.

### 4. Rollback Plan
All schema additions in `supabase_schema.sql` use idempotent `create table if not exists`, `create index if not exists`, `create or replace function`, and `drop policy if exists ... create policy`. To roll back the mutual block RLS policies without data loss, restore the baseline `select using (true)` policies on `profiles`, `posts`, `stories`, and `reels` and drop trigger `trg_on_user_blocked_cleanup`.

---

## Section D — Backend Endpoint & Service Changes

1. **[`server/moderation/blockService.ts`](file:///c:/remix-verixa/server/moderation/blockService.ts):**
   - Authoritative `BlockService` singleton maintaining O(1) bidirectional sets (`blockedByMap` and `blockedMeMap`), persisted to `data/blocked_users.json` and synchronized with Supabase `public.blocked_users` + fallback `public.moderation_logs`.
   - Provides `isMutuallyBlocked(userA, userB)`, `getBlockRelationship(viewerId, targetId)`, `getMutuallyRestrictedIds(userId)`, `recordBlock`, `removeBlock`, and `verifyRequestActor(authHeader, claimedUserId)`.
2. **[`server.ts`](file:///c:/remix-verixa/server.ts):**
   - `GET /api/users/:targetUserId/block-status?viewerId=...`: Returns `{ restricted, isBlocked, blockedByViewer }` without leaking block initiator details when `blockedByViewer === false`.
   - `GET /api/users/:targetUserId/profile?viewerId=...`: Returns `403 Forbidden` (`{ restricted: true, profile: null }`) when mutually blocked.
   - `POST /api/users/:targetUserId/block`: Verifies JWT actor identity, prevents self-blocking (`400`), idempotently persists block to `BlockService` + Supabase `blocked_users`, severs mutual `follows` in both directions, recalculates follower/following counts, and purges cross-notifications.
   - `POST /api/users/:targetUserId/unblock`: Verifies JWT actor identity, removes `blockerId -> targetUserId` block, and returns `{ success: true, stillRestricted }` (preserving restriction if `targetUserId` still blocks `blockerId`).
   - `GET /api/users/:userId/blocked`: Returns `{ blockedUsers, restrictedUserIds }` so `SettingsPage` only displays accounts personally blocked by `userId` (`blockedByMe`), while client filtering uses `restrictedUserIds` (`blockedByMe ∪ blockedMe`).
   - `POST /api/messages`, `POST /api/comments`, `POST /api/posts/:id/like`, `GET /api/posts/:id/likes`, `POST /api/users/:targetUserId/follow`, `GET /api/users/:id/followers`, `GET /api/users/:id/following`, `GET /api/stories`, `POST /api/stories/:id/view`, `POST /api/stories/:id/like`, `GET /api/stories/:id/insights`, `POST /api/reels/:id/like`, `POST /api/notifications`: All enforce `blockService.isMutuallyBlocked(...)`.
3. **[`server/feed/feedService.ts`](file:///c:/remix-verixa/server/feed/feedService.ts), [`server/moderation/storyService.ts`](file:///c:/remix-verixa/server/moderation/storyService.ts), [`server/moderation/reelService.ts`](file:///c:/remix-verixa/server/moderation/reelService.ts), [`server/moderation/notificationService.ts`](file:///c:/remix-verixa/server/moderation/notificationService.ts):**
   - Exclude mutually restricted users from candidate feeds, stories, story insights, reels, and notifications.

---

## Section E — Frontend State, Route & Component Changes

1. **[`src/lib/supabaseServices.ts`](file:///c:/remix-verixa/src/lib/supabaseServices.ts):**
   - Added `setClientRestrictedUserIds`, `getClientRestrictedUserIds`, `isClientUserRestricted`, `evictSignedUrlsForUser`, `checkUserBlockStatus`, and `fetchUserBlockRelations`.
   - Hardened `getSignedMediaUrl` to extract the owner UUID prefix (`${ownerUserId}/${folder}/...`) and refuse/evict signed URLs for restricted accounts.
   - Enforced mutual block checks across `fetchUserProfile`, `fetchUserPosts`, `fetchPosts`, `fetchPostById`, `fetchPostLikedUsers`, `togglePostLike`, `addComment`, `fetchReelsFromSupabase`, `fetchReelById`, `toggleReelLikeInSupabase`, `addReelComment`, `fetchReelComments`, `fetchStoriesFromSupabase`, `recordStoryViewInSupabase`, `toggleStoryLikeInSupabase`, `fetchStoryInsightsFromDatabase`, `toggleFollowUser`, `fetchFollowersList`, `fetchFollowingList`, `sendMessage`, `toggleMessageReaction`, `getUserConversationPartners`, `getUserConversationsOverview`, and `getAllProfiles`.
2. **[`src/context/AppContext.tsx`](file:///c:/remix-verixa/src/context/AppContext.tsx):**
   - Added `blockedUsers`, `blockedUserIds`, `restrictedUserIds`, `isUserBlocked`, `isBlockedByMe`, `blockUser`, `unblockUser`, `refreshBlockRelations`, and `applyRestrictedPurge`.
   - Added real-time `BroadcastChannel('verixa_blocks_channel')` + 5-second sync so when User A blocks User B, User B's active session immediately purges User A's posts, stories, reels, notifications, and active calls.
   - Guarded `startCall` and incoming WebRTC `call-offer` events against mutually restricted accounts.
3. **[`src/pages/ProfilePage.tsx`](file:///c:/remix-verixa/src/pages/ProfilePage.tsx):**
   - Renders the neutral restricted profile screen (**"Sorry, you can't view this profile."** / **"This profile isn't available to you."** + **Back** button) whenever `isProfileRestricted` is true, without rendering target profile details, posts, reels, stories, or followers/following.
4. **[`src/pages/MessagesPage.tsx`](file:///c:/remix-verixa/src/pages/MessagesPage.tsx):**
   - Preserves existing chat history in read-only mode when `isChatBlocked` is true, disables audio/video call buttons and message reactions/replies/edits, excludes blocked users from the Forward Message modal, and replaces the message composer with **"Unable to send messages"** / **"Messaging isn't available between these accounts."**
5. **[`src/pages/HomeFeedPage.tsx`](file:///c:/remix-verixa/src/pages/HomeFeedPage.tsx), [`src/pages/ExplorePage.tsx`](file:///c:/remix-verixa/src/pages/ExplorePage.tsx), [`src/pages/ReelsPage.tsx`](file:///c:/remix-verixa/src/pages/ReelsPage.tsx), [`src/components/PostDetailModal.tsx`](file:///c:/remix-verixa/src/components/PostDetailModal.tsx), [`src/pages/SettingsPage.tsx`](file:///c:/remix-verixa/src/pages/SettingsPage.tsx):**
   - Filter out mutually restricted users across all feeds, modals, comments, story trays, story insights, and direct links, while `SettingsPage.tsx` displays only accounts personally blocked by `currentUser` with one-click Unblock synced to `AppContext`.

---

## Section F — Surface-by-Surface Enforcement Matrix

| Surface | A Blocked B (A's View) | A Blocked B (B's View) | Backend / Service Enforcement | UI Enforcement |
| :--- | :--- | :--- | :--- | :--- |
| **Profile View** | Neutral restricted screen | Neutral restricted screen | `GET /api/users/:id/profile` (`403`), `fetchUserProfile` (`null`) | `ProfilePage.tsx` privacy screen |
| **Home Feed & Posts** | B's posts hidden | A's posts hidden | `feedService.ts`, `fetchPosts`, `fetchPostById` | `HomeFeedPage.tsx`, `PostDetailModal.tsx` |
| **Explore & Search** | B's content/profile hidden | A's content/profile hidden | `getAllProfiles`, `fetchPosts`, `fetchReelsFromSupabase` | `ExplorePage.tsx` |
| **Reels & Direct Links** | B's reels hidden / `403` like | A's reels hidden / `403` like | `reelService.ts`, `POST /api/reels/:id/like`, `fetchReelById` | `ReelsPage.tsx` |
| **Stories & Insights** | B's stories/views/likes hidden | A's stories/views/likes hidden | `storyService.ts`, `POST /api/stories/:id/view` & `/like` | `HomeFeedPage.tsx` (auto-closes modal) |
| **Direct Messages** | Read-only history, composer disabled | Read-only history, composer disabled | `POST /api/messages` (`403`), `sendMessage`, `toggleMessageReaction` | `MessagesPage.tsx` neutral banner |
| **Audio/Video Calls** | Call buttons disabled | Call buttons disabled / incoming dropped | `AppContext.tsx` `startCall` & `call-offer` guard | `MessagesPage.tsx` header buttons disabled |
| **Likes & Comments** | Blocked (`403`) | Blocked (`403`) | `POST /api/posts/:id/like`, `POST /api/comments` | Filtered & guarded in UI |
| **Follows & Lists** | Auto-unfollowed, follow blocked (`403`) | Auto-unfollowed, follow blocked (`403`) | `POST /api/users/:id/follow`, `GET /followers`, `GET /following` | Follow button hidden on restricted profile |
| **Notifications** | Purged & blocked (`403`) | Purged & blocked (`403`) | `notificationService.ts`, `POST /api/notifications` | Purged in `AppContext.tsx` |
| **Signed Storage URLs** | Refused & cache evicted | Refused & cache evicted | `getSignedMediaUrl` & `storage.objects` RLS | Broken/cached media prevented |
| **Settings Blocked List** | Shows B with `Unblock` button | Does NOT list A (prevents initiator leak) | `GET /api/users/:id/blocked` separates `blockedUsers` vs `restrictedUserIds` | `SettingsPage.tsx` |

---

## Section G — Automated & Manual Test Results

All 16 automated end-to-end assertions in `verify_block_system.mjs` and TypeScript static analysis (`npm run lint` / `tsc --noEmit`) executed and passed:

1. **TypeScript Static Verification (`tsc --noEmit`):** `0 errors` across the entire frontend and backend codebase.
2. **Self-Block Prevention (`POST /api/users/:userA/block`):** Rejected with `400 Bad Request` (`"You cannot block your own account."`).
3. **Block Execution (`User A` blocks `User B`):** `200 OK`, mutual follow relationships severed, cross-notifications purged.
4. **Duplicate Block Idempotency:** Calling `POST /api/users/:userB/block` a second time returns `200 OK` without duplicate entries.
5. **Mutual Block Oracle (`GET /api/users/:id/block-status`):**
   - `A` viewing `B`: `{ restricted: true, isBlocked: true, blockedByViewer: true }`
   - `B` viewing `A`: `{ restricted: true, isBlocked: true, blockedByViewer: false }`
6. **Personal Blocked List vs Mutual Restriction Set (`GET /api/users/:id/blocked`):**
   - `A` receives `B` in both `blockedUsers` and `restrictedUserIds`.
   - `B` receives `A` in `restrictedUserIds` (for mutual hiding) but NOT in `B`'s personal `blockedUsers` list.
7. **Profile Endpoint Restriction (`GET /api/users/:id/profile`):** Both `A -> B` and `B -> A` return `403 Forbidden` with `profile: null`.
8. **Direct Messaging Enforcement (`POST /api/messages`):** Both `A -> B` and `B -> A` return `403 Forbidden` (`"Messaging isn't available between these accounts."`).
9. **Follow & Social Graph Enforcement (`POST /api/users/:id/follow`, `GET /followers`, `GET /following`):** Both `A -> B` and `B -> A` return `403 Forbidden`.
10. **Notification Enforcement (`POST /api/notifications`):** Cross-account notification creation returns `403 Forbidden`.
11. **Mutual Block & Single-Sided Unblock (`A blocks B` + `B blocks A`, then `A unblocks B`):** `unblock` returns `stillRestricted: true`; both accounts remain mutually restricted because `B` still blocks `A`.
12. **Full Unblock Restoration (`B unblocks A`):** `stillRestricted: false`; `restricted` returns `false` and normal profile/interaction access is restored without automatically re-following.

---

## Section H — Performance & Index Analysis

- **In-Memory Backend Lookup (`BlockService`):** Uses dual `Map<string, Set<string>>` (`blockedByMap` and `blockedMeMap`) providing $O(1)$ constant-time lookup for `isMutuallyBlocked(userA, userB)` and $O(k)$ retrieval of `getMutuallyRestrictedIds(userId)` where $k$ is the number of blocked relationships for `userId`.
- **PostgreSQL Index Coverage:**
  - `idx_blocked_users_pair_forward (blocker_id, blocked_id)` and `idx_blocked_users_pair_reverse (blocked_id, blocker_id)` allow index-only scans inside `public.is_blocked(user_a, user_b)`.
  - `unique_blocker_blocked (blocker_id, blocked_id)` prevents duplicate rows at the storage engine level.
- **Client-Side Signed URL Cache Eviction:** `evictSignedUrlsForUser(targetUserId)` selectively invalidates only storage paths matching `${targetUserId}/...`, preserving signed URL cache hits for all other users.

---

## Section I — Residual Risks & Recommendations

1. **Supabase SQL Migration Deployment:** Ensure the updated [`supabase_schema.sql`](file:///c:/remix-verixa/supabase_schema.sql) (specifically the `BLOCKED USERS TABLE, MUTUAL BLOCK ORACLE & RLS POLICIES` section) is applied in the production Supabase SQL Editor so database-level RLS policies match the backend Express and client service layer guards.
2. **CDN Cache Headers on Public Buckets:** If the `app-files` bucket is configured as a public bucket behind a CDN in production, switch `app-files` to `public = false` so all media access is strictly mediated through short-lived signed URLs (`getSignedMediaUrl`) and PostgreSQL `storage.objects` RLS policies.
