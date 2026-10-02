# VERIXA QA AUDIT — MASTER SECURITY FINDINGS LOG

**Project:** VERIXA (Full-Stack AI Social Platform)  
**Target Backend:** Supabase Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place Quarantine  
**Last Updated:** September 24, 2026  
**Auditor:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  

---

## 1. Master Security Findings Summary

| Finding ID | Severity | Category | Target Component | Status | Discovered Stage | Remediation Status |
|---|---|---|---|---|---|---|
| **SEC-STOR-01** | **CRITICAL** | Storage Authorization | `storage.objects` (`app-files`) | **RESOLVED (VERIFIED)** | Gate 4 Probes | Strict UID folder isolation policies applied; 7 competing legacy policies dropped. Verification suite V-STOR-01..06 100% PASSED. Exactly 0 residual objects. |
| **SEC-STOR-02** | **HIGH** | Architectural Privacy | Voice Messages (`audio/`) | **OPEN (ARCHITECTURAL FINDING)** | Gate 4 Review | Architectural privacy finding; confidential 1-on-1 audio in public bucket. Requires dedicated `app-private` bucket. |
| **SEC-RLS-01** | **CRITICAL** | Database Authorization | `public.stories` table | **DOCUMENTED / GATED** | Phase 0 Inspection | Unrestricted update/delete RLS policies; changes blocked per audit policy. |
| **SEC-RLS-02** | **CRITICAL** | Database Authorization | `public.reels` table | **DOCUMENTED / GATED** | Phase 0 Inspection | Missing RLS policies; changes blocked per audit policy. |

---

## 2. Detailed Security Findings

### SEC-STOR-01: Storage Multi-Tenant UID Folder Isolation Missing (CRITICAL)
- **Component:** `storage.objects` table, bucket `app-files`.
- **CVSS Score:** 9.1 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:N/I:H/A:H)
- **Description:** Previously, the live Supabase Storage bucket `app-files` permitted authenticated users to upload files into and overwrite media in other users' folders (`<victim-uid>/...`).
- **Remediation Applied:**
  1. Applied strict folder-isolation policies (`(storage.foldername(name))[1] = auth.uid()::text`) for INSERT, UPDATE, and DELETE.
  2. Applied public SELECT policy for feed/profile media delivery.
  3. Identified and dropped 7 legacy/unconstrained policies (`Users can upload their own app files`, `Authenticated users can upload files`, etc.) that were causing an RLS `OR` bypass.
- **Empirical Verification Results (V-STOR-01..06 Suite):**
  - `V-STOR-01` (Same-User Upload): **PASS** — User A upload to `c7aa8500.../posts/v_test_owner.txt` succeeded (`id: be30ad95-98dc-4e9e-b166-4ed1fd1d32b2`).
  - `V-STOR-02` (Cross-User Upload): **PASS** — User A upload to User B's folder strictly **REJECTED** with `'new row violates row-level security policy'`.
  - `V-STOR-03` (Cross-User Overwrite): **PASS** — User A overwrite (`upsert: true`) targeting User B's file strictly **REJECTED** with `'new row violates row-level security policy'`.
  - `V-STOR-04` (Cross-User Delete): **PASS** — User B deletion of User A's object deleted 0 rows and User A's object remained intact.
  - `V-STOR-05` (Anonymous Upload): **PASS** — Unauthenticated upload strictly **REJECTED** with `'new row violates row-level security policy'`.
  - `V-STOR-06` (Quarantine Cleanup): **PASS** — All verification probe objects purged immediately. Exactly **0 residual QA objects** exist in `app-files`.
- **Current Status:** **RESOLVED (VERIFIED & CLOSED)**.

---

### SEC-STOR-02: Voice-Message Audio Exposed in Public Bucket Architecture (HIGH)
- **Component:** `src/lib/supabaseServices.ts:1984`, bucket `app-files`.
- **CVSS Score:** 7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)
- **Description:** Confidential 1-on-1 direct message voice notes are saved to `${userId}/audio/...` inside the public bucket `app-files`. Because `app-files` is marked `public = true`, Supabase Storage serves audio files directly via `/storage/v1/object/public/app-files/...`, completely bypassing PostgreSQL SELECT RLS policies. Anyone who knows or discovers the URL can stream or download private voice notes without authentication.
- **Architectural Requirement:** A separate private bucket (`app-private`, `public = false`) is required for confidential communications.
- **Current Status:** **OPEN (Architectural privacy finding; pending separate approval before creation)**.

---

### SEC-RLS-01 & SEC-RLS-02: Stories & Reels Permissive RLS (CRITICAL)
- **Component:** `public.stories` and `public.reels` tables.
- **Description:** Stories and Reels tables allow unconstrained updates and deletions across user accounts.
- **Current Status:** **DOCUMENTED / GATED** (Auditing under read-only Option A quarantine; database schema changes prohibited during audit).
