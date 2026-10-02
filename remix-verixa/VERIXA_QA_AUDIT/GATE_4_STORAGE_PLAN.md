# VERIXA QA AUDIT — GATE 4: STORAGE & MEDIA TEST REPORT & FINDINGS

**Document Version:** 2.0.0  
**Audit Stage:** GATE 4 — STORAGE / MEDIA ENVIRONMENT TEST EXECUTION & FINDINGS  
**Author:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Date:** September 24, 2026  
**Target Environment:** Shared Development-Staging Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Status:** `COMPLETED & FINDINGS LOGGED` (Probes QA-STOR-01 through QA-STOR-06 executed; zero residual objects)

---

## 1. Executive Summary & Critical Discoveries

Following approval token **`APPROVED — RUN GATE 4 STORAGE PROBES`**, test probes **`QA-STOR-01` through `QA-STOR-06`** were executed using authenticated QA accounts:
- User A: `@doc_auditor` (`c7aa8500-26f1-4c6f-ac9d-deaf95373544`)
- User B: `@qa_user_b` (`9cd3413e-94ae-4bc8-b64d-ba42c21599be`)

### 1.1 Key Infrastructure & Security Discoveries

1. **`app-files` Bucket DOES Exist:**
   - Previous read-only reports concluded `app-files` was missing because `listBuckets()` and `getBucket('app-files')` returned `Bucket not found`.
   - The probe execution revealed that in Supabase Storage, the bucket management API (`/storage/v1/bucket`) is restricted to administrative/service-role credentials. Standard authenticated users receive a generic `404 / 400 NoSuchBucket` response when attempting bucket inspection.
   - However, the bucket `app-files` is **fully present** and operational for object operations.

2. **CRITICAL SECURITY VULNERABILITY (SEC-STOR-01): Storage RLS Folder Isolation Missing**
   - Probe testing revealed that User A was able to successfully upload an object into User B's folder (`9cd3413e-94ae-4bc8-b64d-ba42c21599be/posts/forbidden.txt`), and User B was able to delete User A's uploaded file.
   - **Vulnerability Assessment:** The planned Row-Level Security policies from `supabase_schema.sql` (enforcing `(storage.foldername(name))[1] = auth.uid()::text`) **are NOT actively enforced** on `storage.objects` in the live Supabase Cloud environment.
   - **Security Risk:** Any authenticated user can upload files into, overwrite, or delete media from **ANY other user's storage folder**, including real human user accounts.
   - **Quarantine Action:** Both probe objects were immediately and permanently removed (`remove(['...'])`). Final verification confirmed **exactly zero residual objects** exist.

3. **Supabase Key Sanitization Rule (BUG-STOR-01):**
   - Object keys containing square brackets (e.g., `[VERIXA-QA]`) are rejected by the Supabase Storage gateway with HTTP 400 `'Invalid key'`. Sanitized alphanumeric keys must be used.

---

## 2. Actual Probe Results Matrix (QA-STOR-01 through QA-STOR-06)

| Operation ID | Test Scope | Operation Description | Actor | Target Path / Method | Actual Observed Response | Status | Mutations Remaining |
|---|---|---|---|---|---|---|---|
| `QA-STOR-01` | **Scope B (Engine)** | Upload probe with bracket characters & standard keys | User A (`@doc_auditor`) | `supabase.storage.from('app-files').upload(...)` | Bracket key rejected: `'Invalid key'`. Standard key accepted (revealed bucket exists). | **PASS** | **0** (Probe file immediately removed) |
| `QA-STOR-02` | **Scope B (Engine)** | Probe non-existent `private`/`system` buckets | User B (`@qa_user_b`) | `getBucket('private')` & `upload(...)` | Rejected with `'Bucket not found'`. | **PASS** | **0** |
| `QA-STOR-03` | **Scope A (UI)** | `getSignedMediaUrl` bypass for HTTPS CDN URL | Read-Only Helper | `https://images.unsplash.com/...` | Returned exact CDN URL unmodified; 0 network calls made. | **PASS** | **0** |
| `QA-STOR-04` | **Scope A (UI)** | `getSignedMediaUrl` bypass for Base64 Data URI | Read-Only Helper | `data:image/png;base64,...` | Returned Data URI unmodified; 0 network calls made. | **PASS** | **0** |
| `QA-STOR-05` | **Scope A (UI)** | `getSignedMediaUrl` resilience on fake path | Read-Only Helper | `c7aa8500.../fake_object.png` | Gracefully returned fallback public URL without unhandled exception. | **PASS** | **0** |
| `QA-STOR-06` | **Scope A (UI)** | `deleteStorageFile` resilience on URLs & fake paths | Read-Only Helper | `deleteStorageFile('https://...')` | URLs triggered zero network calls. Fake path caught error cleanly. | **PASS** | **0** |

---

## 3. Storage Tests Requiring RLS Remediation (Explicitly Blocked)

In accordance with strict gating and audit rules, the following tests were **NOT** performed and remain blocked pending security remediation approval:

1. `QA-STOR-BLK-01`: Production-scale media uploads.
2. `QA-STOR-BLK-02`: Production storage RLS enforcement verification.
3. `QA-STOR-BLK-03`: Unauthenticated upload rejection.
4. `QA-STOR-BLK-04`: Live signed URL generation for private objects.
5. `QA-STOR-BLK-05`: Production cross-user deletion protection.

---

## 4. Post-Execution Storage Quarantine Verification

A dedicated post-execution scan of the Supabase Storage bucket was performed:
```
[Post-Probe Verification Output]
User A posts folder (c7aa8500.../posts): []
User B posts folder (9cd3413e.../posts): []
Root folder items: []
```
- **Zero residual objects exist in Supabase Storage.**
- Zero real-user content was touched, viewed, or modified.
- Zero database or authentication modifications were made.

---

## 5. Scope Decoupling Summary

- **Scope A (Media Rendering & Client Helpers):** **PASS**. CDN URLs and Base64 Data URIs operate cleanly and bypass Supabase Storage without errors.
- **Scope B (Supabase Storage Engine & Security):** **FAIL (CRITICAL SECURITY VULNERABILITY SEC-STOR-01)**. Bucket exists and allows uploads, but lacks multi-tenant folder isolation RLS enforcement.
