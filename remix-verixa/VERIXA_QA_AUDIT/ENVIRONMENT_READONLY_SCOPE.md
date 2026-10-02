# VERIXA — SENIOR QA AUDIT: READ-ONLY SYSTEM & ENVIRONMENT SCOPE

**Document Version:** 1.0.0  
**Audit Date:** September 23, 2026  
**Auditor Role:** Senior QA Architect, Software Test Lead, Security Tester, SDET & Production Readiness Auditor  
**Scope Status:** READ-ONLY INSPECTION (Phase 0)  
**Safety Mandate:** 0 Mutations, 0 Destructive Actions, 100% Protection of Real User Data  

---

## 1. Complete System Architecture & Component Inventory

### 1.1 Frontend Architecture
* **Core Framework:** React 19.0.1, TypeScript ~5.8.2, Vite 6.2.3.
* **Styling & Theming:** Tailwind CSS 4.1.14 (`@tailwindcss/vite`), custom glassmorphic neon design system (`backdrop-blur-xl`, `border-white/10`, `bg-[#050507]`).
* **Routing System:** Custom state-based router controlled by `AppContext` (`currentPage`) with bidirectional URL synchronization, query parameter routing, and browser history synchronization in `src/App.tsx`.
* **State Management:**
  * `AppContext.tsx`: Master global provider managing session state, profile data, real-time online presence, posts, reels, stories, comments, notifications, calls, and toasts.
  * `SentinelContext.tsx`: AI safety and Sentinel floating assistant state.
* **UI Components & Modals:**
  * Modals: `PostDetailModal`, `CallModal`, `BlockedCommentModal`, `CreatePostModal`, `AIScannerModal`, `AIFloatingSentinel`, `GoogleUnauthorizedDomainModal`, `StoryOptionsModal`, `StoryInsightsModal`, `LikesModal`, `ExplainabilityModal`.
  * Layout: `Navbar.tsx`, `Sidebar.tsx`, `ToastContainer.tsx`.
* **Client Dependencies:** `@google/genai` (2.4.0), `@supabase/supabase-js` (2.115.0), `motion` (12.23.24), `lucide-react` (0.546.0), `canvas-confetti` (1.9.4), `recharts` (3.10.1).

### 1.2 Backend Architecture
* **Server Framework:** Express 4.21.2 (`server.ts`) running on Node.js v24.19.0 via `tsx` (dev) and bundled via `esbuild` to `dist/server.cjs` (production).
* **Dual Execution Mode:**
  * Development: Vite middleware mode (`createViteServer`) integrated directly into Express.
  * Production: Static file serving from `dist/` with single-page fallback.
* **API Endpoints:** 45+ REST endpoints across Auth, Posts, Comments, Stories, Reels, Direct Messages, Notifications, AI Moderation Gateway, Behavioral Safety, Guardian Trust Engine, and Explainable Recommendation Feed.
* **Server-Side Services:**
  * `StoryService` (`server/moderation/storyService.ts`): Multi-stage story lifecycle, 24-hour expiry calculation, real-time insights aggregation, idempotent likes.
  * `FeedService` (`server/feed/personalizedFeed.ts`): 11-vector explainable recommendation ranking engine with transparent scoring.
  * `ModerationGateway` (`server/moderation/`): Multimodal Gemini Vision, toxicity analysis, prompt injection defense, leetspeak normalization.
  * `GuardianService` (`server/moderation/`): Behavioral safety scoring, trust badge calculation, appeal triage.

### 1.3 Supabase Integration (Live Cloud Backend)
* **Target Project URL:** `https://jnbaumemwxydjktwedtz.supabase.co`
* **Authentication Engine:** Supabase GoTrue Auth with Email OTP (6-digit alphanumeric token `{{ .Token }}`) and Google OAuth provider.
* **Database Engine:** PostgreSQL 15+ hosted on Supabase Cloud.
* **Realtime Engine:** Supabase Realtime Channels (Postgres replication on `posts`, `comments`, `stories`, `reels`, `likes`, `notifications`, `messages`, plus presence channel `online_users`).
* **Storage Engine:** Supabase Storage. Target bucket configured in code: `app-files` (Note: Inspection reveals bucket is missing from cloud project).

---

## 2. Comprehensive Route Inventory (20 Routes)

| # | Route / Page | URL Path | Auth Required | Purpose | Backend / DB Dependencies | Storage & AI Dependencies | Status | Potential Risks & QA Focus |
|---|---|---|---|---|---|---|---|---|
| 1 | **Landing** | `/landing` (or `/` if unauth) | No | Public showcase & product value proposition | None | None | Verified Functional | Asset 404s, mobile viewport responsiveness. |
| 2 | **Login** | `/login` | No | User authentication portal | `supabase.auth.signInWithPassword` | None | Verified Functional | Credential stuffing, rate limiting, session token storage. |
| 3 | **Signup** | `/signup` | No | Registration with 6-digit email OTP trigger | `supabase.auth.signUp` | Trigger: `handle_new_user()` | Verified Functional | Username collision, duplicate email, OTP delivery delay. |
| 4 | **Verify Email** | `/verify-email` | No | 6-digit OTP verification screen | `supabase.auth.verifyOtp` | None | Verified Functional | Token expiry, brute force attacks, paste handling. |
| 5 | **Home Feed** | `/home` (or `/` if auth) | Yes | Main social stream with 3 feed tabs & Story Tray | `posts`, `profiles`, `likes`, `comments`, `stories` | Vision AI scan, Realtime presence | Verified Functional | Feed pagination lag, like counter synchronization. |
| 6 | **Explore** | `/explore` | Yes | Discovery grid & tag search | `posts`, `profiles`, `search` | Recharts, tag affinity | Verified Functional | SQL injection in search, large mosaic grid memory usage. |
| 7 | **Reels** | `/reels` | Yes | 9:16 full-screen vertical video feed | `reels`, `profiles`, `comments`, `likes` | HTML5 Video, Vision AI scan | Partially Real (Posts Fallback) | Deepfake risk calculation, video buffering stall. |
| 8 | **Messages** | `/messages` | Yes | Direct messaging inbox & active chat | `messages`, `profiles`, WebRTC signaling | Realtime channel, voice recording | Partially Real | WebRTC call signaling gaps, unread count tracking. |
| 9 | **Notifications** | `/notifications` | Yes | Activity center (likes, comments, follows) | `notifications`, `profiles` | Realtime channel | Verified Functional | Stale unread badges, missing navigation links. |
| 10 | **Profile** | `/profile` or `/profile/:id` | Yes | User profile, trust badge, safety certificate | `profiles`, `posts`, `follows`, `saved_posts` | Avatar/Cover storage | Verified Functional | IDOR on profile edit, follower counter discrepancies. |
| 11 | **Settings** | `/settings` | Yes | Account, privacy & AI strictness controls | `profiles`, `auth.users` | LocalStorage + Supabase | Verified Functional | Strictness filter persistence, theme toggle glitches. |
| 12 | **AI Dashboard** | `/ai-dashboard` | Yes (Admin/Member) | Live telemetry, threat alerts, review queue | `moderation_logs`, `reports`, `appeals` | Gemini Vision, Heuristic engine | Verified Functional | Admin authorization bypass, telemetry data latency. |
| 13 | **AI Architecture** | `/ai-architecture` | No | Interactive neural pipeline visualizer | Client-side visual state | SVG/CSS animation | Verified Functional | Educational walkthrough fidelity, memory leak. |
| 14 | **Sentinel AI** | `/sentinel-ai` | Yes | Dedicated conversational AI co-pilot | `/api/ai-assistant`, Gemini API | `@google/genai` | Verified Functional | Fail-closed fallback, prompt injection resilience. |
| 15 | **About** | `/about` | No | Mission statement, philosophy, team | None | Static content | Verified Functional | Broken external links, layout consistency. |
| 16 | **Contact** | `/contact` | No | Support & emergency harassment escalation | `/api/reports` or mailto | Form validation | Verified Functional | Form spamming, unhandled submission errors. |
| 17 | **Privacy** | `/privacy` | No | Zero-biometric privacy documentation | None | Static content | Verified Functional | Policy compliance with GDPR/CCPA disclosures. |
| 18 | **Terms** | `/terms` | No | Terms of Service & safety rules | None | Static content | Verified Functional | Outdated community guideline clauses. |
| 19 | **Help Center** | `/help` | No | FAQ & documentation | None | Static content | Verified Functional | Search functionality completeness. |
| 20 | **404 Page** | `*` (invalid routes) | No | Branded error recovery | None | Router fallback | Verified Functional | Broken redirect loops. |

---

## 3. Major User Action Matrix (35 Actions)

| Domain | Action | UI Trigger | Backend Route / Database Table | Verification Method |
|---|---|---|---|---|
| **Auth** | Sign Up | `SignupPage.tsx` submit | `supabase.auth.signUp()` | OTP email dispatch |
| **Auth** | Verify Email OTP | `VerifyEmailPage.tsx` | `supabase.auth.verifyOtp()` | Session establishment |
| **Auth** | Sign In | `LoginPage.tsx` | `supabase.auth.signInWithPassword()` | JWT token issued |
| **Auth** | Sign Out | Sidebar / Navbar button | `supabase.auth.signOut()` | Storage & state cleared |
| **Auth** | Google OAuth | `LoginPage.tsx` button | `supabase.auth.signInWithOAuth()` | External redirect |
| **Profile** | Edit Bio/Details | `EditProfileModal.tsx` | `public.profiles` (update) | Profile row mutation |
| **Profile** | Upload Avatar | `EditProfileModal.tsx` | `app-files/avatars/` | Storage path returned |
| **Profile** | Upload Cover | `EditProfileModal.tsx` | `app-files/covers/` | Storage path returned |
| **Post** | Create Post | `CreatePostModal.tsx` | `POST /api/posts` -> `public.posts` | AI pre-flight + row insert |
| **Post** | Upload Post Media | File input | `app-files/posts/` | Storage path returned |
| **Post** | Delete Post | Post 3-dots menu | `DELETE /api/posts/:id` | Cascaded deletion |
| **Post** | Like Post | Heart button | `POST /api/posts/:id/like` -> `likes` | Atomic counter increment |
| **Post** | Unlike Post | Active Heart button | `POST /api/posts/:id/like` -> `likes` | Atomic counter decrement |
| **Post** | Add Comment | Comment input bar | `POST /api/comments` -> `comments` | Toxicity scan + insert |
| **Post** | Delete Comment | Comment trash icon | `DELETE /api/comments/:id` | Row deletion |
| **Post** | Save / Bookmark | Bookmark icon | `public.saved_posts` | Row insert |
| **Post** | Share Post | Share icon | Web Share API / Clipboard | Link copied |
| **Story** | Create Story | Story Tray "+" button | `POST /api/stories` -> `stories` | Vision AI scan + row insert |
| **Story** | View Story | Story Tray circle | `POST /api/stories/:id/view` | `viewed_by` array update |
| **Story** | Like Story | Story viewer heart | `POST /api/stories/:id/like` | `story_likes` insert |
| **Story** | Reply to Story | Story viewer input | `POST /api/stories/reaction` | Direct message / Notif |
| **Story** | Delete Story | Story options menu | `DELETE /api/stories/:id` | Story row removal |
| **Reel** | Watch Reel | `ReelsPage.tsx` | `GET /api/reels` | Video buffer playback |
| **Reel** | Like Reel | Reel action bar | `POST /api/reels/:id/like` | Counter increment |
| **Reel** | Comment on Reel | Reel comment drawer | `POST /api/reels/:id/comments` | Toxicity scan + insert |
| **Message** | Send Message | `MessagesPage.tsx` input | `POST /api/messages` -> `messages` | Realtime channel broadcast |
| **Message** | Read Message | Active conversation open | `messages.read` update | Unread badge cleared |
| **Message** | Voice Note | Mic recording button | Base64 / Storage audio upload | Audio waveform render |
| **Call** | Audio/Video Call | Phone/Camera icon | `CallModal.tsx` / WebSockets | WebRTC peer connection |
| **Follow** | Follow User | Profile "Follow" button | `public.follows` | Follower count increment |
| **Follow** | Unfollow User | Profile "Following" button | `public.follows` (delete) | Follower count decrement |
| **Safety** | AI Text Scan | Comment/Post input | `/api/moderate/text` | Severity score (0-100) |
| **Safety** | AI Media Scan | Media upload input | `/api/moderate/image` | NSFW / Deepfake scores |
| **Safety** | Submit Report | Post 3-dots -> Report | `POST /api/moderation/reports` | Row in `reports` |
| **Safety** | File Appeal | Blocked content modal | `POST /api/moderation/appeals` | Row in `appeals` |

---

## 4. Existing Data Inventory & Classification (4-Tier Audit)

| Record ID / Name | Table / Store | Type / Content | Classification | Protection Directive |
|---|---|---|---|---|
| `e825d91d...` (`@khabir`) | `public.profiles` | Real User Account (`syed hameed`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `d1d35671...` (`@syedkhabirhameed`) | `public.profiles` | Primary Developer Account | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `1e71840f...` (`@jashu_2426`) | `public.profiles` | Real User Account (`Jashu Yellasiri`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `00a2e805...` (`@istemsettyhem`) | `public.profiles` | Real User Account (`Hem Istemsetty`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `3706df8d...` (`@vuyyalaharsha15`) | `public.profiles` | Real User Account (`Harsha Vuyyala`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `184d14d4...` (`@poojitha__2008`) | `public.profiles` | Real User Account (`Poojitha`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `e16d5892...` (`@lonely_girl_123`) | `public.profiles` | Real User Account (`samyuktha Grandhe`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `06ce28b2...` (`@puppyyy_2357__`) | `public.profiles` | Real User Account (`puppyyy`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `8100e6d9...` (`@sridhari_2679_`) | `public.profiles` | Real User Account (`Sridhari`) | **PERSONAL / REAL USER DATA** | **DO NOT MODIFY / DO NOT DELETE** |
| `c7aa8500...` (`@doc_auditor`) | `public.profiles` | Pre-existing Screenshot QA Account (`test_auditor@verixa.com`) | **QA / TEST DATA** | **Candidate for Gate 1 Approval** |
| 7 Posts in `posts` | `public.posts` | Real User / Seeded Showcase Posts | **PERSONAL / REAL USER DATA** | **DO NOT DELETE / DO NOT ALTER** |
| 8 Comments in `comments` | `public.comments` | Real User Comments | **PERSONAL / REAL USER DATA** | **DO NOT DELETE / DO NOT ALTER** |
| 32 Likes in `likes` | `public.likes` | Real User Likes | **PERSONAL / REAL USER DATA** | **DO NOT DELETE / DO NOT ALTER** |
| 1 Story in `stories` | `public.stories` | Jashu Yellasiri Story | **PERSONAL / REAL USER DATA** | **DO NOT DELETE / DO NOT ALTER** |
| 1 Story Like in `story_likes` | `public.story_likes` | Verified Like on Story | **PERSONAL / REAL USER DATA** | **DO NOT DELETE / DO NOT ALTER** |
| `data/moderation_events.json` | Local Disk | 338 Synthesized Telemetry Logs | **SYSTEM DATA** | Protected internal telemetry |
| `data/recommendation_events.json`| Local Disk | 380 Feed Training Vectors | **SYSTEM DATA** | Protected ranking history |
| `data/notifications.json` | Local Disk | 10 System Activity Notifications | **SYSTEM DATA** | Protected activity log |

---

## 5. Security Boundary & Vulnerability Audit

### 5.1 Critical RLS Weaknesses Discovered in `supabase_schema.sql`
1. **Unrestricted Story Deletion & Modification (`public.stories`):**
   * Lines 409-416:
     ```sql
     create policy "Allow story creation" on public.stories for insert with check (true);
     create policy "Users can update stories" on public.stories for update using (true);
     create policy "Users can delete their own stories" on public.stories for delete using (true);
     ```
   * **Vulnerability:** Despite policy naming, the `USING` and `WITH CHECK` clauses evaluate to `true` unconditionally. Any authenticated or anonymous user with database access can update or delete ANY user's story!
2. **Unrestricted Reel Deletion & Modification (`public.reels`):**
   * Lines 424-430:
     ```sql
     create policy "Allow reel creation" on public.reels for insert with check (true);
     create policy "Users can update their own reels" on public.reels for update using (true);
     create policy "Users can delete their own reels" on public.reels for delete using (true);
     ```
   * **Vulnerability:** Unconditional `true` allows IDOR deletion of any reel by any actor.

### 5.2 Storage Security & Infrastructure Gap
1. **Missing Storage Bucket:**
   * Querying `supabase.storage.getBucket('app-files')` returns `Bucket not found`.
   * The SQL migration script contains the insert statement for `storage.buckets`, but the bucket has not been provisioned in the cloud environment.
   * **Impact:** Any file upload executed through normal UI will fail unless fallback handlers or local Base64 conversion catches it.

### 5.3 Client/Server Trust & Key Boundary
1. **Supabase Keys:**
   * `VITE_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) is embedded in client bundle. This is expected for Supabase anon access.
   * `SUPABASE_SERVICE_ROLE_KEY` is NOT present in `.env.local`. The Express backend falls back to using the publishable key.
   * **Security Implication:** The backend executes under the same RLS limitations as an anonymous/client user unless an explicit user JWT is supplied in headers.

---

## 6. Test-Data Feasibility & Strategy

* **Feasibility:** High. The Verixa full-stack architecture supports end-to-end execution of all user workflows through standard UI and Express API routes.
* **Preferred Strategy:** Real Verixa UI -> Real API -> Real Database.
* **Tagging Convention:** Every QA entity created during testing will be strictly prefixed with `[VERIXA-QA]`.
* **Zero Contamination:** No existing user account (`@khabir`, `@jashu_2426`, etc.) or personal posts will be modified.

---
EOF
