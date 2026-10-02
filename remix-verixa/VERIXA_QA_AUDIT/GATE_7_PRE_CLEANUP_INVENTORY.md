# VERIXA QA AUDIT — GATE 7: PRE-CLEANUP READ-ONLY INVENTORY

**Document Version:** 1.0.0  
**Audit Stage:** GATE 7 — PRE-CLEANUP INVENTORY & PURGE PROPOSAL  
**Author:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Date:** September 24, 2026  
**Target Backend:** Supabase Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Status:** `READ-ONLY INVENTORY COMPILED — ZERO MUTATIONS EXECUTED — PENDING EXPLICIT APPROVAL`

---

## 1. Executive Summary & Cleanup Scope

This document provides a strictly read-only inventory of all synthetic test records proposed for deletion in Gate 7.
In accordance with Option A quarantine and the strict specific-UUID targeting mandate:

1. **Zero Broad Deletions:** Deletions are strictly scoped to **exact primary key UUIDs** cataloged in [`TEST_DATA_MANIFEST.md`](file:///c:/remix-verixa/VERIXA_QA_AUDIT/TEST_DATA_MANIFEST.md). No `DELETE WHERE user_id = ...` queries will be executed against Primary QA User A (`@doc_auditor`).
2. **Zero Real-User Impact:** Zero real-user posts, comments, likes, follows, stories, messages, notifications, or profiles are included.
3. **Gate 6 Transient State Verified:** The transient test comment `05efbe4f-eb4e-4978-876c-22b8c1415be3` from `MOD-12` has been verified as **already absent** (purged immediately upon insertion).
4. **Storage Cleanliness Verified:** Exactly **0** objects reside in the QA folders of bucket `app-files` (verified post-Gate 4 remediation).
5. **Zero External Emails:** Database purges trigger zero outbound SMTP or email dispatches.

---

## 2. Complete Inventory of Proposed Deletions by Tier

### Tier 1: Supabase Cloud Database Rows (Targeted by Exact Primary Key UUID)

| Category / Table | Exact Target UUID | Manifest QA ID | Owner / Actor | Timestamp Created (UTC) | Verification Status in Live DB |
|---|---|---|---|---|---|
| **`public.saved_posts`** | `50805a28-516a-49f6-ac14-5cf70d230942` | `QA-SAVE-01` | User A (`@doc_auditor`) | 2026-09-24 13:28:06 | **CONFIRMED PRESENT** |
| **`public.messages`** | `76d580c3-d0cb-4a51-812c-1604c2ab3fa0` | `QA-MSG-01` | User A &rarr; User B | 2026-09-24 13:28:05 | **CONFIRMED PRESENT** |
| **`public.messages`** | `abc8a666-f05d-4ca9-ab69-be10d763b639` | `QA-MSG-02` | User B &rarr; User A | 2026-09-24 13:28:05 | **CONFIRMED PRESENT** |
| **`public.messages`** | `dc3a240a-2686-4f7e-9643-336fe05dd1ef` | `QA-MSG-03` | User B &rarr; User A | 2026-09-24 13:28:05 | **CONFIRMED PRESENT** |
| **`public.stories`** | `0a556b18-5123-4dab-8870-d000b33418e9` | `QA-STORY-01` | User A (`@doc_auditor`) | 2026-09-24 13:28:04 | **CONFIRMED PRESENT** |
| **`public.follows`** | `782cefe0-b930-434a-9e19-aed2b1390547` | `QA-FOL-01` | User A &rarr; User B | 2026-09-24 13:28:03 | **CONFIRMED PRESENT** |
| **`public.follows`** | `f616819d-7dd6-4466-bfd3-670b3a79c970` | `QA-FOL-02` | User B &rarr; User A | 2026-09-24 13:28:04 | **CONFIRMED PRESENT** |
| **`public.likes`** | `e22b0b3a-f310-435f-b9f6-7d0d7400647e` | `QA-LIKE-02` | User B (`@qa_user_b`) | 2026-09-24 13:28:03 | **CONFIRMED PRESENT** |
| **`public.comments`** | `f3c364e8-09e4-451b-abbe-df1e7a97b8e7` | `QA-COMM-01` | User B (`@qa_user_b`) | 2026-09-24 13:27:55 | **CONFIRMED PRESENT** |
| **`public.comments`** | `13285b66-e396-4b6d-a449-989e3d41b9c2` | `QA-COMM-02` | User A (`@doc_auditor`) | 2026-09-24 13:27:55 | **CONFIRMED PRESENT** |
| **`public.posts`** | `338eab85-abc0-47d7-9ad6-f8a19b0c0c5f` | `QA-POST-01` | User A (`@doc_auditor`) | 2026-09-24 13:27:47 | **CONFIRMED PRESENT** |
| **`public.posts`** | `c2d82f70-f648-4b7b-8a62-9022f3eeb9aa` | `QA-POST-02` | User A (`@doc_auditor`) | 2026-09-24 13:27:47 | **CONFIRMED PRESENT** |
| **`public.posts`** | `c05633a5-9301-4abd-8e9f-6ae3927287a0` | `QA-POST-03` | User A (`@doc_auditor`) | 2026-09-24 13:27:47 | **CONFIRMED PRESENT** |

*Total Database Records Proposed for Deletion:* Exactly **13 rows**.

---

### Tier 2: Secondary Ephemeral QA Account (User B)

| Table | Target Identity / UUID | Manifest Reference | Owner / Actor | Notes |
|---|---|---|---|---|
| **`public.profiles`** | `9cd3413e-94ae-4bc8-b64d-ba42c21599be` | Gate 2 Provisioning | `@qa_user_b` | Ephemeral audit peer profile |
| **`auth.users`** | `9cd3413e-94ae-4bc8-b64d-ba42c21599be` | Gate 2 Provisioning | `qa_user_b@verixa.internal` | Ephemeral audit peer auth user |

> [!IMPORTANT]
> **Preservation of Primary QA Account (User A):**
> `@doc_auditor` (`c7aa8500-26f1-4c6f-ac9d-deaf95373544`) is **NOT** included in this purge. It is an existing, approved QA identity and its account record in `public.profiles` and `auth.users` will remain permanently intact.

---

### Tier 3: Local Server JSON Stores

| JSON Store File | Target Record ID | Manifest QA ID / Reference | Record Type | Live Status |
|---|---|---|---|---|
| `data/notifications.json` | `notif_1790256485280_0ee84cd6` | `QA-NOTIF-01` | In-app like alert | Confirmed Present |
| `data/notifications.json` | `notif_1790256485297_a311b7bf` | `QA-NOTIF-02` | In-app comment alert | Confirmed Present |
| `data/notifications.json` | `notif_1790256485313_e110ebea` | `QA-NOTIF-03` | In-app follow alert | Confirmed Present |
| `data/reports.json` | `rep_1790256485321_wcwxj` | `QA-REP-01` | Community moderation report | Confirmed Present |
| `data/appeals.json` | `apl_1790256485802_9kjyg` | `QA-APP-01` | Gate 3 moderation appeal | Confirmed Present |
| `data/appeals.json` | `apl_1790267352995_fbpqe` | `MOD-13` | Gate 6 moderation appeal | Confirmed Present |

*Total Local JSON Records Proposed for Deletion:* Exactly **6 records**.

---

### Tier 4: Storage Bucket Inventory (`app-files`)

* **User A Storage Folder (`app-files/c7aa8500-26f1-4c6f-ac9d-deaf95373544`):** Exactly **0 objects** reside in this folder.
* **User B Storage Folder (`app-files/9cd3413e-94ae-4bc8-b64d-ba42c21599be`):** Exactly **0 objects** reside in this folder.
* *Total Storage Objects to Delete:* **0**.

---

## 3. Comparison Against `TEST_DATA_MANIFEST.md`

All proposed deletions were cross-referenced against `TEST_DATA_MANIFEST.md`:

1. **`QA-POST-01`..`03`:** Matched 1:1 against lines 29–31.
2. **`QA-COMM-01`..`02`:** Matched 1:1 against lines 33–34.
3. **`QA-LIKE-02`:** Matched 1:1 against line 37.
4. **`QA-FOL-01`..`02`:** Matched 1:1 against lines 38–39.
5. **`QA-STORY-01`:** Matched 1:1 against line 41.
6. **`QA-MSG-01`..`03`:** Matched 1:1 against lines 45–47.
7. **`QA-SAVE-01`:** Matched 1:1 against line 53.
8. **`QA-NOTIF-01`..`03`:** Matched 1:1 against lines 48–50.
9. **`QA-REP-01`:** Matched 1:1 against line 51.
10. **`QA-APP-01`:** Matched 1:1 against line 52.
11. **Gate 6 Appeal `apl_1790267352995_fbpqe`:** Explicitly added to purge the test appeal fixture created in `MOD-13`.

---

## 4. Real-User Baseline Data Preservation Assertions

A live read-only verification confirmed that the following real-user records exist in the database and will **NOT** be touched:

* **Real-User Posts:** Exactly **9 posts** belonging to authentic users (`@khabir`, `@syedkhabirhameed`, `@jashu_2426`, etc.). **100% Preserved.**
* **Real-User Comments:** Exactly **8 comments** (`dbbac275...`, `79d9a4a6...`, `d1d7a0ed...`, `6306a9c6...`, `7d9ac784...`, `ef95f888...`, `f817e6eb...`, `c5a9a4d5...`). **100% Preserved.**
* **Real-User Profiles:** Exactly **9 profiles** of authentic users. **100% Preserved.**
* **Real-User Notifications:** All **11 baseline notification rows** cataloged in Gate 5. **100% Preserved.**
* **Real-User Messages, Likes, Follows, Stories:** **100% Preserved.**

---

## 5. Verification of Absence of Gate 6 Transient Records

* **Comment `05efbe4f-eb4e-4978-876c-22b8c1415be3` (`MOD-12`):** A direct database query confirmed this record has **0 rows** in `public.comments`. It was purged immediately upon test insertion during Gate 6.

---

## 6. Proposed Exact Execution Script (For Review Only — NOT Executed)

When approved, Gate 7 will execute using foreign-key safe dependency ordering:

```sql
-- 1. Purge QA Saved Post
DELETE FROM public.saved_posts WHERE id IN ('50805a28-516a-49f6-ac14-5cf70d230942');

-- 2. Purge QA Direct Messages
DELETE FROM public.messages WHERE id IN (
  '76d580c3-d0cb-4a51-812c-1604c2ab3fa0',
  'abc8a666-f05d-4ca9-ab69-be10d763b639',
  'dc3a240a-2686-4f7e-9643-336fe05dd1ef'
);

-- 3. Purge QA Story
DELETE FROM public.stories WHERE id IN ('0a556b18-5123-4dab-8870-d000b33418e9');

-- 4. Purge QA Follow Relationships
DELETE FROM public.follows WHERE id IN (
  '782cefe0-b930-434a-9e19-aed2b1390547',
  'f616819d-7dd6-4466-bfd3-670b3a79c970'
);

-- 5. Purge QA Likes
DELETE FROM public.likes WHERE id IN ('e22b0b3a-f310-435f-b9f6-7d0d7400647e');

-- 6. Purge QA Comments (Includes the 2 Gate 3 synthetic comments)
DELETE FROM public.comments WHERE id IN (
  'f3c364e8-09e4-451b-abbe-df1e7a97b8e7',
  '13285b66-e396-4b6d-a449-989e3d41b9c2'
);

-- 7. Purge QA Posts
DELETE FROM public.posts WHERE id IN (
  '338eab85-abc0-47d7-9ad6-f8a19b0c0c5f',
  'c2d82f70-f648-4b7b-8a62-9022f3eeb9aa',
  'c05633a5-9301-4abd-8e9f-6ae3927287a0'
);

-- 8. Purge Secondary Synthetic Auditor User B
DELETE FROM public.profiles WHERE id = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';
DELETE FROM auth.users WHERE id = '9cd3413e-94ae-4bc8-b64d-ba42c21599be';
```

---

## 7. Current Gate Boundary

* **Execution Status:** **HALTED.** Zero delete operations have been run.
* **Next Action:** Awaiting explicit second approval to proceed with execution of the Gate 7 cleanup.

```
PRE-CLEANUP INVENTORY COMPLETE — AWAITING EXPLICIT APPROVAL TO EXECUTE DELETIONS
```
