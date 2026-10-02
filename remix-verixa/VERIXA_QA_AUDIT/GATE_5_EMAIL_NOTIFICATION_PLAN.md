# VERIXA QA AUDIT — GATE 5: EMAIL & NOTIFICATION QUARANTINE TEST PLAN

**Document Version:** 1.0.0  
**Audit Stage:** GATE 5 — EMAIL & NOTIFICATION QUARANTINE VERIFICATION  
**Author:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Date:** September 24, 2026  
**Target Environment:** Shared Development-Staging Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Status:** `READY FOR EXECUTION`

---

## 1. Objectives & Executive Scope

The objective of Gate 5 is to verify the platform's notification creation, delivery, state management, persistence, and isolation capabilities, while enforcing a **100% strict email quarantine**:

1. **Zero External Emails:** No emails may be sent to real users, QA inboxes, or external destinations.
2. **In-App Social Notifications:** Verify lifecycle of likes, comments, follows, messages, and AI alerts.
3. **Recipient Isolation:** Confirm multi-tenant boundary ensures users only receive notifications intended for them.
4. **Deduplication & Anti-Spam:** Confirm rate-limiting / deduplication prevents duplicate notifications.
5. **Read/Unread Lifecycle:** Verify read state transitions both individually and in bulk.
6. **Persistence & Quarantine Cleanup:** Verify records persist in `data/notifications.json` and database, and that QA test records are cleanly purged with 0 pollution to real users.

---

## 2. Strict Email Quarantine Protocol

| Risk Area | Quarantine Rule | Enforcement Mechanism |
|---|---|---|
| **External Email Delivery** | **FORBIDDEN (ZERO EMAILS)** | No SMTP transport or third-party mailing API (SendGrid, Mailgun, AWS SES, Resend) will be called. |
| **Auth Email Triggers** | **BLOCKED** | Test scripts strictly prohibit calling `supabase.auth.resetPasswordForEmail()`, `supabase.auth.resend()`, or `supabase.auth.signUp()`. |
| **Real User Privacy** | **READ-ONLY LOCK** | Real users' notification records in `data/notifications.json` and Supabase `public.notifications` remain strictly untouched. |
| **Identity Restriction** | **QA IDENTITIES ONLY** | Only User A (`@doc_auditor`, `c7aa8500-26f1...`) and User B (`@qa_user_b`, `9cd3413e-94ae...`) may send or receive notifications. |

---

## 3. Test Cases Matrix (QA-NOTIF-01 through QA-NOTIF-11)

| Test ID | Test Name | Actor | Recipient | Action / Payload | Expected Outcome | Email Dispatch |
|---|---|---|---|---|---|---|
| **`QA-NOTIF-01`** | In-App Notification Creation | User A | User B | `POST /api/notifications` with type `'like'`, `message: '[VERIXA-QA] System probe'` | Returns HTTP 200, valid `id`, `read: false`, stored in buffer | **NONE (0)** |
| **`QA-NOTIF-02`** | Post Like Notification | User A | User B | Like notification referencing User B's QA post | Created with type `'like'`. User A self-notification strictly suppressed. | **NONE (0)** |
| **`QA-NOTIF-03`** | Post Comment Notification | User A | User B | Comment notification with comment snippet text | Created with type `'comment'`, containing comment snippet | **NONE (0)** |
| **`QA-NOTIF-04`** | Follow Notification | User A | User B | Follow notification dispatch | Created with type `'follow'`, sender profile populated | **NONE (0)** |
| **`QA-NOTIF-05`** | Message Event & Notification | User A | User B | Direct message sent from User A to User B | DM stored in `messages`; in-app event generated; zero emails triggered | **NONE (0)** |
| **`QA-NOTIF-06`** | Read/Unread State Management | User B | User B | Mark single read (`POST /api/notifications/read`), mark all read | State transitions from `read: false` to `read: true` cleanly | **NONE (0)** |
| **`QA-NOTIF-07`** | Recipient Isolation & Boundary | User A / B | User A / B | User A requests User B's notifications; queries Supabase with User A token | Cross-user query returns empty/rejected; RLS enforces `auth.uid() = recipient_id` | **NONE (0)** |
| **`QA-NOTIF-08`** | Duplicate Notification Prevention | User A | User B | Fire 2 identical notifications within 1000ms | Second call returns existing record (deduplicated); no duplicate record created | **NONE (0)** |
| **`QA-NOTIF-09`** | Dual Persistence Verification | Server | Storage | Check `data/notifications.json` & Supabase `public.notifications` table | Notification record verified persisted in file and accessible via API | **NONE (0)** |
| **`QA-NOTIF-10`** | QA Notification Cleanup & Zero Pollution | User B | User B | Delete test notifications via `DELETE /api/notifications/:id`; inspect state | Probe records deleted; exactly 0 residual QA notifications remain; real data intact | **NONE (0)** |
| **`QA-NOTIF-11`** | Email Dispatch Code-Path Quarantine | Auditor | System | Code inspection & runtime assertion of auth/communication dispatch pathways | Verified: zero email dispatch calls executed; zero SMTP deliveries occurred | **NONE (0)** |

---

## 4. Distinction of Notification Tiers

To ensure complete technical precision, the audit explicitly categorizes and reports on 5 distinct tiers:
1. **In-App Notification Records:** User-facing notifications stored in memory and displayed in the `/notifications` bell panel.
2. **Local/Application Notification Data:** Durable JSON storage on disk (`data/notifications.json`).
3. **Queued Notification Events / DB Rows:** Records in the Supabase PostgreSQL table `public.notifications` and Realtime publication.
4. **Actual Email Dispatch Attempt:** Network request sent to an SMTP server, Mailgun, SendGrid, Resend, or Supabase Auth mailer. (Must remain **0**).
5. **Actual External Email Delivery:** Message delivered to an external inbox. (Must remain **0**).

---

## 5. Execution Strategy

A specialized test runner script ([`scratch/run_gate_5_notification_tests.ts`](file:///c:/remix-verixa/scratch/run_gate_5_notification_tests.ts)) will be created and executed:
1. Connects as User A and User B with auth sessions.
2. Interacts with the local Express API (`http://localhost:3000`) and the Supabase backend.
3. Tests all 11 scenarios sequentially with detailed assertion logging.
4. Purges all synthetic probe records created during the run.
5. Emits machine-readable output in `VERIXA_QA_AUDIT/gate_5_verification_results.json`.
6. Enforces the **Critical Safety Rule**: If any test attempts an external email dispatch or affects real users, HALT IMMEDIATELY.
