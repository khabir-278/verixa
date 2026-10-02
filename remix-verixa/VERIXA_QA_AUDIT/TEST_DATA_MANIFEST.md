# VERIXA QA AUDIT — GATE 3: TEST DATA MANIFEST

**Document Version:** 1.0.0  
**Audit Stage:** GATE 3 — SYNTHETIC TEST DATA CREATION & MANIFEST VERIFICATION  
**Execution Timestamp:** September 24, 2026, 13:28:06 UTC  
**Environment:** Shared Development-Staging Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Status:** `COMPLETED & VERIFIED`

---

## 1. Verified QA Identities & Safety Status

| Actor | Username | Email | UUID | Role / Privileges | Data Quarantine Status |
|---|---|---|---|---|---|
| **User A** (Primary) | `@doc_auditor` | `test_doc_user@verixa.com` | `c7aa8500-26f1-4c6f-ac9d-deaf95373544` | Verified Member (Default) | Protected account; specific QA ID targeting only |
| **User B** (Peer) | `@qa_user_b` | `qa_user_b@verixa.internal` | `9cd3413e-94ae-4bc8-b64d-ba42c21599be` | Verified Member (Default) | Ephemeral synthetic auditor; cleanable at Gate 7 |

*Real-User Isolation Verification:* Zero interactions with, modifications to, or notifications dispatched to any of the 9 authentic human users (`@khabir`, `@syedkhabirhameed`, `@jashu_2426`, etc.).

---

## 2. Complete Test Data Manifest Matrix

The table below catalogs every record, operation, pre-flight moderation intercept, and constraint verification executed during Gate 3:

| QA Identifier | Category / Target Table | Record UUID / ID | Owner / Actor | Timestamp (UTC) | Intended Moderation Outcome | Realtime Event | Status |
|---|---|---|---|---|---|---|---|
| `QA-POST-01` | Post (`public.posts`) | `338eab85-abc0-47d7-9ad6-f8a19b0c0c5f` | User A (`@doc_auditor`) | 2026-09-24 13:27:47 | `approved` (Safety Score: 98) | `posts:INSERT` broadcast | `CREATED` |
| `QA-POST-02` | Post (`public.posts`) | `c2d82f70-f648-4b7b-8a62-9022f3eeb9aa` | User A (`@doc_auditor`) | 2026-09-24 13:27:47 | `approved` (Safety Score: 99) | `posts:INSERT` broadcast | `CREATED` |
| `QA-POST-03` | Post (`public.posts`) | `c05633a5-9301-4abd-8e9f-6ae3927287a0` | User A (`@doc_auditor`) | 2026-09-24 13:27:47 | `approved` (Safety Score: 75) | `posts:INSERT` broadcast | `CREATED` |
| `QA-POST-04` | Post Pre-Flight Intercept (0 DB rows) | `mod_1790256467973_7dtjchl` | User A (`@doc_auditor`) | 2026-09-24 13:27:55 | `blocked` (Toxicity: 100, Reason: Bullying, Personal attacks, Threats) | Block modal intercept / Enqueued for review | `BLOCKED_PRE_FLIGHT` |
| `QA-COMM-01` | Comment (`public.comments`) | `f3c364e8-09e4-451b-abbe-df1e7a97b8e7` | User B (`@qa_user_b`) | 2026-09-24 13:27:55 | `approved` (Toxicity: 0) | `comments:INSERT` broadcast | `CREATED` |
| `QA-COMM-02` | Comment (`public.comments`) | `13285b66-e396-4b6d-a449-989e3d41b9c2` | User A (`@doc_auditor`) | 2026-09-24 13:27:55 | `approved` (Toxicity: 0) | `comments:INSERT` broadcast | `CREATED` |
| `QA-COMM-03` | Comment Pre-Flight Intercept (0 DB rows) | `mod_1790256475619_e98c3cd` | User B (`@qa_user_b`) | 2026-09-24 13:28:02 | `blocked` (Toxicity: 78, Reason: Personal attacks, Bullying, Harassment) | Block modal intercept | `BLOCKED_PRE_FLIGHT` |
| `QA-LIKE-01` | Like Toggle Cycle (`public.likes`) | `c7236f33-7712-4359-a5dd-c8fdbc4fddc9` | User B (`@qa_user_b`) | 2026-09-24 13:28:03 | N/A | `likes:INSERT` -> `likes:DELETE` (0 rows remaining) | `TOGGLED_AND_REMOVED` |
| `QA-LIKE-02` | Like Persistent (`public.likes`) | `e22b0b3a-f310-435f-b9f6-7d0d7400647e` | User B (`@qa_user_b`) | 2026-09-24 13:28:03 | N/A | `likes:INSERT` | `CREATED` |
| `QA-FOL-01` | Follow (`public.follows`) | `782cefe0-b930-434a-9e19-aed2b1390547` | User A (`@doc_auditor`) | 2026-09-24 13:28:03 | N/A | `follows:INSERT` (User A -> User B) | `CREATED` |
| `QA-FOL-02` | Follow (`public.follows`) | `f616819d-7dd6-4466-bfd3-670b3a79c970` | User B (`@qa_user_b`) | 2026-09-24 13:28:04 | N/A | `follows:INSERT` (User B -> User A) | `CREATED` |
| `QA-FOL-03` | Follow Constraint Check (0 DB rows) | `N/A (Rejected)` | User A (`@doc_auditor`) | 2026-09-24 13:28:04 | Rejected (Code: 23514 `no_self_follow`) | None | `REJECTED_BY_CONSTRAINT` |
| `QA-STORY-01` | Story (`public.stories`) | `0a556b18-5123-4dab-8870-d000b33418e9` | User A (`@doc_auditor`) | 2026-09-24 13:28:04 | `approved` | `stories:INSERT` | `CREATED` |
| `QA-STORY-VIEW-01` | Story View Action (`public.stories`) | `0a556b18-5123-4dab-8870-d000b33418e9` | User B (`@qa_user_b`) | 2026-09-24 13:28:04 | N/A | Local state / `views_count` increment | `VERIFIED_UPDATED` |
| `QA-STORY-LIKE-01` | Story Like Action (`public.stories`) | `0a556b18-5123-4dab-8870-d000b33418e9` | User B (`@qa_user_b`) | 2026-09-24 13:28:05 | N/A | `story_likes:INSERT` / `likes_count` increment | `VERIFIED_UPDATED` |
| `QA-STORY-NAV-01` | Story Router Check | `N/A (Client Route)` | User B (`@qa_user_b`) | 2026-09-24 13:28:05 | Passed | Router transition to `/profile/doc_auditor` | `VERIFIED_FUNCTIONAL` |
| `QA-MSG-01` | Message (`public.messages`) | `76d580c3-d0cb-4a51-812c-1604c2ab3fa0` | User A (`@doc_auditor`) | 2026-09-24 13:28:05 | `approved` (AI Verified) | `messages:INSERT` (conv_doc_auditor_qa_user_b) | `CREATED` |
| `QA-MSG-02` | Message (`public.messages`) | `abc8a666-f05d-4ca9-ab69-be10d763b639` | User B (`@qa_user_b`) | 2026-09-24 13:28:05 | `approved` (AI Verified) | `messages:INSERT` (conv_doc_auditor_qa_user_b) | `CREATED` |
| `QA-MSG-03` | Message (`public.messages`) | `dc3a240a-2686-4f7e-9643-336fe05dd1ef` | User B (`@qa_user_b`) | 2026-09-24 13:28:05 | `approved` (AI Verified) | `messages:INSERT` (conv_doc_auditor_qa_user_b) | `CREATED` |
| `QA-NOTIF-01` | Notification (`data/notifications.json`) | `notif_1790256485280_0ee84cd6` | Recipient: User A, Sender: User B | 2026-09-24 13:28:05 | N/A | `notifications:INSERT` (like alert) | `CREATED` |
| `QA-NOTIF-02` | Notification (`data/notifications.json`) | `notif_1790256485297_a311b7bf` | Recipient: User A, Sender: User B | 2026-09-24 13:28:05 | N/A | `notifications:INSERT` (comment alert) | `CREATED` |
| `QA-NOTIF-03` | Notification (`data/notifications.json`) | `notif_1790256485313_e110ebea` | Recipient: User A, Sender: User B | 2026-09-24 13:28:05 | N/A | `notifications:INSERT` (follow alert) | `CREATED` |
| `QA-REP-01` | Community Report (`data/reports.json`) | `rep_1790256485321_wcwxj` | User B (`@qa_user_b`) | 2026-09-24 13:28:05 | `enqueued` (Severity: MEDIUM, Status: PENDING) | Report submission event | `CREATED` |
| `QA-APP-01` | Content Appeal (`data/appeals.json`) | `apl_1790256485802_9kjyg` | User A (`@doc_auditor`) | 2026-09-24 13:28:06 | `enqueued` (Status: PENDING) | Appeal submission event | `CREATED` |
| `QA-SAVE-01` | Saved Post (`public.saved_posts`) | `50805a28-516a-49f6-ac14-5cf70d230942` | User A (`@doc_auditor`) | 2026-09-24 13:28:06 | N/A | `saved_posts:INSERT` | `CREATED` |

---

## 3. Revised Specific-ID Cleanup Protocol (Gate 7 Compliance)

> [!IMPORTANT]
> **Safety Mandate Enforced:** In accordance with the Gate 3 safety correction, cleanup does **NOT** target records using broad criteria like `user_id = 'c7aa8500-26f1-4c6f-ac9d-deaf95373544'` (User A). User A is an existing QA account and any non-audit or legitimate records belonging to User A are strictly preserved.
> 
> Cleanup targets **only the exact UUIDs recorded in this manifest**.

### 3.1 Supabase Cloud SQL Purge
```sql
-- 1. Purge QA Saved Post (Specific UUID)
DELETE FROM public.saved_posts 
WHERE id IN ('50805a28-516a-49f6-ac14-5cf70d230942');

-- 2. Purge QA Direct Messages (Specific UUIDs)
DELETE FROM public.messages 
WHERE id IN (
  '76d580c3-d0cb-4a51-812c-1604c2ab3fa0',
  'abc8a666-f05d-4ca9-ab69-be10d763b639',
  'dc3a240a-2686-4f7e-9643-336fe05dd1ef'
);

-- 3. Purge QA Story (Specific UUID)
DELETE FROM public.stories 
WHERE id IN ('0a556b18-5123-4dab-8870-d000b33418e9');

-- 4. Purge QA Follows (Specific UUIDs)
DELETE FROM public.follows 
WHERE id IN (
  '782cefe0-b930-434a-9e19-aed2b1390547',
  'f616819d-7dd6-4466-bfd3-670b3a79c970'
);

-- 5. Purge QA Likes (Specific UUID)
DELETE FROM public.likes 
WHERE id IN ('e22b0b3a-f310-435f-b9f6-7d0d7400647e');

-- 6. Purge QA Comments (Specific UUIDs)
DELETE FROM public.comments 
WHERE id IN (
  'f3c364e8-09e4-451b-abbe-df1e7a97b8e7',
  '13285b66-e396-4b6d-a449-989e3d41b9c2'
);

-- 7. Purge QA Posts (Specific UUIDs)
DELETE FROM public.posts 
WHERE id IN (
  '338eab85-abc0-47d7-9ad6-f8a19b0c0c5f',
  'c2d82f70-f648-4b7b-8a62-9022f3eeb9aa',
  'c05633a5-9301-4abd-8e9f-6ae3927287a0'
);

-- 8. Purge Secondary Synthetic Auditor User B
DELETE FROM public.profiles WHERE id = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';
DELETE FROM auth.users WHERE id = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';
```

### 3.2 Server-Side JSON Store Purge
- **Notifications (`data/notifications.json`):** Purge `notif_1790256485280_0ee84cd6`, `notif_1790256485297_a311b7bf`, `notif_1790256485313_e110ebea`.
- **Reports (`data/reports.json`):** Purge `rep_1790256485321_wcwxj`.
- **Appeals (`data/appeals.json`):** Purge `apl_1790256485802_9kjyg`.
