# VERIXA User Block System — Independent Adversarial Security Review

**Target Project:** `c:\remix-verixa` (`C:\verixa\remix-verixa`)  
**Primary Report Audited:** [`BLOCK_SYSTEM_SECURITY_AUDIT.md`](file:///c:/remix-verixa/BLOCK_SYSTEM_SECURITY_AUDIT.md)  
**Review Mode:** Read-Only Code, SQL, Policy, Storage & Live Endpoint Audit  
**Review Date:** 2026-10-11  

---

## Executive Summary & Final Deployment Assessment

### Deployment Verdict: **NOT READY FOR PRODUCTION DEPLOYMENT**

While the recent implementation added mutual helper functions (`isMutuallyBlocked`, `isRestrictedBetweenUsers`), WebSocket signaling checks, client-side filtering in [`src/lib/supabaseServices.ts`](file:///c:/remix-verixa/src/lib/supabaseServices.ts), and SQL definitions in [`supabase_schema.sql`](file:///c:/remix-verixa/supabase_schema.sql), independent adversarial inspection and live non-destructive verification prove that the claims in [`BLOCK_SYSTEM_SECURITY_AUDIT.md`](file:///c:/remix-verixa/BLOCK_SYSTEM_SECURITY_AUDIT.md) do not hold under adversarial conditions or direct API/database access.

Specifically:
1. **Supabase is NOT the authoritative source in runtime practice (Critical):** `SUPABASE_SERVICE_ROLE_KEY` is missing in the server environment, causing [`BlockService.syncFromSupabase()`](file:///c:/remix-verixa/server/moderation/blockService.ts#L153-L280) to query `public.blocked_users` and `public.moderation_logs` using the anonymous publishable key with `auth.uid() = NULL`. Because RLS restricts those tables to `auth.uid() = blocker_id / blocked_id / user_id`, Supabase returns `[]` (0 rows). All server-side block enforcement currently depends exclusively on the local [`data/blocked_users.json`](file:///c:/remix-verixa/data/blocked_users.json) file.
2. **Database migrations in `supabase_schema.sql` have NOT been applied to the live Supabase instance (Critical):** Calling `POST /rest/v1/rpc/is_blocked` against the live Supabase project returns `404 PGRST202` (`"Could not find the function public.is_blocked(user_a, user_b) in the schema cache"`). Direct Supabase REST queries (`GET /rest/v1/profiles`, `GET /rest/v1/posts`, `GET /rest/v1/follows`) return `200 OK` with full records for blocked users.
3. **Even if `supabase_schema.sql` is applied as written, its RLS `SELECT` policies contain a complete anonymous bypass (`auth.uid() is null`) (Critical):** Policies on `profiles`, `posts`, `comments`, `stories`, `reels`, and `storage.objects` ([`supabase_schema.sql:1585-1628`](file:///c:/remix-verixa/supabase_schema.sql#L1585-L1628), [`1673-1684`](file:///c:/remix-verixa/supabase_schema.sql#L1673-L1684)) explicitly allow `auth.uid() is null`, meaning any request sent with only the public `apikey` header (omitting the user JWT) bypasses `not public.is_blocked(...)` across all tables.
4. **Universal Authentication Bypass & Impersonation in `verifyRequestActor` (Critical):** [`verifyRequestActor`](file:///c:/remix-verixa/server/moderation/blockService.ts#L469-L513) falls back to trusting the client-supplied body/query user ID whenever the `Authorization` header is omitted, starts with `Bearer dev_`, or contains an invalid/expired token. Unauthenticated callers can block or unblock arbitrary users on behalf of any victim.
5. **Unauthenticated Block-List Leak & Block-Direction Oracle (Critical):** `GET /api/users/:userId/blocked` performs zero authentication and leaks the user's private block list, target profile details, and block reasons to any caller. `GET /api/users/:targetUserId/block-status?viewerId=...` trusts the unauthenticated `viewerId` parameter, enabling any blocked user to swap `viewerId` and `targetUserId` to confirm who blocked whom (`blockedByViewer: true`).
6. **Media Privacy Is Not Enforced at the Storage Layer (Critical):** The `app-files` bucket is configured with `public = true` ([`supabase_schema.sql:551-553`](file:///c:/remix-verixa/supabase_schema.sql#L551-L553)). Direct unauthenticated requests to `/storage/v1/object/public/app-files/<userId>/...` return `200 OK`, and previously issued signed URLs remain valid for their full 3,600-second token lifetime.
7. **All 21 E2E Assertions in `verify_block_system.mjs` Exercised Unauthenticated Local JSON State Only (High):** The test script used synthetic UUIDs (`11111111-...`, `22222222-...`) that do not exist in `auth.users`, sent zero `Authorization` headers, and triggered silent Supabase write failures that were swallowed by `try/catch` blocks.

---

## Section 1 — Block Relationship Integrity & Persistence Audit

### 1.1 Is Supabase the Authoritative Source of Block Relationships?
**Finding: NO (FAIL).**
- **Code Reference:** [`server/moderation/blockService.ts:39-59`](file:///c:/remix-verixa/server/moderation/blockService.ts#L39-L59) (`getSupabaseServerClient`) and [`server/moderation/blockService.ts:153-280`](file:///c:/remix-verixa/server/moderation/blockService.ts#L153-L280) (`syncFromSupabase`).
- **Mechanism:** `getSupabaseServerClient()` checks `process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY`. In the active environment, `SUPABASE_SERVICE_ROLE_KEY` is not set, so the server initializes the Supabase client with the publishable `anon` key and `persistSession: false` (`auth.uid() = NULL`).
- When `syncFromSupabase()` executes:
  1. `sb.from('blocked_users').select('blocker_id, blocked_id, reason, created_at')` ([`blockService.ts:164-166`](file:///c:/remix-verixa/server/moderation/blockService.ts#L164-L166)) runs as `anon`. Under RLS (`"Users can view their own block relationships"`, `using (auth.uid() = blocker_id or auth.uid() = blocked_id)`), PostgREST returns `200 OK` with `data = []`.
  2. `sb.from('moderation_logs').select(...)` ([`blockService.ts:206-210`](file:///c:/remix-verixa/server/moderation/blockService.ts#L206-L210)) runs as `anon`. Under RLS (`"Users can view their own moderation logs"`, `using (auth.uid() = user_id)`), PostgREST returns `200 OK` with `data = []`.
- **Empirical Evidence (`readonly_audit.mjs` Checks 1 & 2):**
  ```text
  SUPABASE_SERVICE_ROLE_KEY present: false
  GET /rest/v1/blocked_users?select=blocker_id,blocked_id,reason,created_at&limit=5 -> Status: 200, Body: []
  GET /rest/v1/moderation_logs?select=user_id,content,created_at&type=eq.user_block&limit=5 -> Status: 200, Body: []
  ```

### 1.2 Synchronization Between `data/blocked_users.json`, In-Memory State, and Supabase
- **Code Reference:** [`server/moderation/blockService.ts:62-298`](file:///c:/remix-verixa/server/moderation/blockService.ts#L62-L298).
- **Mechanics & Synchronization Flaws:**
  1. **15-Second Stale Window:** `syncFromSupabase()` returns immediately if `now - this.lastSupabaseSyncMs < 15_000` ([`blockService.ts:155`](file:///c:/remix-verixa/server/moderation/blockService.ts#L155)) unless `force = true`. Across multiple server instances, a block or unblock written on Instance A will not be polled by Instance B for up to 15 seconds.
  2. **Additive-Only Sync (`blocked_users` Table Never Prunes Unblocks):** In [`blockService.ts:173-200`](file:///c:/remix-verixa/server/moderation/blockService.ts#L173-L200), `syncFromSupabase()` iterates over rows in `blocked_users` and adds missing entries to `this.store.blocks`, but **never removes** entries from `this.store.blocks` that were deleted from `public.blocked_users` on another instance.
  3. **Permanent Re-Block Suppression Bug (`unblockedIds` Poisoning):** When User A unblocks User B, `unblockUser()` appends `B` to `this.store.unblockedIds[A]` ([`blockService.ts:390-394`](file:///c:/remix-verixa/server/moderation/blockService.ts#L390-L394)). If User A subsequently re-blocks User B via Supabase or another server instance, [`blockService.ts:179`](file:///c:/remix-verixa/server/moderation/blockService.ts#L179) checks `if (unblockedList.includes(blockedId)) continue;` and **permanently ignores** the active row in `public.blocked_users`!
  4. **Lost Updates Under Concurrent File Access:** `reloadFromDisk()` ([`blockService.ts:69-85`](file:///c:/remix-verixa/server/moderation/blockService.ts#L69-L85)) only reloads `data/blocked_users.json` when `stat.mtimeMs !== this.lastLoadedMtimeMs`, and `save()` ([`blockService.ts:138-147`](file:///c:/remix-verixa/server/moderation/blockService.ts#L138-L147)) performs an uncoordinated `fs.writeFileSync` without file locking.

### 1.3 Silent Database Write Failures Reported as Successful Blocks
**Finding: CONFIRMED VULNERABILITY (HIGH).**
- **Code Reference:** [`server.ts:1540-1567`](file:///c:/remix-verixa/server.ts#L1540-L1567) (`POST /api/users/:targetUserId/block`) and [`src/lib/supabaseServices.ts:2049-2101`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L2049-L2101) (`blockUserAccount`).
- **Mechanism:**
  - In [`server.ts:1525`](file:///c:/remix-verixa/server.ts#L1525), `blockService.blockUser(blockerId, targetUserId, ...)` writes to `data/blocked_users.json` **before** attempting any Supabase write.
  - In [`server.ts:1540-1567`](file:///c:/remix-verixa/server.ts#L1540-L1567), the server calls `await writeClient.from('blocked_users').upsert(...)` and `await writeClient.rpc('log_moderation_entry', ...)` without checking the returned `{ error }` property (Supabase JS SDK resolves `{ data: null, error: {...} }` instead of throwing) and wraps the entire block in `try { ... } catch {}`.
  - When a request lacks a valid user JWT (or if Supabase is unreachable, rejects the row under RLS, or fails a foreign-key constraint), the database write silently fails (`PGRST301` / RLS error / FK error), yet the endpoint still responds `200 OK` with `{ success: true, blocked: true, restricted: true }`.
  - Similarly, in [`src/lib/supabaseServices.ts:2063-2092`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L2063-L2092), `blockUserAccount` ignores `{ error }` on `.upsert()` to `blocked_users`, ignores `{ error }` on `.delete()` from `follows`, and returns `true` whenever the Express `/block` endpoint returns `200 OK`.

### 1.4 Suitability of `data/blocked_users.json` for Deployed Render Environment
**Finding: UNSUITABLE AS AUTHORITATIVE STORE (HIGH).**
- Render web services run on **ephemeral container filesystems**. Every deployment, container restart, or autoscaling event resets the filesystem to the state committed in Git (`data/blocked_users.json` currently contains only two seed blocks: `e825d91d-4d19-4283-bd1f-9da12cf0ff10 -> 1e71840f-a4ce-4b73-bbf8-686e7235d3c9` and `889bf2c6-d86f-4d1f-a32f-4aa3002ff538 -> 1e71840f-a4ce-4b73-bbf8-686e7235d3c9`).
- Because `SUPABASE_SERVICE_ROLE_KEY` is unset and `syncFromSupabase()` returns `[]`, **any block created at runtime that fails to write to Supabase—or even blocks that do write to `public.blocked_users`—cannot be reconstructed by the Express server after a container restart** until a client explicitly calls an endpoint with that specific user's Bearer JWT (`syncFromSupabaseForToken`).
- Even worse, during a Supabase outage or cold start before a user's token is synced, `isMutuallyBlocked()` falls back to the stale local JSON store and **fails open** (`return false`), silently authorizing restricted interactions.

---

## Section 2 — Authorization & Authentication Path Audit

### 2.1 Critical Flaw in `verifyRequestActor` ([`server/moderation/blockService.ts:469-513`](file:///c:/remix-verixa/server/moderation/blockService.ts#L469-L513))
```ts
// server/moderation/blockService.ts:477-512
const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

if (token && !token.startsWith('dev_')) {
  const sb = getSupabaseServerClient();
  if (sb) {
    try {
      const { data, error } = await sb.auth.getUser(token);
      if (!error && data?.user?.id) {
        const verifiedId = String(data.user.id).trim();
        if (claimed && verifiedId !== claimed) {
          return { actorId: null, verifiedByToken: true, impersonationAttempt: true };
        }
        return { actorId: verifiedId, verifiedByToken: true, impersonationAttempt: false };
      }
    } catch {
      // fall through to claimed ID if token validation fails on local dev
    }
  }
}
return { actorId: claimed || null, verifiedByToken: false, impersonationAttempt: false };
```
Every route using `verifyRequestActor` only checks `if (actorCheck.impersonationAttempt)` or `if (!blockerId)`. None check `actorCheck.verifiedByToken`. This creates **three distinct authentication bypasses**:
1. **Omitted `Authorization` Header Bypass:** Sending no `Authorization` header returns `actorId = claimedUserId` with `impersonationAttempt: false`. Any unauthenticated attacker can impersonate any user UUID (`blockerId`, `senderId`, `userId`, `followerId`).
2. **`Bearer dev_*` Prefix Bypass:** Sending `Authorization: Bearer dev_anything` skips `sb.auth.getUser(token)` completely and trusts `claimedUserId`.
3. **Invalid/Expired JWT Fallthrough Bypass:** Sending an invalid or expired token (`Authorization: Bearer invalid_jwt`) causes `sb.auth.getUser(token)` to return `error`, which falls through the `if (!error && data?.user?.id)` branch straight to `return { actorId: claimed || null, verifiedByToken: false, impersonationAttempt: false }`!

### 2.2 Comprehensive Endpoint Authorization Matrix

| Endpoint / Operation | Location | Auth Enforced? | Mutual Block Checked? | Vulnerability / Observed Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `POST /api/users/:targetUserId/block` | [`server.ts:1497-1595`](file:///c:/remix-verixa/server.ts#L1497-L1595) | **NO** (`verifyRequestActor` falls back to `req.body.blockerId`) | Self-block checked | **CRITICAL:** Unauthenticated caller can block any user on behalf of any `blockerId`. DB errors silently ignored. |
| `POST /api/users/:targetUserId/unblock` | [`server.ts:1597-1658`](file:///c:/remix-verixa/server.ts#L1597-L1658) | **NO** (`verifyRequestActor` falls back to `req.body.blockerId`) | N/A | **CRITICAL:** Blocked user `B` can unblock themselves by sending `{ "blockerId": "<User A UUID>" }` without a token! |
| `GET /api/users/:userId/blocked` | [`server.ts:1660-1825`](file:///c:/remix-verixa/server.ts#L1660-L1825) | **NONE** | N/A | **CRITICAL:** Any unauthenticated user can fetch `:userId`'s full `blockedUsers` array (with names, usernames, avatars, and block reasons) and `restrictedUserIds`. |
| `GET /api/users/:targetUserId/block-status` | [`server.ts:1346-1385`](file:///c:/remix-verixa/server.ts#L1346-L1385) | **NONE** (trusts `?viewerId=`) | Returns `restricted`, `blockedByViewer` | **HIGH:** Oracle leak — blocked user `B` can query `/api/users/B/block-status?viewerId=A` and receive `blockedByViewer: true`, proving `A` initiated the block. |
| `GET /api/users/:targetUserId/profile` | [`server.ts:1391-L1435`](file:///c:/remix-verixa/server.ts#L1391-L1435) | **NONE** (trusts `?viewerId=`) | Only if `viewerId` is provided | **HIGH:** Omitting `?viewerId=` bypasses `if (viewerId && ...)` at line 1403 and returns `200 OK` with the full profile of the blocker/blocked user. |
| `GET /api/users/search` | [`server.ts:1437-1495`](file:///c:/remix-verixa/server.ts#L1437-L1495) | **NONE** (trusts `?viewerId=`) | Only if `viewerId` is provided | **HIGH:** Omitting `?viewerId=` returns blocked users in search/autocomplete results. |
| `GET /api/users/:id/followers` | [`server.ts:1240-1287`](file:///c:/remix-verixa/server.ts#L1240-L1287) | **NONE** (trusts `?viewerId=`) | Only if `viewerId` is provided | **HIGH:** Omitting `?viewerId=` returns `200 OK` with `:id`'s follower list. |
| `GET /api/users/:id/following` | [`server.ts:1289-1336`](file:///c:/remix-verixa/server.ts#L1289-L1336) | **NONE** (trusts `?viewerId=`) | Only if `viewerId` is provided | **HIGH:** Omitting `?viewerId=` returns `200 OK` with `:id`'s following list. |
| `POST /api/users/:id/follow` | [`server.ts:1126-1238`](file:///c:/remix-verixa/server.ts#L1126-L1238) | **NO** (`verifyRequestActor` fallback) | Yes (`followerId` vs `:id`) | **HIGH:** Unauthenticated caller can force arbitrary non-blocked users to follow/unfollow each other. Notification insert at lines 1186–1194 uses invalid column names (`user_id`, `actor_id`). |
| `POST /api/posts/:id/like` | [`server.ts:951-1015`](file:///c:/remix-verixa/server.ts#L951-L1015) | **NO** (`verifyRequestActor` fallback) | Checks `posts.user_id` if post found in DB | **MEDIUM:** If `sb.from('posts').select('user_id')` fails or returns null, fails open and records the like in memory. |
| `GET /api/posts/:id/likes` | [`server.ts:1017-1106`](file:///c:/remix-verixa/server.ts#L1017-L1106) | **NONE** (optional `?viewerId=`) | Filters likers list, **NOT post author** | **HIGH:** Does not check if `viewerId` is blocked by the **post's author**! Furthermore, frontend [`fetchPostLikedUsers`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L1054-L1057) does not pass `viewerId` at all. |
| `GET /api/posts/liked/:userId` | [`server.ts:1108-1117`](file:///c:/remix-verixa/server.ts#L1108-L1117) | **NONE** | **NONE** | **HIGH:** Leaks all post IDs liked by `:userId` to any caller without block or auth checks. |
| `POST /api/posts/:id/comments` | [`server.ts:1828-1896`](file:///c:/remix-verixa/server.ts#L1828-L1896) | **NO** (`verifyRequestActor` fallback) | Checks `posts.user_id` | **HIGH:** Does not check if the commenter is blocked by the parent comment's author when replying, and fails open if `postRow` lookup fails. |
| `GET /api/stories` | [`server.ts:1963-1993`](file:///c:/remix-verixa/server.ts#L1963-L1993) | **NONE** (optional `?userId=`) | Only if `userId` is provided | **HIGH:** Omitting `?userId=` returns `200 OK` with active stories from all users, including users who blocked the caller. |
| `POST /api/stories/:id/view` | [`server.ts:2177-2190`](file:///c:/remix-verixa/server.ts#L2177-L2190) | **NONE** | Yes (`story.userId` vs `userId`) | **MEDIUM:** No authentication on `req.body.userId`. |
| `POST /api/stories/:id/like` | [`server.ts:2192-2206`](file:///c:/remix-verixa/server.ts#L2192-L2206) | **NONE** | Yes (`story.userId` vs `userId`) | **MEDIUM:** No authentication on `req.body.userId`. |
| `DELETE /api/stories/:id` | [`server.ts:2208-2229`](file:///c:/remix-verixa/server.ts#L2208-L2229) | **NONE** | **NONE** | **CRITICAL:** Zero authentication or ownership verification — any caller can delete any user's story by ID. |
| `GET /api/stories/:id/insights` | [`server.ts:2250-2365`](file:///c:/remix-verixa/server.ts#L2250-L2365) | **NONE** | Filters story owner's blocked users only | **HIGH:** Any caller (including a blocked user) can fetch a story's viewer and liker lists without authentication. |
| `GET /api/reels` | [`server.ts:2375-2405`](file:///c:/remix-verixa/server.ts#L2375-L2405) | **NONE** (optional `?userId=`) | Only if `userId` is provided | **HIGH:** Omitting `?userId=` returns all reels from blocked/blocking creators. |
| `POST /api/reels/:id/like` | [`server.ts:2485-2499`](file:///c:/remix-verixa/server.ts#L2485-L2499) | **NONE** | Yes (`reel.userId` vs `userId`) | **MEDIUM:** No authentication on `req.body.userId`. |
| `POST /api/notifications` | [`server.ts:2504-2541`](file:///c:/remix-verixa/server.ts#L2504-L2541) | **NONE** | Yes (`recipientId` vs `senderId`) | **HIGH:** No authentication (`verifyRequestActor` not called); any user can spoof system/social notifications from non-blocked senders. |
| `GET /api/notifications` | [`server.ts:2543-2556`](file:///c:/remix-verixa/server.ts#L2543-L2556) | **NONE** (`?userId=`) | Filters blocked senders | **HIGH:** Zero authentication — any caller can read any `:userId`'s in-memory notifications by passing `?userId=<victimId>`. |
| `POST /api/notifications/read` & `DELETE /api/notifications/:id` | [`server.ts:2558-2589`](file:///c:/remix-verixa/server.ts#L2558-L2589) | **NONE** | **NONE** | **HIGH:** Unauthenticated callers can mark as read or delete any user's notifications. |
| `GET /api/feed/personalized` | [`server.ts:3385-3436`](file:///c:/remix-verixa/server.ts#L3385-L3436) | **NONE** (optional `?userId=`) | Only if `userId` is non-empty | **HIGH:** Passing `?userId=` (empty) skips `blockService.getRestrictedUserIds` ([`feedService.ts:118`](file:///c:/remix-verixa/server/feed/feedService.ts#L118)) and returns posts from all blocked users. |
| `GET /api/feed/explain/:postId` | [`server.ts:3438-3460`](file:///c:/remix-verixa/server.ts#L3438-L3460) | **NONE** | **NONE** | **MEDIUM:** Returns post scoring metadata even if `userId` and the post's author are mutually blocked. |
| `GET /api/reputation/:userId/*`, `GET /api/guardian/score/:userId`, `GET /api/behavioral/bullying-events/:userId` | [`server.ts:2714-2812`](file:///c:/remix-verixa/server.ts#L2714-L2812) | **NONE** | **NONE** | **MEDIUM:** Exposes user reputation, guardian score, and bullying telemetry to any caller without auth or block checks. |
| `POST /api/messages` | [`server.ts:1899-1958`](file:///c:/remix-verixa/server.ts#L1899-L1958) | **NO** (`verifyRequestActor` fallback) | Yes (`senderId` vs `receiverId`) | **HIGH:** Unauthenticated caller can send messages as any `senderId` to any non-blocked `receiverId`. |
| Message Editing (`updateMessageText`) | [`src/lib/supabaseServices.ts:2823-2871`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L2823-L2871) | Supabase JWT | **NONE** | **HIGH:** Covert communication channel — after User A blocks User B, User B can edit their previously sent messages in the shared chat thread (`UPDATE public.messages SET text = ... WHERE id = ... AND sender_id = auth.uid()`), bypassing block enforcement! |
| WebRTC Call Signaling (`handleIncomingOffer`) | [`src/lib/webrtcCallService.ts:208-229, 399-408`](file:///c:/remix-verixa/src/lib/webrtcCallService.ts#L208-L229) | Supabase Realtime / WS | Checked on `startCall` & server WS, **NOT on client `handleIncomingOffer`** | **MEDIUM:** Presence/Busy Oracle — if a blocked caller sends a WebRTC `call_offer` over Supabase Realtime `calls:${calleeId}`, `handleIncomingOffer` immediately replies with `call_busy` (if in a call) or triggers `AppContext`'s `rejectCall()` (`call_rejected` broadcast), revealing that the blocker is online or on another call. |

### 2.3 Reproducible Evidence from Live Non-Destructive Audit (`readonly_audit.mjs` & `readonly_audit_2.mjs`)
Using the existing seed block in `data/blocked_users.json` where Blocker = `e825d91d-4d19-4283-bd1f-9da12cf0ff10` (`sriman_7`) and Blocked = `1e71840f-a4ce-4b73-bbf8-686e7235d3c9` (`jashu_2426`):

1. **Unauthenticated Block-List & Reason Disclosure (`Check 7`):**
   - Request: `GET http://localhost:3000/api/users/e825d91d-4d19-4283-bd1f-9da12cf0ff10/blocked` (no headers)
   - Response (`200 OK`):
     ```json
     {
       "blockedUsers": [
         {
           "id": "1e71840f-a4ce-4b73-bbf8-686e7235d3c9",
           "name": "Jashu Yellasiri",
           "username": "jashu_2426",
           "reason": "Blocked from user profile",
           "blockedAt": "2026-04-07T07:53:48.554Z"
         }
       ],
       "restrictedUserIds": ["1e71840f-a4ce-4b73-bbf8-686e7235d3c9"]
     }
     ```
2. **Block-Direction Oracle via Unauthenticated `viewerId` Swap (`Check 9`):**
   - Request: `GET http://localhost:3000/api/users/1e71840f-a4ce-4b73-bbf8-686e7235d3c9/block-status?viewerId=e825d91d-4d19-4283-bd1f-9da12cf0ff10`
   - Response (`200 OK`): `{"restricted":true,"blockedByViewer":true,"blockedViewer":false,"mutuallyBlocked":true}` — allows `1e71840f-...` to confirm `e825d91d-...` blocked them.
3. **Profile Block Bypass by Omitting `viewerId` (`Check 8`):**
   - Request: `GET http://localhost:3000/api/users/e825d91d-4d19-4283-bd1f-9da12cf0ff10/profile`
   - Response (`200 OK`): Returns full profile object (`id`, `username: "sriman_7"`, `display_name: "Sriman"`, `avatar_url`, etc.).
4. **Post Likes Leak to Blocked User (`readonly_audit_2.mjs Check 3 & 4`):**
   - Request: `GET http://localhost:3000/api/posts/bfde5bf1-5cf4-4a5d-abbb-46199be1cfbf/likes?viewerId=1e71840f-a4ce-4b73-bbf8-686e7235d3c9` (where post `bfde5bf1-...` belongs to blocker `e825d91d-...`)
   - Response (`200 OK`): Returns full array of users who liked the blocker's post (`count: 2`).

---

## Section 3 — Supabase RLS & SQL Security Review

### 3.1 Live Database State vs. `supabase_schema.sql` (Critical Schema Drift)
- **Live Verification (`readonly_audit.mjs Check 3, 4, 5`):**
  - Calling `POST /rest/v1/rpc/is_blocked` with `{"user_a": "e825d91d-4d19-4283-bd1f-9da12cf0ff10", "user_b": "1e71840f-a4ce-4b73-bbf8-686e7235d3c9"}` against the live Supabase project returns:
    ```json
    {
      "code": "PGRST202",
      "details": "Searched for the function public.is_blocked with parameters user_a, user_b or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
      "message": "Could not find the function public.is_blocked(user_a, user_b) in the schema cache"
    }
    ```
  - This confirms that the SQL changes added to [`supabase_schema.sql:1517-1692`](file:///c:/remix-verixa/supabase_schema.sql#L1517-L1692) have **never been executed** on the live Supabase database.

### 3.2 Audit of `public.is_blocked(user_a, user_b)` ([`supabase_schema.sql:1544-1567`](file:///c:/remix-verixa/supabase_schema.sql#L1544-L1567))
- **Definition Inspected:**
  - Marked `language plpgsql stable security definer set search_path = public, pg_temp`.
  - Checks both `public.blocked_users` and the latest `type = 'user_block'` JSON payload in `public.moderation_logs`.
- **Security & Performance Issues Identified:**
  1. **Unindexed JSON-Cast Subquery in Every RLS Row Evaluation (DoS / Severe Latency Risk):**
     In [`supabase_schema.sql:1554-1565`](file:///c:/remix-verixa/supabase_schema.sql#L1554-L1565), every call to `public.is_blocked(auth.uid(), user_id)` executes a correlated `LATERAL` subquery casting `ml.content::jsonb ->> 'targetUserId'` across `public.moderation_logs`. Because `is_blocked` is invoked per-row inside `SELECT` RLS policies on `profiles`, `posts`, `comments`, `stories`, `reels`, `messages`, `notifications`, and `storage.objects`, this `moderation_logs` JSON scan will execute thousands of times per feed query. Once `public.blocked_users` is authoritative, `is_blocked` should query **only** the indexed `public.blocked_users` table (`idx_blocked_users_blocker`, `idx_blocked_users_blocked`).
  2. **Public Execution Grant as Block Enumeration Oracle:**
     Line [`1569`](file:///c:/remix-verixa/supabase_schema.sql#L1569) grants `execute on function public.is_blocked(uuid, uuid) to anon, authenticated;`. Because `is_blocked` does not check `auth.uid() = user_a OR auth.uid() = user_b`, any anonymous or authenticated caller can call `/rest/v1/rpc/is_blocked` with arbitrary pairs of third-party UUIDs `(X, Y)` to enumerate who has blocked whom across the entire platform.

### 3.3 Audit of `public.on_user_blocked_cleanup()` ([`supabase_schema.sql:1572-1581`](file:///c:/remix-verixa/supabase_schema.sql#L1572-L1581))
- **Definition Inspected:**
  - `AFTER INSERT ON public.blocked_users FOR EACH ROW EXECUTE FUNCTION public.on_user_blocked_cleanup()` deletes mutual rows in `public.follows`.
- **Gaps Identified:**
  - Does **not** clean up pending follow requests (if stored in notifications/requests), active call sessions, or unread notifications between `new.blocker_id` and `new.blocked_id`.
  - Does **not** update cached `followers_count` / `following_count` columns on `public.profiles` if any triggers/counters depend on `follows`.

### 3.4 Flaws in Newly Added RLS Policies ([`supabase_schema.sql:1529-1689`](file:///c:/remix-verixa/supabase_schema.sql#L1529-L1689))

1. **[CRITICAL] `auth.uid() is null` Clause Completely Bypasses RLS for Anonymous REST Requests:**
   - In [`supabase_schema.sql:1585-1628`](file:///c:/remix-verixa/supabase_schema.sql#L1585-L1628) (`profiles`, `posts`, `comments`, `stories`, `reels`) and [`1673-1684`](file:///c:/remix-verixa/supabase_schema.sql#L1673-L1684) (`storage.objects`), every `SELECT` policy is written as:
     ```sql
     using (
       auth.uid() is null
       or auth.uid() = user_id
       or not public.is_blocked(auth.uid(), user_id)
     );
     ```
   - Any attacker who sends a request to Supabase PostgREST using only the public `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY>` header (without an `Authorization: Bearer <user_jwt>` header, or using the anon JWT where `auth.uid()` is `NULL`) satisfies `auth.uid() is null = TRUE` and can read **every profile, post, comment, story, reel, and storage object** regardless of blocks!
2. **[HIGH] `public.blocked_users` `SELECT` Policy Leaks Block Initiator & Reason to the Blocked Target:**
   - [`supabase_schema.sql:1532-1533`](file:///c:/remix-verixa/supabase_schema.sql#L1532-L1533):
     ```sql
     create policy "Users can view their own block relationships" on public.blocked_users
       for select using (auth.uid() = blocker_id or auth.uid() = blocked_id);
     ```
   - Because `auth.uid() = blocked_id` is permitted to `SELECT *`, the blocked user can directly query `GET /rest/v1/blocked_users?blocked_id=eq.<my_id>` and see the exact `blocker_id`, private `reason`, and `created_at` timestamp.
3. **[HIGH] Overlapping Permissive `UPDATE` Policy on `public.messages` Defeats Block Restriction:**
   - [`supabase_schema.sql:1500-1502`](file:///c:/remix-verixa/supabase_schema.sql#L1500-L1502) defines:
     ```sql
     create policy "Users can update their own messages" on public.messages
       for update using (auth.uid() = sender_id);
     ```
   - Line [`1665`](file:///c:/remix-verixa/supabase_schema.sql#L1665) drops `"Users can update message delivery/read/reactions"` and recreates it with `and not public.is_blocked(sender_id, receiver_id)`, **but fails to drop `"Users can update their own messages"`**. Because PostgreSQL combines multiple `PERMISSIVE` policies on the same table/command using logical `OR`, any blocked `sender_id` still satisfies `"Users can update their own messages"` and can modify message text (`updateMessageText`) in a blocked thread.
4. **[HIGH] Missing Block Enforcement & Over-Permissive Policies on `stories`, `reels`, `follows`, `likes`, `post_likes`, and `comments`:**
   - `public.stories` ([`lines 410-416`](file:///c:/remix-verixa/supabase_schema.sql#L410-L416)) and `public.reels` ([`lines 424-430`](file:///c:/remix-verixa/supabase_schema.sql#L424-L430)) still have `for insert with check (true)`, `for update using (true)`, and `for delete using (true)`! Any user can overwrite or delete any other user's stories or reels directly via Supabase REST.
   - `public.follows` ([`line 454`](file:///c:/remix-verixa/supabase_schema.sql#L454)), `public.likes` ([`line 434`](file:///c:/remix-verixa/supabase_schema.sql#L434)), and `public.post_likes` ([`line 444`](file:///c:/remix-verixa/supabase_schema.sql#L444)) retain `for select using (true)`, allowing blocked users to read the blocker's social graph and likes directly from PostgREST.
   - `public.comments` `SELECT` policy ([`lines 1596-1600`](file:///c:/remix-verixa/supabase_schema.sql#L1596-L1600)) only checks `not public.is_blocked(auth.uid(), user_id)` (the comment author) and does **not** check whether `auth.uid()` is blocked by the parent post's author (`posts.user_id`) or reel's author (`reels.user_id`).
   - `public.comments` `INSERT` policy ([`lines 1630-1641`](file:///c:/remix-verixa/supabase_schema.sql#L1630-L1641)) only checks `public.posts` when `post_id is not null`; if a comment is inserted on a reel (`reel_id is not null, post_id is null`), it does not check whether the reel owner blocked the commenter.
5. **[MEDIUM] `SECURITY DEFINER` RPC Functions Bypassing Block Checks:**
   - [`public.create_interaction_notification`](file:///c:/remix-verixa/supabase_schema.sql#L840-L894) (`SECURITY DEFINER`) allows any authenticated caller to create a notification for `p_recipient_id` without checking `if public.is_blocked(v_actor, p_recipient_id) then return null; end if;`.
   - [`public.record_story_view`](file:///c:/remix-verixa/supabase_schema.sql#L960-L986) (`SECURITY DEFINER`) records a story view without checking whether `v_viewer` is blocked by the story author (`v_owner`).
   - [`public.cleanup_expired_stories`](file:///c:/remix-verixa/supabase_schema.sql#L1443-L1452) is marked `SECURITY DEFINER` without an explicit `set search_path = public, pg_temp`.

---

## Section 4 — Media Privacy Reality Assessment

### 4.1 Bucket Configuration & Direct Storage Access
- **Code & SQL Reference:** [`supabase_schema.sql:551-553`](file:///c:/remix-verixa/supabase_schema.sql#L551-L553) and [`src/lib/supabaseServices.ts:44-103`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L44-L103) (`getSignedMediaUrl`).
- **Observed Reality:**
  1. The `app-files` bucket is configured as a **public bucket** (`public = true` in `storage.buckets`).
  2. In Supabase Storage, when a bucket has `public = true`, the `/storage/v1/object/public/app-files/<path>` endpoint serves objects directly without evaluating `storage.objects` `SELECT` RLS policies or requiring a signed token.
  3. Furthermore, most posts and avatars in `public.posts` and `public.profiles` store full public URLs (`https://.../storage/v1/object/public/app-files/<userId>/...`), and [`getSignedMediaUrl`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L96-L99) explicitly falls back to `supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath)` if `createSignedUrl` fails.
- **Empirical Proof (`readonly_audit.mjs Check 6c` & `readonly_audit_2.mjs Check 8`):**
  - Unauthenticated `HEAD` request to blocked user's media `https://latfCxqGg...supabase.co/storage/v1/object/public/app-files/1e71840f-a4ce-4b73-bbf8-686e7235d3c9/posts/1775548421737-6h6v1z.webp` -> **`200 OK`** (`Content-Type: image/webp`).
  - Unauthenticated `HEAD` request to blocker's media `https://latfCxqGg...supabase.co/storage/v1/object/public/app-files/e825d91d-4d19-4283-bd1f-9da12cf0ff10/posts/1775547791032-d2r1r5.png` -> **`200 OK`** (`Content-Type: image/png`).

### 4.2 Clear Distinction of Media URL Behaviors

| Mechanism | Current Implementation Status | Security Reality |
| :--- | :--- | :--- |
| **1. URL Cache Eviction** | Implemented in [`evictSignedUrlsForUser(userId)`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L13-L20) | Only deletes entries matching `/${userId}/` from the **local JavaScript `Map` (`signedUrlCache`)** in the browser tab where `evictSignedUrlsForUser` was called. It does not clear browser HTTP disk cache (`<img>` / `<video>` cache) or evict URLs held in the other user's browser memory until their client refreshes block state. |
| **2. Preventing New URL Issuance** | Partially implemented in [`getSignedMediaUrl`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L60-L64) (`if (ownerCandidate && isClientUserRestricted(ownerCandidate)) return '';`) | Only enforced client-side inside `getSignedMediaUrl` if the file path starts with `<userId>/...`. Because the live database has not applied the `storage.objects` RLS policy (and because that policy has `auth.uid() is null` and `app-files` is `public = true`), direct calls to Supabase Storage still succeed. |
| **3. Expiration of Existing Signed URLs** | 3,600 seconds (1 hour) via `createSignedUrl(objectPath, 3600)` ([`supabaseServices.ts:87`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L87)) | Any `/storage/v1/object/sign/app-files/...` URL issued before a block is a self-contained HMAC-signed JWT valid for **up to 60 minutes** after issuance. |
| **4. Immediate Server-Enforced Revocation** | **NOT IMPLEMENTED / FALSE CLAIM in [`BLOCK_SYSTEM_SECURITY_AUDIT.md:54-56`](file:///c:/remix-verixa/BLOCK_SYSTEM_SECURITY_AUDIT.md#L54-L56)** | Neither Supabase Storage signed URLs nor public bucket URLs are revoked on the server when a block occurs. A user who copied a signed URL (for 1 hour) or a public URL (indefinitely) can continue downloading the media after being blocked. |

---

## Section 5 — Audit of the 21 Existing E2E Assertions (`verify_block_system.mjs`)

Inspection of [`verify_block_system.mjs`](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs) reveals three systemic methodology flaws across **all 21 assertions**:
1. **No Authenticated Sessions Used:** Every request used `req(path, options)` ([`lines 6-19`](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L6-L19)) with **zero `Authorization` headers**. The tests only passed because `verifyRequestActor` has the critical unauthenticated fallback bug described in Section 2.1.
2. **Synthetic Non-Existent UUIDs:** `USER_A = '11111111-1111-4111-8111-111111111111'` and `USER_B = '22222222-2222-4222-8222-222222222222'` ([`lines 3-4`](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L3-L4)) do not exist in `auth.users` or `public.profiles`.
3. **Zero Database Persistence or RLS Exercised:** Because `public.blocked_users` has foreign keys referencing `auth.users(id)` and RLS requiring `auth.uid() = blocker_id`, every Supabase write inside `/block` and `/unblock` failed during the test run and was silently swallowed by `try/catch`. All 21 assertions only tested the Express server's in-memory/`data/blocked_users.json` helper logic.

### Detailed Breakdown of All 21 Assertions

| # | Test Label in `verify_block_system.mjs` | Actual Operation Performed | Separate Auth Sessions? | Real DB / RLS Exercised? | What Remains Untested / Masked Vulnerability |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `1. Self-block rejected with 400 Bad Request` ([L44-48](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L44-L48)) | Unauthenticated `POST /api/users/${USER_A}/block` with `{ blockerId: USER_A }` | No | No | Did not test DB `check (blocker_id <> blocked_id)` constraint or token-derived actor matching. |
| **2** | `2. User A blocks User B succeeds` ([L51-55](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L51-L55)) | Unauthenticated `POST /api/users/${USER_B}/block` with `{ blockerId: USER_A }` | No | **No (DB write silently failed)** | Masked the fact that `public.blocked_users` insert failed and that unauthenticated callers can impersonate `USER_A`. |
| **3** | `3. Duplicate block is idempotent (200 OK)` ([L58-62](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L58-L62)) | Repeat unauthenticated `POST /api/users/${USER_B}/block` | No | No | Only tested `blockService.blockUser` in-memory deduplication, not concurrent DB upsert races. |
| **4a** | `4a. Block status oracle: A viewing B is restricted (blockedByViewer=true)` ([L65-70](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L65-L70)) | Unauthenticated `GET /api/users/${USER_B}/block-status?viewerId=${USER_A}` | No | No | **Masked the oracle vulnerability:** Because `viewerId` is unauthenticated, User B can make this exact call to see `blockedByViewer: true`! |
| **4b** | `4b. Block status oracle: B viewing A is mutually restricted (blockedByViewer=false)` ([L72-77](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L72-L77)) | Unauthenticated `GET /api/users/${USER_A}/block-status?viewerId=${USER_B}` | No | No | Assumed User B would only ever pass `viewerId=${USER_B}` rather than swapping the parameters. |
| **5a** | `5a. GET /api/users/:userA/blocked includes User B in restrictedUserIds` ([L80-87](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L80-L87)) | Unauthenticated `GET /api/users/${USER_A}/blocked` | No | No | **Masked Critical Info Leak:** Proved that `/api/users/:userA/blocked` returns User A's private block list with zero authentication! |
| **5b** | `5b. GET /api/users/:userB/blocked includes User A in restrictedUserIds...` ([L89-97](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L89-L97)) | Unauthenticated `GET /api/users/${USER_B}/blocked` | No | No | User B can simply call `/api/users/${USER_A}/blocked` (Test 5a) to see User A's `blockedUsers` list and block reason. |
| **6a** | `6a. GET /api/users/:userB/profile?viewerId=userA returns 403` ([L100-105](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L100-L105)) | Unauthenticated `GET /api/users/${USER_B}/profile?viewerId=${USER_A}` | No | No | Did not test omitting `?viewerId=`, passing a random `viewerId`, or querying Supabase `GET /rest/v1/profiles` directly (all of which return `200 OK`). |
| **6b** | `6b. GET /api/users/:userA/profile?viewerId=userB returns 403` ([L107-112](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L107-L112)) | Unauthenticated `GET /api/users/${USER_A}/profile?viewerId=${USER_B}` | No | No | Same bypass: omitting `?viewerId=` returns `200 OK` with User A's profile. |
| **7a** | `7a. POST /api/messages (A -> B) rejected with 403` ([L115-123](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L115-L123)) | Unauthenticated `POST /api/messages` | No | No | Did not test direct Supabase `POST /rest/v1/messages`, `PATCH /rest/v1/messages` (`updateMessageText` covert channel), or WebSocket message relay. |
| **7b** | `7b. POST /api/messages (B -> A) rejected with 403` ([L125-133](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L125-L133)) | Unauthenticated `POST /api/messages` | No | No | Same as 7a. |
| **8a** | `8a. POST /api/users/:userB/follow (A -> B) rejected with 403` ([L136-144](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L136-L144)) | Unauthenticated `POST /api/users/${USER_B}/follow` | No | No | Did not test direct Supabase `POST /rest/v1/follows` (where live RLS currently lacks `is_blocked`). |
| **8b** | `8b. POST /api/users/:userA/follow (B -> A) rejected with 403` ([L146-154](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L146-L154)) | Unauthenticated `POST /api/users/${USER_A}/follow` | No | No | Same as 8a. |
| **9a** | `9a. GET /api/users/:userB/followers?viewerId=userA rejected with 403` ([L157-162](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L157-L162)) | Unauthenticated `GET /api/users/${USER_B}/followers?viewerId=${USER_A}` | No | No | Omitting `?viewerId=` or querying Supabase `/rest/v1/follows` directly returns `200 OK`. |
| **9b** | `9b. GET /api/users/:userA/following?viewerId=userB rejected with 403` ([L164-169](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L164-L169)) | Unauthenticated `GET /api/users/${USER_A}/following?viewerId=${USER_B}` | No | No | Omitting `?viewerId=` or querying Supabase `/rest/v1/follows` directly returns `200 OK`. |
| **10** | `10. POST /api/notifications between blocked users is blocked/ignored` ([L172-186](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L172-L186)) | Unauthenticated `POST /api/notifications` (`A -> B`) | No | No | Only tested `A -> B` in memory; did not test `B -> A`, `create_interaction_notification` RPC, or unauthenticated `GET /api/notifications?userId=A`. |
| **11a** | `11a. User B also blocks User A` ([L189-193](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L189-L193)) | Unauthenticated `POST /api/users/${USER_A}/block` with `{ blockerId: USER_B }` | No | No | Only mutated `data/blocked_users.json`. |
| **11b** | `11b. User A unblocks User B, but relationship remains restricted` ([L195-205](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L195-L205)) | Unauthenticated `POST /api/users/${USER_B}/unblock` with `{ blockerId: USER_A }` | No | No | Proved that `/unblock` accepts unauthenticated `blockerId` in the request body! |
| **11c** | `11c. Block status confirms restriction remains active after single-sided unblock` ([L207-212](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L207-L212)) | Unauthenticated `GET /api/users/${USER_B}/block-status?viewerId=${USER_A}` | No | No | Tested in-memory `isMutuallyBlocked` only. |
| **12a** | `12a. User B unblocks User A -> restriction completely lifted` ([L215-225](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L215-L225)) | Unauthenticated `POST /api/users/${USER_A}/unblock` with `{ blockerId: USER_B }` | No | No | Tested in-memory `unblockUser` only; did not test the re-block after unblock `unblockedIds` bug across Supabase sync. |
| **12b** | `12b. Block status confirms no restriction after both users unblock` ([L227-232](file:///C:/Users/syedk/.gemini/antigravity/brain/6e2fcc2e-e314-4e2f-9f7c-8800b4550261/scratch/verify_block_system.mjs#L227-L232)) | Unauthenticated `GET /api/users/${USER_B}/block-status?viewerId=${USER_A}` | No | No | Tested in-memory `isMutuallyBlocked` only. |

---

## Section 6 — Adversarial Security Test Matrix & Results

All executed tests below were performed in strict **read-only / non-destructive mode** against the live Express server (`http://localhost:3000`) and live Supabase endpoints (`readonly_audit.mjs` and `readonly_audit_2.mjs`). Tests that would mutate shared state or require two live QA user JWTs without modifying data are explicitly marked `NOT TESTED (Read-Only Constraint)` along with the exact static code analysis finding.

| Adversarial Test Scenario | Status | Method / Evidence | Observed Result |
| :--- | :--- | :--- | :--- |
| **1. Authoritative Supabase Sync (`syncFromSupabase`)** | **FAIL** | `readonly_audit.mjs` Checks 1 & 2 (`GET /rest/v1/blocked_users` & `moderation_logs` with server key) | Server lacks `SUPABASE_SERVICE_ROLE_KEY`; Supabase returns `[]` (0 rows) due to RLS. |
| **2. Live Supabase `public.is_blocked` RPC Existence** | **FAIL** | `readonly_audit.mjs` Check 3 (`POST /rest/v1/rpc/is_blocked`) | Returns `404 PGRST202` — function does not exist in live Supabase schema. |
| **3. Direct Supabase REST Access (`profiles`, `posts`, `follows`)** | **FAIL** | `readonly_audit.mjs` Checks 4 & 5 (`GET /rest/v1/profiles`, `/posts`, `/follows`) | Returns `200 OK` with full blocker and blocked user records; RLS policies in `supabase_schema.sql` also permit `auth.uid() is null`. |
| **4. Unauthorized Block-List Access (`GET /api/users/:id/blocked`)** | **FAIL** | `readonly_audit.mjs` Check 7 (`GET /api/users/e825d91d-.../blocked` with no auth) | Returns `200 OK` with full `blockedUsers` array, target profile details, and block `reason`. |
| **5. Block-Direction Oracle (`GET /api/users/:id/block-status`)** | **FAIL** | `readonly_audit.mjs` Check 9 (`GET /api/users/1e71840f-.../block-status?viewerId=e825d91d-...`) | Returns `200 OK` with `blockedByViewer: true`, revealing to `1e71840f-...` that `e825d91d-...` initiated the block. |
| **6. Profile Endpoint Bypass via Omitted `viewerId`** | **FAIL** | `readonly_audit.mjs` Check 8 (`GET /api/users/e825d91d-.../profile`) | Returns `200 OK` with full profile JSON when `?viewerId=` is omitted. |
| **7. Unauthorized Impersonation / Unblock Attempt (`verifyRequestActor`)** | **FAIL** | Code inspection ([`blockService.ts:469-513`](file:///c:/remix-verixa/server/moderation/blockService.ts#L469-L513)) + `verify_block_system.mjs` L195–198 (`POST /unblock` without JWT) | Omitting `Authorization`, sending `Bearer dev_*`, or sending an invalid JWT allows any caller to unblock themselves by passing `{ blockerId: "<blocker_uuid>" }`. |
| **8. Media URL Reuse & Direct Storage Access After Blocking** | **FAIL** | `readonly_audit.mjs` Check 6c & `readonly_audit_2.mjs` Check 8 (`HEAD /storage/v1/object/public/app-files/...`) | Returns `200 OK` for both blocker and blocked user media files without authentication; signed URLs also remain valid for 3,600s. |
| **9. Post Likes & Liked Posts Leakage Between Blocked Users** | **FAIL** | `readonly_audit_2.mjs` Checks 2, 3, 4 (`GET /api/posts/liked/:userId` and `GET /api/posts/:id/likes?viewerId=USER_BLOCKED`) | Returns `200 OK` with all liked post IDs and full liker profiles on the blocker's post. |
| **10. Personalized Feed, Stories & Reels Leakage via Omitted `userId`** | **FAIL** | `readonly_audit_2.mjs` Check 5 (`GET /api/feed/personalized?limit=10`, `GET /api/stories`, `GET /api/reels`) | Returns `200 OK` including posts/stories/reels from blocked users when `userId` query param is omitted or empty. |
| **11. Reputation & Feed Explain Endpoints Between Blocked Users** | **FAIL** | `readonly_audit_2.mjs` Checks 6a & 6b (`GET /api/reputation/:id/full`, `GET /api/feed/explain/:postId?userId=USER_BLOCKED`) | Returns `200 OK` with full reputation telemetry and post score explanation for the blocker's post. |
| **12. Covert Message Editing After Block (`updateMessageText`)** | **FAIL** | Static code & SQL policy inspection ([`supabaseServices.ts:2823-2871`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L2823-L2871), [`supabase_schema.sql:1500-1502`](file:///c:/remix-verixa/supabase_schema.sql#L1500-L1502)) | Neither `updateMessageText` nor the permissive `"Users can update their own messages"` RLS policy checks `is_blocked`. |
| **13. Server Restart & Cache Reconstruction on Render** | **FAIL** | Static inspection + `readonly_audit.mjs` Check 1 (`syncFromSupabase`) | Without `SUPABASE_SERVICE_ROLE_KEY`, server restart wipes ephemeral `blocked_users.json` changes and `syncFromSupabase()` loads `0` rows. |
| **14. Re-Block After Unblock Sync Integrity (`unblockedIds`)** | **FAIL** | Static inspection ([`blockService.ts:179, 390-394`](file:///c:/remix-verixa/server/moderation/blockService.ts#L179)) | Once `targetId` is added to `this.store.unblockedIds[blockerId]`, `syncFromSupabase()` permanently skips future blocks of `targetId` in `public.blocked_users`. |
| **15. Self-Block Rejection (`POST /api/users/:id/block`)** | **PASS** | `verify_block_system.mjs` Assertion 1 + [`blockService.ts:304`](file:///c:/remix-verixa/server/moderation/blockService.ts#L304) | Rejects `blockerId === targetUserId` with `400 Bad Request`. |
| **16. Mutual Block Check on Express `POST /api/messages` & `POST /api/users/:id/follow` (When IDs Supplied)** | **PASS (Partial)** | `verify_block_system.mjs` Assertions 7a, 7b, 8a, 8b | Express routes reject both directions with `403 Forbidden` when block exists in local `blocked_users.json`, though caller authentication is missing. |
| **17. Live Concurrent Block + Send-Message Race & Block + Unblock Race with Dual Authenticated QA Sessions** | **NOT TESTED** | Read-only constraint (no write mutations permitted in this phase); static analysis performed | Static analysis shows `syncFromSupabase` has a 15s cache window and `fs.writeFileSync` lacks concurrency locking. Must be executed in post-remediation E2E suite with real QA JWTs. |
| **18. Live Realtime Event Replay / Delayed Events Across Dual Browser Sessions** | **NOT TESTED** | Read-only constraint; static analysis of [`AppContext.tsx:862-870, 916-940`](file:///c:/remix-verixa/src/context/AppContext.tsx#L862-L870) and [`webrtcCallService.ts:208-229`](file:///c:/remix-verixa/src/lib/webrtcCallService.ts#L208-L229) | Static analysis confirmed `AppContext` filters incoming `messages` and `notifications` against `restrictedUsersRef.current`, but `webrtcCallService.handleIncomingOffer` leaks busy/online state before checking block status. |

---

## Section 7 — Exact Remediation Proposals, Migration Plan & Rollback Plan

### 7.1 Backend Authentication & Block Service Remediations

1. **Enforce Strict JWT Verification in [`verifyRequestActor`](file:///c:/remix-verixa/server/moderation/blockService.ts#L469-L513):**
   - Remove the `Bearer dev_` bypass and remove the unauthenticated/error fallthrough (`return { actorId: claimed || null, ... }`).
   - Require a valid Bearer JWT verified via `sb.auth.getUser(token)` on all state-changing and user-scoped read endpoints. If `!token` or `error` or `!data?.user?.id`, return `{ actorId: null, verifiedByToken: false, impersonationAttempt: Boolean(claimed) }` and reject the request with `401 Unauthorized`.
   - Add a reusable Express middleware `requireAuthenticatedUser(req, res, next)` that attaches `req.authUserId` and `req.authToken`.

2. **Make Supabase the True Authoritative Store & Fix [`BlockService`](file:///c:/remix-verixa/server/moderation/blockService.ts):**
   - Configure `SUPABASE_SERVICE_ROLE_KEY` in the server environment (and Render environment variables) for server-side administrative sync, **or** always query Supabase using `getSupabaseClientForToken(req.authToken)` so RLS evaluates with the authenticated `auth.uid()`.
   - In [`POST /api/users/:targetUserId/block`](file:///c:/remix-verixa/server.ts#L1497-L1595) and [`POST /api/users/:targetUserId/unblock`](file:///c:/remix-verixa/server.ts#L1597-L1658):
     - Require `actorCheck.verifiedByToken === true`.
     - Execute the Supabase `public.blocked_users` `upsert` / `delete` **first** and inspect `const { error } = await writeClient.from('blocked_users')...`.
     - If `error` is non-null, **do not update in-memory/JSON cache** and return `500 Internal Server Error` (or `403 Forbidden`) so a failed database write is never reported as a successful block.
   - Fix [`syncFromSupabase()`](file:///c:/remix-verixa/server/moderation/blockService.ts#L153-L280):
     - Replace the additive-only merge and broken `unblockedIds` skip list with an authoritative snapshot replacement from `public.blocked_users` (when using `SUPABASE_SERVICE_ROLE_KEY`) or per-user scoped replacement (`WHERE blocker_id = auth.uid() OR blocked_id = auth.uid()`).
     - Remove reliance on `data/blocked_users.json` in production (`NODE_ENV === 'production'`), using in-memory cache backed directly by `public.blocked_users` with immediate write-through invalidation.

3. **Lock Down All Read & Social Endpoints in [`server.ts`](file:///c:/remix-verixa/server.ts):**
   - `GET /api/users/:userId/blocked`: Require `verifyRequestActor` (`verifiedByToken === true` and `actorId === req.params.userId`). Return `401`/`403` for any other caller.
   - `GET /api/users/:targetUserId/block-status`: Derive `viewerId` strictly from the validated Bearer JWT (`actorCheck.actorId`), never from an unauthenticated `?viewerId=` query string.
   - `GET /api/users/:targetUserId/profile`, `GET /api/users/:id/followers`, `GET /api/users/:id/following`, `GET /api/users/search`: Derive `viewerId` from the validated Bearer JWT; if `isMutuallyBlocked(viewerId, targetUserId)` is true, return `403 Forbidden`.
   - `GET /api/posts/:id/likes` & `GET /api/posts/liked/:userId`: Verify the caller's JWT and check `isMutuallyBlocked(viewerId, postOwnerId)` (and `isMutuallyBlocked(viewerId, params.userId)`) before returning likes. Update [`fetchPostLikedUsers`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L1054-L1057) to pass the caller's `Authorization` header.
   - `GET /api/stories`, `GET /api/stories/:id/insights`, `DELETE /api/stories/:id`, `POST /api/stories/:id/view`, `POST /api/stories/:id/like`, `GET /api/reels`, `POST /api/reels/:id/like`: Require a validated Bearer JWT; enforce ownership on `DELETE /api/stories/:id` and `GET /api/stories/:id/insights`; filter stories/reels using the authenticated `actorId`.
   - `GET /api/notifications`, `POST /api/notifications`, `POST /api/notifications/read`, `DELETE /api/notifications/:id`: Require a validated Bearer JWT and verify ownership (`recipient_id = actorId` or `sender_id = actorId`). Fix column names in [`server.ts:1186-1194`](file:///c:/remix-verixa/server.ts#L1186-L1194) from `user_id`/`actor_id` to `recipient_id`/`sender_id`.
   - `GET /api/feed/personalized`, `GET /api/feed/explain/:postId`, `GET /api/reputation/:userId/*`, `GET /api/guardian/score/:userId`, `GET /api/behavioral/bullying-events/:userId`: Require authenticated `viewerId` and enforce `isMutuallyBlocked(viewerId, targetUserId / postAuthorId)`.

4. **Close Client/Service Bypasses ([`supabaseServices.ts`](file:///c:/remix-verixa/src/lib/supabaseServices.ts) & [`webrtcCallService.ts`](file:///c:/remix-verixa/src/lib/webrtcCallService.ts)):**
   - In [`updateMessageText`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L2823-L2871), look up the message's `receiver_id` (or rely on the fixed Supabase RLS `UPDATE` policy) and reject edits if the conversation is mutually restricted.
   - In [`webrtcCallService.ts:208-229`](file:///c:/remix-verixa/src/lib/webrtcCallService.ts#L208-L229) (`handleIncomingOffer`), check whether `signal.callerId` is restricted **before** checking `this.state !== 'idle'` or sending `call_busy` / `call_rejected`, silently dropping the offer so no presence/busy oracle is leaked.

### 7.2 Supabase SQL & RLS Remediation Requirements

1. **Remove `auth.uid() is null` from All Protected `SELECT` Policies:**
   - Replace `auth.uid() is null or auth.uid() = user_id or not public.is_blocked(auth.uid(), user_id)` on `profiles`, `posts`, `comments`, `stories`, `reels`, and `storage.objects` with authenticated checks (`auth.uid() is not null and (auth.uid() = user_id or not public.is_blocked(auth.uid(), user_id))`).
2. **Prevent Block-Initiator & Reason Leak on `public.blocked_users`:**
   - Change `"Users can view their own block relationships"` `SELECT` policy to `using (auth.uid() = blocker_id)` so only the blocker can read rows directly from `public.blocked_users` (including `reason`), and provide a dedicated `SECURITY DEFINER` RPC `public.get_my_restricted_user_ids()` that returns only the array of mutually restricted UUIDs for `auth.uid()` without exposing `blocker_id` or `reason`.
3. **Restrict `public.is_blocked(user_a, user_b)` to Authenticated Participant Queries & Optimize Performance:**
   - Revoke `EXECUTE` from `anon`.
   - Inside `public.is_blocked(user_a, user_b)`, require `auth.uid() is not null and (auth.uid() = user_a or auth.uid() = user_b)` when called directly via RPC (or keep an internal helper for RLS), and query **only** the indexed `public.blocked_users` table once existing `moderation_logs` block entries are backfilled into `public.blocked_users`.
4. **Fix `public.messages` Overlapping `UPDATE` Policy:**
   - Drop policy `"Users can update their own messages"` on `public.messages` and replace it with a policy that requires `auth.uid() = sender_id and not public.is_blocked(sender_id, receiver_id)`.
5. **Tighten Policies on `stories`, `reels`, `follows`, `likes`, `post_likes`, and `comments`:**
   - Drop the permissive `insert/update/delete (true)` policies on `public.stories` and `public.reels` ([`supabase_schema.sql:410-430`](file:///c:/remix-verixa/supabase_schema.sql#L410-L430)) and require `auth.uid() = user_id`.
   - Update `SELECT` policies on `follows`, `likes`, and `post_likes` to enforce `not public.is_blocked(...)`.
   - Update `comments` `SELECT` and `INSERT` policies to check `not public.is_blocked(auth.uid(), post_owner_id)` and `not public.is_blocked(auth.uid(), reel_owner_id)`.
6. **Add `is_blocked` Checks to `SECURITY DEFINER` RPCs:**
   - Update `public.create_interaction_notification` and `public.record_story_view` to abort if `public.is_blocked(auth.uid(), target_user_id)` is true.
   - Add `set search_path = public, pg_temp` to `public.cleanup_expired_stories`.
7. **Media Storage Hardening (`app-files`):**
   - To enforce media privacy at the storage layer, transition user post/story/reel/message media to a private bucket (`public = false`) stored as object paths (`<userId>/<folder>/<file>`) rather than permanent `/object/public/` URLs, reduce signed URL TTL from `3600` seconds to a short window (e.g., `60–300` seconds) or proxy media downloads through an authenticated endpoint that checks `isMutuallyBlocked` on every request.

### 7.3 Migration & Rollback Plan (Awaiting Approval)

> **NOTE:** Per strict review instructions, **no database migrations, policy changes, or code edits have been executed.**

- **Forward Migration Plan (Once Approved):**
  1. Backfill any legacy block records from `public.moderation_logs` (`type = 'user_block'`) and `data/blocked_users.json` into `public.blocked_users`.
  2. Apply the hardened SQL migration in a single transaction on Supabase (`public.blocked_users`, `public.is_blocked`, `public.get_my_restricted_user_ids`, trigger `on_user_blocked_cleanup`, and corrected RLS policies on `profiles`, `posts`, `comments`, `stories`, `reels`, `follows`, `likes`, `post_likes`, `messages`, `notifications`, and `storage.objects`).
  3. Set `SUPABASE_SERVICE_ROLE_KEY` in the backend environment and deploy the hardened `verifyRequestActor` + endpoint authorization fixes.
  4. Re-run an authenticated two-session E2E adversarial verification suite (`User A` JWT + `User B` JWT) verifying both Express routes and direct Supabase REST/Storage queries.

- **Rollback Plan:**
  1. Restore prior RLS policy definitions on `profiles`, `posts`, `comments`, `stories`, `reels`, `follows`, `messages`, `notifications`, and `storage.objects` via a snapshot SQL rollback script before applying the migration.
  2. Retain `public.blocked_users` table data intact (non-destructive rollback) while reverting function/policy definitions if any client query regression is observed.
