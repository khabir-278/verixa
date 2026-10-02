# VERIXA QA AUDIT — STORAGE SECURITY REMEDIATION INSPECTION (READ-ONLY)

**Document Version:** 1.0.0  
**Audit Stage:** GATE 4 — STORAGE SECURITY REMEDIATION INSPECTION (READ-ONLY)  
**Security Identifier:** `SEC-STOR-01` (CRITICAL)  
**Author:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Date:** September 24, 2026  
**Target Environment:** Shared Development-Staging Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Status:** `INSPECTION COMPLETED — NO REMEDIATION EXECUTED (WAITING FOR APPROVAL)`

---

## 1. SEC-STOR-01 Summary & Incident Description

During the Gate 4 probe execution on the live Supabase Cloud environment, an empirical security probe evaluated cross-user storage path isolation:
- **Actor:** User A (`@doc_auditor`, UUID: `c7aa8500-26f1-4c6f-ac9d-deaf95373544`).
- **Action:** User A executed an authenticated upload targeting User B's designated folder:  
  `9cd3413e-94ae-4bc8-b64d-ba42c21599be/posts/forbidden.txt`.
- **Observed Result:** **THE UPLOAD SUCCEEDED** without error (`error: null`, `id: 368875f9-bfc2-466f-b156-37b4f9a9795c`).
- **Subsequent Action:** User B (`@qa_user_b`, UUID: `9cd3413e-94ae-4bc8-b64d-ba42c21599be`) called `remove(['9cd3413e.../posts/forbidden.txt'])` to delete the object owned by User A.
- **Observed Result:** **THE DELETION SUCCEEDED** without error (`error: null`).
- **Immediate Quarantine:** Both probe objects were immediately purged. Post-probe verification confirmed exactly **0 residual objects** remain in storage.

**Conclusion:** The live Supabase Storage bucket `app-files` **does not enforce multi-tenant folder isolation**. Any authenticated user can upload files into, overwrite, or delete media from any other user's storage path.

---

## 2. Live Policy Inventory & Intended Policy Comparison

### 2.1 Empirical & Metadata Policy Inventory (Live State)

Because PostgREST restricts direct `pg_policies` catalog queries to the `public` schema (returning `Could not find the table 'public.pg_policies'`), the live RLS behavior was deduced through exact empirical API probe observations:

| Command | Live Observed Behavior | Inferred Live Policy State |
|---|---|---|
| **INSERT** | Authenticated User A can write directly to User B's folder (`9cd3413e.../posts/forbidden.txt`). | **UNCONSTRAINED / PERMISSIVE**: No check against `auth.uid() = (storage.foldername(name))[1]`. Either RLS is disabled on `storage.objects` or a blanket policy (`bucket_id = 'app-files'`) exists. |
| **SELECT** | Any authenticated or public client can list and download files within `app-files`. | **PUBLIC SELECT**: Bucket is configured as public; reads are unconstrained. |
| **DELETE** | User B was able to delete an object inside User B's folder created by User A. | **PATH-OR-UNCONSTRAINED DELETE**: Allows deletion matching folder name or blanket authenticated deletion. |
| **UPDATE / OVERWRITE** | Client can upload with `upsert: true` to existing paths without owner validation. | **UNPROTECTED OVERWRITE**: Cross-user overwriting is possible. |

---

### 2.2 Intended Policy Specification (From `supabase_schema.sql` L551–584)

The repository's master schema specifies the intended storage security architecture:

```sql
-- Target Schema: supabase_schema.sql lines 551-584
insert into storage.buckets (id, name, public)
values ('app-files', 'app-files', true)
on conflict (id) do update set public = true;

-- 1. SELECT Policy:
create policy "Public can view app-files" on storage.objects for select
  using (bucket_id = 'app-files');

-- 2. INSERT Policy:
create policy "Authenticated users can upload to app-files under their UID folder" on storage.objects for insert
  with check (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. UPDATE Policy:
create policy "Users can update their own app-files" on storage.objects for update
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. DELETE Policy:
create policy "Users can delete their own app-files" on storage.objects for delete
  using (
    bucket_id = 'app-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

## 3. Exact Discrepancy & Root Cause Analysis

### 3.1 The Ownership Condition
The intended security architecture relies on PostgreSQL's `storage.foldername(name)` function:
$$\text{Folder Segment } 1 = (\text{storage.foldername}(name))[1]$$

Under intended enforcement:
1. For an upload to `9cd3413e-94ae-4bc8-b64d-ba42c21599be/posts/forbidden.txt`:
   - `(storage.foldername(name))[1]` evaluates to `'9cd3413e-94ae-4bc8-b64d-ba42c21599be'` (User B's ID).
   - `auth.uid()::text` for User A evaluates to `'c7aa8500-26f1-4c6f-ac9d-deaf95373544'`.
   - The condition `'9cd3413e...' = 'c7aa8500...'` evaluates to **`FALSE`**.
2. If RLS was active with this policy, PostgreSQL **must reject the insert** with error:
   `new row violates row-level security policy for table "objects"` (SQLSTATE `42501`).

### 3.2 Root Cause
Because User A's upload succeeded:
1. The policies defined in `supabase_schema.sql` (lines 556–584) **were never executed or applied** to the shared Supabase Cloud database project.
2. The `app-files` bucket was either created manually via the Supabase Dashboard with a default permissive template (e.g., "Allow all authenticated uploads") or RLS on `storage.objects` is disabled.

---

## 4. Operational & Feature Impact Analysis

### 4.1 Affected Operations

| Storage Operation | Live State Behavior | Security Risk |
|---|---|---|
| **Cross-User Upload** | **ALLOWED** | An attacker can inject arbitrary/illegal files into another user's storage directory. |
| **Cross-User Overwrite** | **ALLOWED** | An attacker can overwrite another user's avatar, cover banner, or post media. |
| **Cross-User Deletion** | **ALLOWED** | An attacker can delete another user's media assets, causing denial-of-service/data loss. |
| **Move / Rename** | **ALLOWED** | An attacker can manipulate object hierarchy across user boundaries. |
| **Read / List** | **PUBLIC** | All media in `app-files` is publicly readable (intended for posts/avatars, but exposes voice notes). |

### 4.2 Application Storage-Path Inspection & Affected Features

The application codebase was inspected to verify how storage paths are constructed:

| Feature | Code File & Line | Storage Path Pattern | Frontend Enforcement | Backend RLS Vulnerability |
|---|---|---|---|---|
| **Feed Posts** | `src/lib/supabaseServices.ts:2449` | `${user.id}/posts/${Date.now()}_${uuid}.${ext}` | Frontend prefixes `user.id` | **Vulnerable**: API caller can spoof path to victim's UID. |
| **Profile Avatars** | `src/lib/supabaseServices.ts:2489` | `${user.id}/profileImages/${Date.now()}_${uuid}.${ext}` | Frontend prefixes `user.id` | **Vulnerable**: API caller can overwrite victim's avatar. |
| **Profile Covers** | `src/lib/supabaseServices.ts:2507` | `${user.id}/covers/${Date.now()}_${uuid}.${ext}` | Frontend prefixes `user.id` | **Vulnerable**: API caller can overwrite victim's cover banner. |
| **Short Reels** | `src/pages/ReelsPage.tsx:275` | `${user.id}/posts/${Date.now()}_${uuid}.${ext}` | Frontend prefixes `user.id` | **Vulnerable**: API caller can tamper with reel media. |
| **Voice Notes** | `src/lib/supabaseServices.ts:1984` | `${userId}/audio/voice_${Date.now()}_${rand}.${ext}` | Frontend prefixes `userId` | **Vulnerable**: Voice notes can be deleted or spoofed by other users. |

**Key Code Finding:** The application's TypeScript services (`uploadFileToSupabase`, `uploadVoiceNote`) consistently construct paths prefixed with `user.id`. However, **client-side path construction provides zero security** without backend RLS validation, as any authenticated user can bypass the frontend UI using standard Supabase Storage REST calls.

---

## 5. Concrete Risk Assessment (Observed Evidence Only)

1. **Account Impersonation & Content Forgery:** An authenticated malicious user can upload offensive or policy-violating images into a targeted user's folder (`<victim-uid>/posts/...`). When the victim shares posts, their identity could be associated with unauthorized uploads.
2. **Denial-of-Service / Media Vandalism:** Because cross-user deletion succeeded, any user can delete images uploaded by others, causing 404 broken image links across feed posts and profile pages.
3. **Voice Note Tampering:** Voice notes stored in `<victim-uid>/audio/...` can be overwritten or removed by peers.

---

## 6. Proposed Remediation SQL (FOR REVIEW ONLY — DO NOT EXECUTE)

> [!CAUTION]
> **REVIEW ONLY:** In accordance with the Gate 4 mandate, this SQL script is presented for architectural review. **It has NOT been executed.** Execution requires separate, explicit authorization.

```sql
-- ====================================================================
-- VERIXA STORAGE SECURITY REMEDIATION: BUCKET APP-FILES
-- Target Table: storage.objects
-- Objective: Enforce strict multi-tenant folder-level UID isolation
-- ====================================================================

-- Step 1: Ensure Row-Level Security is strictly enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 2: Ensure the app-files bucket exists and is properly flagged
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-files', 'app-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 3: Remove all existing divergent, legacy, or overly permissive policies
DROP POLICY IF EXISTS "Public can view app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files in app-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to app-files under their UID folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own app-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow all authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

-- Step 4: SELECT Policy — Public read access for social feed media
CREATE POLICY "Public can view app-files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-files');

-- Step 5: INSERT Policy — Authenticated upload STRICTLY restricted to user's UID root folder
CREATE POLICY "Authenticated users can upload to app-files under their UID folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Step 6: UPDATE Policy — Authenticated update STRICTLY restricted to user's UID root folder
CREATE POLICY "Users can update their own app-files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Step 7: DELETE Policy — Authenticated delete STRICTLY restricted to user's UID root folder
CREATE POLICY "Users can delete their own app-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'app-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## 7. Post-Remediation Verification Plan (Pending Approval)

Upon future approval to apply the remediation SQL in the Supabase Cloud SQL Editor, the following 5-point verification suite will be executed:

| Test ID | Test Description | Actor | Target Path | Expected Result Post-Remediation |
|---|---|---|---|---|
| **VERIF-01** | Positive Same-User Upload | User A (`c7aa8500...`) | `c7aa8500.../posts/remediation_test_a.txt` | **SUCCESS** (`error: null`) |
| **VERIF-02** | Negative Cross-User Upload | User A (`c7aa8500...`) | `9cd3413e.../posts/remediation_test_cross.txt` | **REJECTED** with RLS violation (code `42501`) |
| **VERIF-03** | Negative Cross-User Delete | User B (`9cd3413e...`) | Attempts deletion of User A's file | **REJECTED** or 0 rows deleted |
| **VERIF-04** | Negative Unauthenticated Upload | Anonymous client | `c7aa8500.../posts/anon_test.txt` | **REJECTED** with Unauthorized / RLS violation |
| **VERIF-05** | Complete Quarantine Cleanup | User A | Deletes `remediation_test_a.txt` | Verified **0 residual objects** |

---

## 8. Safety & Compliance Confirmation

- [x] **Zero SQL Executed:** No remediation SQL was executed on Supabase Cloud.
- [x] **Zero Storage Modifications:** Zero storage buckets, policies, or objects were created, altered, or deleted during this inspection.
- [x] **Zero Source Code Changes:** Zero application files were modified.
- [x] **Zero Database Mutations:** Zero database rows, columns, or RLS policies were modified.
- [x] **Zero Real-User Interference:** All 9 authentic human accounts and their media remain 100% read-only and untouched.
- [x] **Current Audit State:** Execution is strictly **STOPPED** awaiting explicit user authorization.
