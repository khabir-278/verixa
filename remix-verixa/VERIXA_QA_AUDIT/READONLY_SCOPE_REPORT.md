# VERIXA — READ-ONLY SCOPE REPORT (PHASE 0)

**Project:** VERIXA (Full-Stack AI-Defended Social Media Platform)  
**Frontend:** React 19.0.1, TypeScript ~5.8.2, Vite 6.2.3, Tailwind CSS 4.1.14 (`@tailwindcss/vite`), Motion 12.23.24  
**Backend:** Express 4.21.2 (`server.ts`), Node.js v24.19.0, bundled with esbuild (`dist/server.cjs`)  
**Supabase:** Cloud Project `https://jnbaumemwxydjktwedtz.supabase.co`  
**Database:** PostgreSQL 15+ (13 application tables: `profiles`, `posts`, `comments`, `likes`, `follows`, `stories`, `story_likes`, `reels`, `messages`, `notifications`, `reports`, `moderation_logs`, `saved_posts`)  
**Storage:** Supabase Storage (Target Bucket: `app-files` — *Status: Missing / Not provisioned in cloud*)  
**Authentication:** Supabase GoTrue Auth with 6-digit Email OTP (`{{ .Token }}`) & Google OAuth  
**Realtime:** Supabase Realtime Channels (PostgreSQL replication + Realtime Presence `online_users`) & WebRTC Voice/Video call signaling  
**AI:** Google Gemini (`@google/genai` 2.4.0, models: `gemini-3.1-flash-lite`, `gemini-3.6-flash`) + Local Heuristic Fallback & Multimodal Pre-flight Scanner  
**Email:** Supabase Internal Email Service configured with customized 6-digit OTP verification template  
**Deployment:** Local development server running on `http://0.0.0.0:3000` (dual Vite HMR + Express API mode); production builds to `dist/`  

---

### Environment
**MIXED (Shared Development / Staging Cloud Supabase Instance)**  
* The local Express server points to a live cloud Supabase instance (`https://jnbaumemwxydjktwedtz.supabase.co`).
* The database contains **9 real/personal user accounts** with active personal content, along with **1 pre-existing QA auditor account** (`test_auditor@verixa.com`).

---

### Existing Users
* **Total Profiles in Database:** 10
* **Personal / Real User Accounts (9):**
  1. `e825d91d-4d19-4283-bd1f-9da12cf0ff10` (@khabir / "syed hameed" / sy***@gmail.com)
  2. `d1d35671-2b35-4c7f-b166-4ae0d85b389f` (@syedkhabirhameed / "syedkhabirhameed" / sy***@gmail.com)
  3. `1e71840f-a4ce-4b73-bbf8-686e7235d3c9` (@jashu_2426 / "Jashu Yellasiri" / s8***@gmail.com)
  4. `00a2e805-4617-4d5d-abaf-8ece372f4712` (@istemsettyhem / "Hem Istemsetty" / is***@gmail.com)
  5. `3706df8d-612d-4b9f-9663-ee4ba3f880d0` (@vuyyalaharsha15 / "Harsha Vuyyala" / vu***@gmail.com)
  6. `184d14d4-3c69-4cdd-b7be-c3d44b228de9` (@poojitha__2008 / "Poojitha" / po***@gmail.com)
  7. `e16d5892-ffee-4d5d-8ddd-68894279d509` (@lonely_girl_123 / "samyuktha Grandhe" / sa***@gmail.com)
  8. `06ce28b2-3348-44f5-a5fd-fab4d54caaae` (@puppyyy_2357__ / "puppyyy" / pu***@gmail.com)
  9. `8100e6d9-c75b-424a-98b3-f019d74eb9f2` (@sridhari_2679_ / "Sridhari" / ko***@gmail.com)

---

### Existing QA Users
* **1 Account Found:**
  * **ID:** `c7aa8500-26f1-4c6f-ac9d-deaf95373544`
  * **Username:** `@doc_auditor`
  * **Display Name:** `"VERIXA Documentation Auditor"`
  * **Email:** `test_auditor@verixa.com`
  * **Role:** Verified Member (Safety Score: 100)
  * **Created At:** 2026-09-15T16:29:40.811Z

---

### Existing Test Data
* 7 Posts in `public.posts` (mix of personal and showcase posts)
* 8 Comments in `public.comments`
* 32 Likes in `public.likes`
* 1 Story in `public.stories`
* 1 Story Like in `public.story_likes`
* 338 Telemetry events in `data/moderation_events.json`
* 380 Ranking telemetry vectors in `data/recommendation_events.json`
* 10 Notifications in `data/notifications.json`

---

### Personal / Production Data Risk
* **HIGH RISK OF CONTAMINATION WITHOUT ISOLATION:**
  * Because the Supabase instance is shared with genuine user accounts (`@khabir`, `@jashu_2426`, etc.), any uncontrolled writes (posts, comments, likes, notifications) could contaminate real user feeds and trigger unverified notifications to genuine users.
  * **Mitigation Mandate:** Testing must ONLY be conducted using dedicated, synthetic QA accounts tagged with `[VERIXA-QA]`. Real accounts must be strictly read-only and never modified or deleted.

---

### Security Boundary
1. **Critical RLS Weakness:** `public.stories` and `public.reels` have permissive policies with `using (true)` and `with check (true)` for update and delete. This allows unauthorized mutation and deletion of user records.
2. **Missing Storage Infrastructure:** `storage.buckets` does not contain `app-files`. Media uploads to Supabase Storage will fail with `Bucket not found`.
3. **Service Role Key:** Not configured in server environment; backend operations rely on anon publishable key permissions.

---

### Potentially Affected Systems
* Live Supabase Database (`public.posts`, `public.comments`, `public.likes`, `public.notifications`, `public.stories`)
* Realtime Channel broadcasts to any active connected client
* Gemini AI API quota and rate limits
* Local cache buffers (`data/*.json`)

---

### Required QA Accounts
* **Primary QA Account (User A):** `qa_user_alpha@verixa.internal` (Profile testing, post creation, story creation, settings)
* **Secondary QA Account (User B):** `qa_user_beta@verixa.internal` (Multi-user interactions: comments, likes, follows, direct messages, call signaling)

---

### Required Test Data
* 1 Synthetic QA Profile per QA account
* 2 `[VERIXA-QA]` Posts (1 text, 1 image)
* 3 `[VERIXA-QA]` Comments (1 safe, 1 toxic test, 1 reply)
* 2 `[VERIXA-QA]` Likes & Follows
* 1 `[VERIXA-QA]` Story
* 2 `[VERIXA-QA]` Direct Messages between QA User A and QA User B
* 1 `[VERIXA-QA]` Content Report

---

### Operations Requiring Approval
1. Gate 0: Environment Safety Acknowledgment
2. Gate 1: Selection/Creation of QA testing accounts
3. Gate 3: Test-data creation authorization
4. Gate 4: Media file upload authorization
5. Gate 5: Email/Notification dispatch authorization
6. Gate 6: AI safety test-matrix execution
7. Gate 7: Post-test data cleanup authorization

---

### Known Blockers
1. **Supabase Storage Bucket `app-files` is missing:** Must be provisioned or mock fallback used before storage uploads can succeed.
2. **Shared Cloud Database:** Testing must be gated and quarantined to avoid notifying real users.

---

### Recommended Next Step
Proceed to **GATE 0 — ENVIRONMENT SAFETY CHECK** to formally review the environment indicators, risk profile, and obtain user authorization before any QA account selection or test-data creation.

---

SAFE TO PROCEED TO GATE 0
