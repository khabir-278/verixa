# VERIXA QA AUDIT — GATE 2: QA ACCOUNT PROVISIONING PLAN & NECESSITY AUDIT

**Document Version:** 2.0.0  
**Audit Stage:** GATE 2 — QA ACCOUNT PROVISIONING (VERIFIED & COMPLETED)  
**Author:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Date:** September 23, 2026  
**Target Backend:** Supabase Cloud (`https://jnbaumemwxydjktwedtz.supabase.co`)  
**Isolation Strategy:** Option A — Strict In-Place QA Quarantine  
**Current Status:** `COMPLETED` (Account provisioned via Supabase Dashboard; 6/6 verification criteria satisfied)

---

## 1. Determination: Is Secondary QA Account `@qa_user_b` Actually Required?

### Technical Determination: **YES, STRICTLY REQUIRED FOR MULTI-USER AUDIT**

An audit of the Verixa full-stack codebase, relational schema, and business logic confirms that the existing primary account **User A (`@doc_auditor`)** is technically incapable of validating multi-user, social, real-time, and notification workflows on its own. 

Under the mandatory **Option A (Strict In-Place Isolation)** safety rules, **interacting with any of the 9 real/personal user accounts is strictly prohibited**. Therefore, a synthetic peer **User B (`@qa_user_b`)** is indispensable for the following technical reasons:

| Feature / Subsystem | Code / Schema Constraint | Why User A Alone CANNOT Test It | Why User B Is Required |
|---|---|---|---|
| **Follow System** | `public.follows`: `constraint no_self_follow check (follower_id != following_id)` | PostgreSQL rejects self-follows at the database level. User A cannot follow itself. | User B is needed to test following, unfollowing, follower/following count synchronization, and the "Following" feed tab. |
| **Direct Messaging (DMs)** | `public.messages`: `idx_messages_conv (conversation_id)`, `sender_id != receiver_id` | Verixa chat architecture requires two distinct participants to form a message thread, render sender vs receiver bubble styling, and broadcast over WebSockets. | User B is needed to exchange real-time messages, verify receipt, and test unread message badges. |
| **Notification Engine** | `public.notifications`: `recipient_id != sender_id` | Notifications are triggered exclusively by peer actions (someone else liking your post, commenting, or following you). User A cannot generate notifications for itself. | User B is needed to trigger notifications (like, comment, follow) so User A's unread badge and notification center can be validated. |
| **Cross-User Likes** | `public.likes`: `unique_post_user_like (post_id, user_id)` | While a user can like their own post, it does not validate peer social discovery, like feeds, or like notification dispatch. | User B liking User A's post validates atomic counter increments, peer state reflection, and the `LikesModal` drawer. |
| **Story Views & Analytics** | `public.stories`: `viewed_by uuid[]`, `views_count integer` | A story view requires a foreign user ID appended to `viewed_by`. Self-views do not increment story view metrics. | User B viewing User A's story validates view attribution, view counter increment, and the `StoryInsightsModal`. |
| **Story Likes** | `public.stories`: `liked_by text[]`, `likes_count integer` | Verifies that a viewer liking a story turns the heart icon red, triggers the like toast, and records the viewer's ID in `liked_by`. | User B liking User A's story validates viewer-side engagement and author-side story insights. |
| **Peer Moderation & Reporting** | `public.reports`: `check (target_type in ('post', 'comment', 'story', 'reel', 'user'))` | In production social apps, moderation flows are initiated by third-party community reports, not self-reports. | User B reporting violating QA content validates community report triage in `/ai-dashboard`. |

---

## 2. Proposed Account Specification for User B

| Attribute | Specification | Rationale / Safety Boundary |
|---|---|---|
| **Username** | `@qa_user_b` | Clearly identified as a synthetic QA entity; easily excluded from public views. |
| **Full Name** | `QA Peer Auditor` | Identifiable in UI cards, story viewer lists, and modals. |
| **Email Address** | `qa_user_b@verixa.internal` | Internal non-routable test domain. Prevents accidental outbound email delivery. |
| **Role** | `Verified Member` | Default platform role; enables standard user permissions. |
| **Verified Status** | `true` | Standard verified badge. |
| **Initial Safety Score** | `100` | Pristine baseline score for behavioral tracking. |
| **AI Trust Badge** | `Verified Human • 100% Trust` | Standard baseline trust badge. |
| **Bio** | `[VERIXA-QA] Secondary synthetic test account for peer interaction audit.` | Unambiguous QA metadata. |

---

## 3. Account Provisioning Methods Evaluated

Because safety rules strictly stipulate: **"Do NOT send emails"** and **"Do NOT modify authentication settings"**, the provisioning method must be selected with extreme care.

### Method 1 (Recommended): Native Supabase Dashboard Creation (Zero Outbound Email)
* **Execution:** Use the Supabase Cloud Web Dashboard:
  1. Navigate to **Authentication** -> **Users** -> **Add User** -> **Create User**.
  2. Enter Email: `qa_user_b@verixa.internal`
  3. Enter Password: (Secure temporary QA audit password).
  4. Toggle **"Auto Confirm User?"** to **ON / TRUE**.
  5. The PostgreSQL trigger `public.handle_new_user()` immediately provisions the corresponding `public.profiles` row with username `@qa_user_b`.
* **Safety Profile:**
  * **0 outbound emails sent** (bypasses SMTP entirely).
  * **0 risk of OTP delivery failure** or domain MX lookup errors.
  * Native Supabase feature; requires 0 code alterations.

### Method 2: Direct SQL Provisioning via Supabase SQL Editor (Zero Outbound Email)
* **Execution:** Run the following pre-built SQL in the Supabase SQL Editor:
  ```sql
  -- Create User B directly in auth.users with pre-confirmed email (Zero Emails Sent)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'qa_user_b@verixa.internal',
    crypt('VerixaQA#2026PeerSecure', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"QA Peer Auditor","username":"qa_user_b"}',
    now(),
    now()
  );
  -- public.handle_new_user() automatically populates public.profiles
  ```
* **Safety Profile:**
  * Instant, atomic, and guarantees **0 emails sent**.

### Method 3: Standard In-App Registration Flow (`/signup` -> 6-Digit Email OTP)
* **Execution:** Register via `SignupPage.tsx` using a routable test email inbox.
* **Safety Profile & Limitations:**
  * Requires sending an actual email OTP across the Internet.
  * Violates the strict "Do NOT send emails" safety directive unless an explicit user override is granted.
  * **Not recommended** for Gate 2.

---

## 4. Strict Behavioral Boundaries for User B

Once approved and provisioned, `@qa_user_b` will operate under strict automated boundaries:
1. **Target Isolation:** `@qa_user_b` will NEVER search for, view, follow, like, comment on, message, or report any of the 9 real human user accounts (`@khabir`, `@syedkhabirhameed`, `@jashu_2426`, `@istemsettyhem`, `@vuyyalaharsha15`, `@poojitha__2008`, `@lonely_girl_123`, `@puppyyy_2357__`, `@sridhari_2679_`).
2. **Peer Coupling:** `@qa_user_b` will interact EXCLUSIVELY with `@doc_auditor`.
3. **Payload Tagging:** Every piece of content created by `@qa_user_b` will carry the `[VERIXA-QA]` prefix.
4. **Deterministic Gate 7 Purge:** Both the `auth.users` row and the `public.profiles` row for `@qa_user_b` will be deleted during Gate 7 cleanup.

---

## 5. Isolation of CDN Media & Data URIs

To test visual rendering in stories and posts without the missing `app-files` storage bucket:
* **Story Media for `QA-STORY-01`:** Will use an isolated, royalty-free test image from Unsplash (`https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1080&q=80`).
* **Profile Avatars:** Synthetic accounts will use default platform SVG data URIs or standard Unsplash avatars.
* **Isolation Guarantee:** These URLs will ONLY be attached to synthetic `[VERIXA-QA]` rows. NO media fields of existing real user accounts will ever be modified.

---

## 6. Gate 2 Live Verification Results (Audited: September 23, 2026)

The secondary account was created via the Supabase Cloud Dashboard using Method 1 (Auto Confirm enabled) and verified against live database state:

```
=== VERIXA QA AUDIT: GATE 2 VERIFICATION RUN ===
Target Backend: https://jnbaumemwxydjktwedtz.supabase.co
Execution Timestamp: 2026-09-23T17:09:05Z

Verification Checks:
1. Account Exists in Auth:          PASS (UUID: 9cd3413e-94ae-4bc8-b64d-ba42c21599be)
2. Email Confirmed:                 PASS (Confirmed via Dashboard Auto-Confirm)
3. Linked Public Profile Exists:    PASS (Row linked via trigger handle_new_user())
   - Username:                      qa_user_b
   - Display Name:                  qa_user_b
   - Role:                          Verified Member
   - Verified Badge:                true
   - Safety Score:                  100
   - AI Trust Badge:                Verified Human • 100% Trust
4. Standard Privileges Only:        PASS (No admin, moderator, or service-role privileges)
5. Zero Outbound Emails Sent:       PASS (Non-routable .internal domain, SMTP bypassed)
6. Zero Mutation of Real Users:     PASS (All 9 human profiles intact & untouched)
```

### Profile Snapshot
* **User ID:** `9cd3413e-94ae-4bc8-b64d-ba42c21599be`
* **Email:** `qa_user_b@verixa.internal`
* **Username:** `@qa_user_b`
* **Role:** `Verified Member`
* **Followers Count:** `0`
* **Following Count:** `0`
* **Posts Count:** `0`

---

## 7. Gate Status & Transition

* **GATE 2 Status:** `COMPLETED` (`APPROVED — CREATE QA ACCOUNTS` fulfilled)
* **Current Operational State:**
  * **Zero test data has been created.**
  * **No posts, comments, likes, follows, stories, reels, or messages exist for `@qa_user_b`.**
  * **Execution has STOPPED.**
* **Next Gate:** **GATE 3 — TEST DATA CREATION**
  * Awaiting user explicit confirmation:
    > **`APPROVED — CREATE TEST DATA`**

---
EOF
