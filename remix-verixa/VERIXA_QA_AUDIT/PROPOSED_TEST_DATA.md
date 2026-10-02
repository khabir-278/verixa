# VERIXA QA AUDIT — GATE 3: TEST DATA MATRIX & REALTIME EVENT SPECIFICATION

**Document Version:** 3.0.0  
**Audit Stage:** GATE 3 — SYNTHETIC TEST DATA EXECUTION & MANIFEST (COMPLETED)  
**Author:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Date:** September 24, 2026  
**Target Environment:** Shared Development-Staging Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Current Status:** `COMPLETED & VERIFIED` (All 20 approved QA operations executed and logged)

---

## 1. Executive Summary & Provisioned QA Identities

Following the user's explicit token `APPROVED — CREATE TEST DATA`, all 20 approved QA test operations were executed under strict Option A quarantine between User A (`@doc_auditor`) and User B (`@qa_user_b`).

### 1.1 Verified QA Actor Identities

| Actor | Username | Email | UUID in `auth.users` & `public.profiles` | Role / Safety Score | Verification Status |
|---|---|---|---|---|---|
| **User A** (Primary) | `@doc_auditor` | `test_doc_user@verixa.com` | `c7aa8500-26f1-4c6f-ac9d-deaf95373544` | Verified Member / 100 | Authenticated / Email Confirmed |
| **User B** (Peer) | `@qa_user_b` | `qa_user_b@verixa.internal` | `9cd3413e-94ae-4bc8-b64d-ba42c21599be` | Verified Member / 100 | Authenticated / Auto-Confirmed |

### 1.2 Mandatory Safety Invariants Verified
1. **Zero Real-User Interference:** All 9 identified real/personal accounts (`@khabir`, `@syedkhabirhameed`, `@jashu_2426`, `@istemsettyhem`, `@vuyyalaharsha15`, `@poojitha__2008`, `@lonely_girl_123`, `@puppyyy_2357__`, `@sridhari_2679_`) and their data remain **100% READ-ONLY and UNTOUCHED**.
2. **Universal Tagging:** Every piece of synthetic content created during testing carries the explicit prefix **`[VERIXA-QA]`**.
3. **Specific UUID Targeting for Cleanup:** As mandated, Gate 7 cleanup targets only the exact UUIDs recorded in `VERIXA_QA_AUDIT/TEST_DATA_MANIFEST.md`, protecting User A from any broad deletion.

---

## 2. Master Synthetic Test Data Inventory & Live Record UUIDs

### 2.1 Posts (`public.posts`) — Total: 4 Records

| QA Identifier | Owner | Live Record ID | Content / Caption | Media Attachment | Verified Moderation Outcome | Realtime Event | Status |
|---|---|---|---|---|---|---|---|
| `QA-POST-01` | **User A** | `338eab85-abc0-47d7-9ad6-f8a19b0c0c5f` | `[VERIXA-QA] Standard baseline post for feed layout, typography, and timestamp verification.` | None (Text-only fallback) | `approved` (Safety Score: 98, Status: `approved`) | `posts:INSERT` broadcast | `CREATED` |
| `QA-POST-02` | **User A** | `c2d82f70-f648-4b7b-8a62-9022f3eeb9aa` | `[VERIXA-QA] Discussion post: What are the best practices for online AI moderation? Let us test comment threading below.` | Permitted royalty-free Unsplash CDN image (`https://images.unsplash.com/photo-1579783900882-c0d3dad7b119...`) | `approved` (Safety Score: 99, Status: `approved`) | `posts:INSERT` broadcast | `CREATED` |
| `QA-POST-03` | **User A** | `c05633a5-9301-4abd-8e9f-6ae3927287a0` | `[VERIXA-QA] Borderline sentiment test: I am utterly sick and tired of these terrible latency spikes on the network today!` | None | `approved` (Safety Score: 75, Status: `approved`) | `posts:INSERT` broadcast | `CREATED` |
| `QA-POST-04` | **User A** | `mod_1790256467973_7dtjchl` (Analysis ID; 0 DB rows) | `[VERIXA-QA] [TEST-BLOCK] You are completely worthless and should go kill yourself right now.` | None | `blocked` (Decision: `BLOCK`, ToxicityScore: 100, Reason: Bullying, Personal attacks, Threats) | Block modal intercept / Enqueued for review | `BLOCKED_PRE_FLIGHT` |

---

### 2.2 Comments (`public.comments`) — Total: 3 Records

| QA Identifier | Author | Post Target | Live Record ID | Comment Text | Verified Moderation Outcome | Realtime Event | Status |
|---|---|---|---|---|---|---|---|
| `QA-COMM-01` | **User B** | `QA-POST-02` | `f3c364e8-09e4-451b-abbe-df1e7a97b8e7` | `[VERIXA-QA] Verified clean response from secondary audit peer. Threading functions properly!` | `approved` (Toxicity: 0) | `comments:INSERT` broadcast | `CREATED` |
| `QA-COMM-02` | **User A** | `QA-POST-02` | `13285b66-e396-4b6d-a449-989e3d41b9c2` | `[VERIXA-QA] Author reply confirming multi-turn comment interaction.` | `approved` (Toxicity: 0) | `comments:INSERT` broadcast | `CREATED` |
| `QA-COMM-03` | **User B** | `QA-POST-02` | `mod_1790256475619_e98c3cd` (Analysis ID; 0 DB rows) | `[VERIXA-QA] [TEST-TOXIC] Shut up you pathetic idiot, nobody asked for your opinion.` | `blocked` (Decision: `BLOCK`, ToxicityScore: 78, Reason: Personal attacks, Bullying, Harassment) | Block modal intercept | `BLOCKED_PRE_FLIGHT` |

---

### 2.3 Social Likes (`public.likes`) — Total: 2 Operations

| QA Identifier | User | Target Post | Live Record ID | Action Sequence | Verified State | Status |
|---|---|---|---|---|---|---|
| `QA-LIKE-01` | **User B** | `QA-POST-01` | `c7236f33-7712-4359-a5dd-c8fdbc4fddc9` (Deleted) | Insert ➔ Verify ➔ Delete | Unliked (0 records remaining) | `TOGGLED_AND_REMOVED` |
| `QA-LIKE-02` | **User B** | `QA-POST-02` | `e22b0b3a-f310-435f-b9f6-7d0d7400647e` | Insert (Persistent) | Post likes count = 1 | `CREATED` |

---

### 2.4 Follow Relationships (`public.follows`) — Total: 3 Operations

| QA Identifier | Follower | Following | Live Record ID | Verified Database Result | Realtime Event | Status |
|---|---|---|---|---|---|---|
| `QA-FOL-01` | **User A** | **User B** | `782cefe0-b930-434a-9e19-aed2b1390547` | Row inserted | `follows:INSERT` | `CREATED` |
| `QA-FOL-02` | **User B** | **User A** | `f616819d-7dd6-4466-bfd3-670b3a79c970` | Row inserted | `follows:INSERT` | `CREATED` |
| `QA-FOL-03` | **User A** | **User A** | `N/A` (Rejected) | **REJECTED** by DB constraint `check (follower_id != following_id)` (Code 23514 `no_self_follow`) | None | `REJECTED_BY_CONSTRAINT` |

---

### 2.5 Ephemeral Stories (`public.stories`) — Total: 4 Operations

| QA Identifier | Actor | Live Record ID | Action | Verified Result | Status |
|---|---|---|---|---|---|
| `QA-STORY-01` | **User A** | `0a556b18-5123-4dab-8870-d000b33418e9` | Create Story | `approved`, 24h expiry (`expires_at`) | `CREATED` |
| `QA-STORY-VIEW-01` | **User B** | `0a556b18-5123-4dab-8870-d000b33418e9` | View Story | `viewed_by` contains User B UUID, `views_count = 1` | `VERIFIED_UPDATED` |
| `QA-STORY-LIKE-01` | **User B** | `0a556b18-5123-4dab-8870-d000b33418e9` | Like Story | `liked_by` contains User B UUID, `likes_count = 1` | `VERIFIED_UPDATED` |
| `QA-STORY-NAV-01` | **User B** | `N/A (Client Route)` | Router Check | Route resolves to `/profile/doc_auditor` | `VERIFIED_FUNCTIONAL` |

---

### 2.6 Direct Messaging (`public.messages`) — Total: 3 Messages

| QA Identifier | Sender | Receiver | Live Record ID | Content | Status |
|---|---|---|---|---|---|
| `QA-MSG-01` | **User A** | **User B** | `76d580c3-d0cb-4a51-812c-1604c2ab3fa0` | `[VERIXA-QA] Peer messaging check: WebSocket channel initialization.` | `CREATED` |
| `QA-MSG-02` | **User B** | **User A** | `abc8a666-f05d-4ca9-ab69-be10d763b639` | `[VERIXA-QA] Peer acknowledgment received: Channel fully operational.` | `CREATED` |
| `QA-MSG-03` | **User B** | **User A** | `dc3a240a-2686-4f7e-9643-336fe05dd1ef` | `[VERIXA-QA] Unread badge counter verification message.` | `CREATED` |

---

### 2.7 Activity Notifications (`data/notifications.json`) — Total: 3 Notifications

| QA Identifier | Recipient | Sender | Live Record ID | Verified Notification Message | Status |
|---|---|---|---|---|---|
| `QA-NOTIF-01` | **User A** | **User B** | `notif_1790256485280_0ee84cd6` | `liked your post: "[VERIXA-QA] Discussion post: What are the best practices..."` | `CREATED` |
| `QA-NOTIF-02` | **User A** | **User B** | `notif_1790256485297_a311b7bf` | `commented on your post: "[VERIXA-QA] Verified clean response from secondary audit peer..."` | `CREATED` |
| `QA-NOTIF-03` | **User A** | **User B** | `notif_1790256485313_e110ebea` | `started following you` | `CREATED` |

---

### 2.8 Community Safety, Reports & Appeals — Total: 2 Records

| QA Identifier | Submitting Actor | Action / Type | Live Record ID | Verified Result | Status |
|---|---|---|---|---|---|
| `QA-REP-01` | **User B** | Report | `rep_1790256485321_wcwxj` | Reason: `HARASSMENT`, Enqueued with `PENDING` status | `CREATED` |
| `QA-APP-01` | **User A** | Appeal | `apl_1790256485802_9kjyg` | Reason: `QA Safety Evaluation`, Enqueued with `PENDING` status | `CREATED` |

---

### 2.9 Bookmarks / Saved Posts (`public.saved_posts`) — Total: 1 Record

| QA Identifier | User | Target Post | Live Record ID | Verified Result | Status |
|---|---|---|---|---|---|
| `QA-SAVE-01` | **User A** | `QA-POST-01` | `50805a28-516a-49f6-ac14-5cf70d230942` | Row inserted with `auth.uid() = user_id` | `CREATED` |

---

## 3. Revised Specific-ID Cleanup Protocol (Gate 7 Compliance)

> [!IMPORTANT]
> **Safety Mandate Enforced:** In accordance with the Gate 3 safety correction, cleanup does **NOT** target records using broad criteria like `user_id = 'c7aa8500-26f1-4c6f-ac9d-deaf95373544'` (User A). User A is an existing QA account and any non-audit or legitimate records belonging to User A are strictly preserved.
> 
> Cleanup targets **only the exact UUIDs recorded in this manifest**.

```sql
-- 1. Purge QA Saved Post (Specific UUID)
DELETE FROM public.saved_posts WHERE id IN ('50805a28-516a-49f6-ac14-5cf70d230942');

-- 2. Purge QA Direct Messages (Specific UUIDs)
DELETE FROM public.messages WHERE id IN (
  '76d580c3-d0cb-4a51-812c-1604c2ab3fa0',
  'abc8a666-f05d-4ca9-ab69-be10d763b639',
  'dc3a240a-2686-4f7e-9643-336fe05dd1ef'
);

-- 3. Purge QA Story (Specific UUID)
DELETE FROM public.stories WHERE id IN ('0a556b18-5123-4dab-8870-d000b33418e9');

-- 4. Purge QA Follows (Specific UUIDs)
DELETE FROM public.follows WHERE id IN (
  '782cefe0-b930-434a-9e19-aed2b1390547',
  'f616819d-7dd6-4466-bfd3-670b3a79c970'
);

-- 5. Purge QA Likes (Specific UUID)
DELETE FROM public.likes WHERE id IN ('e22b0b3a-f310-435f-b9f6-7d0d7400647e');

-- 6. Purge QA Comments (Specific UUIDs)
DELETE FROM public.comments WHERE id IN (
  'f3c364e8-09e4-451b-abbe-df1e7a97b8e7',
  '13285b66-e396-4b6d-a449-989e3d41b9c2'
);

-- 7. Purge QA Posts (Specific UUIDs)
DELETE FROM public.posts WHERE id IN (
  '338eab85-abc0-47d7-9ad6-f8a19b0c0c5f',
  'c2d82f70-f648-4b7b-8a62-9022f3eeb9aa',
  'c05633a5-9301-4abd-8e9f-6ae3927287a0'
);

-- 8. Purge Secondary Synthetic Auditor User B
DELETE FROM public.profiles WHERE id = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';
DELETE FROM auth.users WHERE id = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';
```
