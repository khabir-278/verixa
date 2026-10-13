# VERIXA — PHASE 4 STORAGE PRIVACY READINESS & MIGRATION PLAN (POST-PATCH)

**Assessment Date:** 2026-10-11  
**Assessment Mode:** Local Code & SQL Remediation Complete; Live Bucket Remains Untouched (`public = true`) Pending Explicit Approval  
**Phase 4 Readiness Decision:** **READY FOR STAGED EXECUTION (ALL APPLICATION & SQL STORAGE DEFECTS `STOR-01`–`STOR-05` AND `SQL-05` RESOLVED LOCALLY)**

---

## 1. Read-Only Live Inventory of `app-files` Bucket

Using read-only Supabase Storage listing (`supabase.storage.from('app-files').list(...)`), we inventoried the entire `app-files` bucket on the live project (`https://jnbaumemwxydjktwedtz.supabase.co`).

### 1.1 Bucket Configuration & Object Totals
- **Bucket ID:** `app-files`
- **Current Live Visibility:** **PUBLIC** (`/storage/v1/object/public/app-files/<path>` currently returns `HTTP 200 OK` on live Supabase because bucket privatization was not executed under the mandatory stop boundary)
- **Total Stored Objects:** **89 files** across **13 root `<user_uuid>` folders**
- **Critical Metadata Finding (`owner` column):** **All 89 objects (100%) have `owner: null` in `storage.objects`**. Ownership is encoded in the first path segment (`<user_uuid>/<category>/<filename>`).

### 1.2 Breakdown by Root User Folder & Subfolder Category
| Category Subfolder | Object Count | Path Pattern in `app-files` | File Types Observed | Usage in Application |
| :--- | :---: | :--- | :--- | :--- |
| `posts/` | **34** | `<user_uuid>/posts/<ts>_<rand>.<ext>` | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.mp4`, `.jfif` | Feed post images/videos (`public.posts.media_url`), Reel videos (`public.reels.video_url`), and Story uploads (`public.stories.media_url`) |
| `audio/` | **17** | `<user_uuid>/audio/voice_<ts>.webm` | `.webm` | Direct-message voice notes (`public.messages.media_url`) |
| `profileImages/` | **16** | `<user_uuid>/profileImages/<ts>_<rand>.<ext>` | `.jpg`, `.jpeg`, `.png`, `.webp`, `.jfif` | User profile avatars (`public.profiles.avatar`) |
| `messages/` | **13** | `<user_uuid>/messages/<ts>_<rand>.<ext>` | `.png`, `.jpg` | Direct-message image/file attachments (`public.messages.media_url`) |
| `brand/` | **6** | `c7aa8500-26f1-4c6f-ac9d-deaf95373544/brand/<name>` | `.png`, `.jpg` | Unused legacy uploads (`verixa-emblem.png`, etc.); the app uses static SVG/data-URI emblems and external Unsplash/Mixkit demo URLs |
| `covers/` | **3** | `<user_uuid>/covers/<ts>_<rand>.<ext>` | `.png`, `.jfif` | User profile cover banners (`public.profiles.cover`) |
| **Total** | **89** | Across 13 `<user_uuid>` prefixes | — | — |

### 1.3 Intentionally Public External Assets (Preserved Separately)
To ensure public assets that are intentionally public do not break when `app-files` is privatized, [`extractStorageObjectTarget`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L59-L116) explicitly distinguishes protected Supabase Storage objects (`isProtected: true`) from intentionally public external/static URLs (`isProtected: false`):
- **Protected Storage Media (`isProtected: true`):**
  - Any relative storage path (`<user_uuid>/<folder>/<file>`)
  - Any bucket-prefixed path (`app-files:<user_uuid>/<folder>/<file>`)
  - Any Supabase Storage URL containing `/storage/v1/object/public/...`, `/storage/v1/object/sign/...`, or `/storage/v1/object/authenticated/...`
- **Intentionally Public External / Static Media (`isProtected: false`, preserved as-is for unblocked users):**
  - OAuth provider profile avatars (`https://lh3.googleusercontent.com/...`, `https://avatars.githubusercontent.com/...`)
  - Generated initial-letter fallback avatars (`https://ui-avatars.com/api/...`)
  - Curated demo/placeholder media (`https://images.unsplash.com/...`, `https://assets.mixkit.co/...`)
  - Local browser object/data URLs (`blob:...`, `data:...`) and root-relative Vite static assets (`/vite.svg`, etc.)

---

## 2. Resolution of All Storage & Media Defects (`STOR-01` Through `STOR-05` & `SQL-05`)

| Finding ID | Defect Summary | Patched Files & Line References | Verification Status |
| :--- | :--- | :--- | :--- |
| **`STOR-01`** | `getSignedMediaUrl` previously fell back to `getPublicUrl(objectPath)` on `createSignedUrl` failure and used a 3600s TTL. | [`src/lib/supabaseServices.ts:15-17`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L15-L17), [`src/lib/supabaseServices.ts:174-243`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L174-L243): Removed `getPublicUrl` fallback completely. Reduced `DEFAULT_SIGNED_URL_TTL_SECONDS` to `300` (5 minutes). Returns `''` whenever `createSignedUrl` fails, object is missing, path is invalid, or owner is restricted. | **PASS (`T19`, `T20`)** |
| **`STOR-02`** | `loadReels`, `addReel`, and `fetchReelById` did not resolve signed URLs for relative `video_url` paths (`<uuid>/posts/...mp4`) or fell back to raw `row.video_url`. | [`src/lib/supabaseServices.ts:276-308`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L276-L308) (`resolveReelSignedUrls`, `resolveReelsSignedUrls`), [`src/lib/supabaseServices.ts:1132-1135`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L1132-L1135) (`fetchReelById`), and [`src/context/AppContext.tsx:984-1011`](file:///c:/remix-verixa/src/context/AppContext.tsx#L984-L1011), [`AppContext.tsx:2877-2881`](file:///c:/remix-verixa/src/context/AppContext.tsx#L2877-L2881): All reel video paths and creator avatars are resolved via `getSignedMediaUrl`; reels with unresolvable protected video URLs are filtered out. | **PASS (`T19`)** |
| **`STOR-03`** | `normalizeStoryItem`, `resolvePostSignedUrls`, and `resolveUserProfileSignedUrls` fell back to raw media URLs (`resolvedMedia \|\| rawMedia`) when signed resolution returned `''`. | [`src/lib/supabaseServices.ts:251-274`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L251-L274) (`resolvePostSignedUrls`, `resolveUserProfileSignedUrls`) and [`src/context/AppContext.tsx:883-948`](file:///c:/remix-verixa/src/context/AppContext.tsx#L883-L948) (`normalizeStoryItem`): Removed `\|\| rawMedia`, `\|\| post.mediaUrl`, and `\|\| rawAvatar` fallbacks for protected storage media. Stories without a valid signed `mediaUrl` are filtered out in `loadStories`. | **PASS (`T19`)** |
| **`STOR-04`** | `uploadVoiceNote` and `deleteStorageFile` did not verify authenticated caller ownership of the `<user_uuid>/...` storage path prefix, and `uploadVoiceNote` fell back to raw `data.path` when signing failed. | [`src/lib/supabaseServices.ts:148-171`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L148-L171) (`hasValidStorageObjectPath`), [`src/lib/supabaseServices.ts:3443-3489`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L3443-L3489) (`uploadVoiceNote`), [`src/lib/supabaseServices.ts:3982-4033`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L3982-L4033) (`uploadFileToSupabase`), and [`src/lib/supabaseServices.ts:4103-4143`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L4103-L4143) (`deleteStorageFile`): Both functions call `supabase.auth.getUser()`, reject unauthenticated callers, enforce `hasValidStorageObjectPath(path, user.id).valid`, and throw on foreign user paths or storage errors. | **PASS (`T18`)** |
| **`STOR-05`** | Expired signed URLs were not inspected for JWT `exp` expiration or safely refreshed, and `ChatVoicePlayer` bypassed `getSignedMediaUrl` for `http` storage URLs. | [`src/lib/supabaseServices.ts:122-146`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L122-L146) (`isSignedStorageUrlExpired`), [`src/lib/supabaseServices.ts:245-249`](file:///c:/remix-verixa/src/lib/supabaseServices.ts#L245-L249) (`refreshSignedMediaUrl`), and [`src/pages/MessagesPage.tsx:139-265`](file:///c:/remix-verixa/src/pages/MessagesPage.tsx#L139-L265) (`ChatVoicePlayer`): Inspects embedded JWT `exp` claim on signed URLs, evicts expired entries, re-verifies mutual-block status before refreshing, and refreshes expired voice-note URLs in `ChatVoicePlayer`. | **PASS (`T20`)** |
| **`SQL-05`** | `storage.objects` RLS policy was `PERMISSIVE` and allowed `owner IS NULL` (matching all 89 live objects). | [`migrations/20261011_block_system_hardening_up.sql:195-218`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L195-L218) & [`up.sql:908-979`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql#L908-L979): Added `public.storage_object_owner_uuid(name, owner)` reading `(storage.foldername(name))[1]`, dropped all 23 legacy permissive policies on `storage.objects`, and created both `PERMISSIVE` ownership policies and `AS RESTRICTIVE` `storage_objects_restrict_blocked`. | **PASS (`T22`)** |

---

## 3. Staged Migration Plan to Private Storage (`app-files`)

### Stage 1 — Deploy Application & Phase 2 SQL Hardening (Completed Locally; Ready for Live Approval)
1. Deploy the patched frontend and backend (`src/lib/supabaseServices.ts`, `src/context/AppContext.tsx`, `src/pages/MessagesPage.tsx`, `server/moderation/blockService.ts`) and execute [`migrations/20261011_block_system_hardening_up.sql`](file:///c:/remix-verixa/migrations/20261011_block_system_hardening_up.sql).
2. Verify in browser DevTools Network tab that all post images, avatars, covers, story media, reel videos, chat attachments, and voice notes are fetched using `/storage/v1/object/sign/app-files/...?...token=...` and **zero** requests are made to `/storage/v1/object/public/app-files/...`.

### Stage 2 — Optional `storage.objects.owner` Metadata Backfill (Defense-in-Depth)
Although `public.storage_object_owner_uuid(name, owner)` already derives ownership from `(storage.foldername(name))[1]` even when `owner IS NULL`, we can optionally backfill `storage.objects.owner` during the Phase 4 maintenance window:
```sql
UPDATE storage.objects so
SET owner = public.try_parse_uuid((storage.foldername(so.name))[1]),
    owner_id = (storage.foldername(so.name))[1]
WHERE so.bucket_id = 'app-files'
  AND so.owner IS NULL
  AND public.try_parse_uuid((storage.foldername(so.name))[1]) IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = public.try_parse_uuid((storage.foldername(so.name))[1])
  );
```

### Stage 3 — Bucket Visibility Switch (`public = true` → `public = false`)
Once Stage 1 is live and explicitly approved:
```sql
UPDATE storage.buckets
SET public = false
WHERE id = 'app-files';
```

### Stage 4 — Post-Switch Live Validation Checklist
1. **Direct Public URL Rejection Test:**
   - Request `GET https://jnbaumemwxydjktwedtz.supabase.co/storage/v1/object/public/app-files/e825d91d-4d19-4283-bd1f-9da12cf0ff10/posts/1775573634585_x0a13e.jpg` without a token → must return `400`/`404`.
2. **Unblocked User Signed URL Test:**
   - Authenticated User A (not blocked with User B) calls `supabase.storage.from('app-files').createSignedUrl('<user_b_uuid>/posts/...', 300)` → succeeds (`200 OK`) and media renders in feed, stories, reels, and chat.
3. **Mutually Blocked User Signed URL Rejection Test (Both Directions A→B and B→A):**
   - User A blocks User B.
   - User B calls `supabase.storage.from('app-files').createSignedUrl('<user_a_uuid>/posts/...', 300)` → denied by `storage_objects_restrict_blocked` (`AS RESTRICTIVE` policy).
   - User A calls `createSignedUrl` on User B's object → also denied (mutual block).
4. **Cross-User Upload / Delete Rejection Test:**
   - User B attempts to upload or delete an object under `<user_a_uuid>/posts/test.jpg` → rejected both by client helper (`hasValidStorageObjectPath`) and by database `storage_objects_insert_own` / `storage_objects_delete_own`.

---

## 4. URL Expiration Implications & Instant Rollback Procedure

### 4.1 URL Expiration Implications
- **Short-Lived Signed URLs (`300s` TTL):**
  - Signed URLs issued by `createSignedUrl(path, 300)` expire 5 minutes after issuance.
  - When a user blocks another account via `blockUserAccount()`, `evictSignedUrlsForUser(targetUserId)` immediately purges all cached signed URLs for that user from memory, and `refreshSignedMediaUrl()` refuses to mint new signed URLs for restricted users.
  - **Architectural Limitation:** Any signed URL already fetched by a blocked user's browser before the block occurred remains cryptographically valid at the Supabase Storage CDN edge until its 5-minute `exp` timestamp elapses.

### 4.2 Instant Rollback Procedure
If privatizing `app-files` causes any unexpected media rendering issue in production:
```sql
UPDATE storage.buckets
SET public = true
WHERE id = 'app-files';
```
Because no objects are moved, deleted, or renamed during Stage 3, reverting `public = true` restores public URL access instantaneously with zero data loss.
