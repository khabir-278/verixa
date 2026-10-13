# VERIXA — PHASE 3 SERVER ENVIRONMENT CONFIGURATION & READINESS PLAN (APPROVAL 3 REPORT)

**Assessment Date:** 2026-10-11  
**Execution Scope:** **Approval 3 Only** (Server environment preparation, client/server privilege separation, and safe secret-isolation verification; zero SQL execution, zero storage visibility changes, zero production deployment)  
**Phase 3 Status:** **LOCAL SERVER INITIALIZATION, BLUEPRINT & SECRET ISOLATION COMPLETE — REMOTE RENDER MUTATION HALTED PER AUTO-DEPLOY SAFEGUARD**

---

## 1. Existing Environment Values & Dependency Audit

Prior to modifying any configuration, we audited all existing environment files, process variables, and server initialization dependencies using safe boolean/length checks (never printing secret values):

| Location / Variable | Pre-Check State | Dependency & Usage Analysis |
| :--- | :--- | :--- |
| [`.env`](file:///c:/remix-verixa/.env) & [`.env.local`](file:///c:/remix-verixa/.env.local) | Present (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, `APP_URL`) | Used by Vite build and local server fallback. Neither `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, nor `ADMIN_SECRET_TOKEN` was present. |
| [`.env.example`](file:///c:/remix-verixa/.env.example) | Present (`4` keys) | Previously listed only `GEMINI_API_KEY`, `APP_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. Updated under Approval 3 to document `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET_TOKEN`, and `NODE_ENV`. |
| [`render.yaml`](file:///c:/remix-verixa/render.yaml) | Absent prior to Approval 3 | Created under Approval 3 with `autoDeploy: false` and `sync: false` for server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET_TOKEN`, `GEMINI_API_KEY`). |
| `RENDER_API_KEY` / `RENDER_SERVICE_ID` / `render` CLI | Not present in local workspace (`set=false`) | Remote Render API/CLI credentials and the live `service_role` secret value are not stored in the local environment. |

---

## 2. Why Live Render Environment Mutation Was Halted (Per Approval 3 Safeguard)

Approval 3 explicitly instructs:
> *"Do not execute the Supabase SQL migration, change storage visibility, or deploy the full application under this approval... If Render settings cannot be changed safely without triggering a deployment, stop and explain the limitation instead of proceeding automatically."*

1. **Render Platform Auto-Deploy / Restart Behavior on Environment Changes:**
   - On Render Web Services, saving environment variable changes in the Render Dashboard (**Environment → Save Changes**) or via the Render REST API (`PUT /v1/services/{serviceId}/env-vars`) automatically triggers a live service restart/redeploy (unless staged inside a Blueprint with `autoDeploy: false` prior to manual sync).
2. **Absence of Remote Render API Credentials & Live Service-Role Secret Locally:**
   - Neither `RENDER_API_KEY` nor the production `SUPABASE_SERVICE_ROLE_KEY` secret exists in the local workspace (`.env` / `.env.local`), and per Limit 2 secret values must never be requested or printed in chat.
3. **Resulting Action Taken:**
   - **Zero production deployments or remote Render restarts were triggered.**
   - All server-side environment handling in [`server.ts`](file:///c:/remix-verixa/server.ts) and [`server/moderation/blockService.ts`](file:///c:/remix-verixa/server/moderation/blockService.ts), the Render Blueprint ([`render.yaml`](file:///c:/remix-verixa/render.yaml) with `autoDeploy: false`), and [`.env.example`](file:///c:/remix-verixa/.env.example) were prepared and verified locally so the operator can enter `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_SECRET_TOKEN` in Render Dashboard (`Environment`) at the exact moment a service restart/deploy is approved.

---

## 3. Exact Code & Configuration Changes Applied Under Approval 3

| File | Lines | Exact Change Applied |
| :--- | :--- | :--- |
| [`server/moderation/blockService.ts`](file:///c:/remix-verixa/server/moderation/blockService.ts#L39-L97) | `39–97`, `254–293`, `777`, `842–844` | 1. Added [`getServerEnvReadiness()`](file:///c:/remix-verixa/server/moderation/blockService.ts#L46-L66) returning boolean-only readiness flags (`supabaseUrlConfigured`, `supabaseAnonKeyConfigured`, `serviceRoleKeyConfigured`, `adminSecretTokenConfigured`) without ever exposing secret values.<br>2. Updated [`getServerSupabase(authHeader?, options?)`](file:///c:/remix-verixa/server/moderation/blockService.ts#L68-L97) so `process.env.SUPABASE_URL` takes precedence over `VITE_SUPABASE_URL`, and **user-scoped requests (`authHeader` passed without `useServiceRole: true`) always use the publishable/anon key + `Authorization: authHeader`** so PostgreSQL RLS remains enforced.<br>3. Updated [`syncFromSupabase`](file:///c:/remix-verixa/server/moderation/blockService.ts#L254-L293) to use `useServiceRole: true` when `SUPABASE_SERVICE_ROLE_KEY` is configured, with automatic fallback to the user-scoped client (`get_my_restricted_user_ids` RPC).<br>4. Updated [`verifyRequestActor`](file:///c:/remix-verixa/server/moderation/blockService.ts#L777) to verify user JWTs via `useServiceRole: false`. |
| [`server.ts`](file:///c:/remix-verixa/server.ts#L110-L119) | `4`, `110–119`, `991–1021`, `3358–3401` | 1. Updated [`GET /api/health`](file:///c:/remix-verixa/server.ts#L110-L119) to include boolean-only `envReadiness` (`blockService.getEnvReadiness()`).<br>2. Updated [`getServerSupabase(authHeader?, options?)`](file:///c:/remix-verixa/server.ts#L991-L1021) to prioritize `process.env.SUPABASE_URL` and preserve user-scoped JWT + RLS whenever `authHeader` is provided.<br>3. Added [`verifyAdminSecretToken(candidate)`](file:///c:/remix-verixa/server.ts#L3362-L3389) in `requireAdminAuth` reading `process.env.ADMIN_SECRET_TOKEN` (with fallback to `ADMIN_SECRET_KEY`), enforcing minimum length `>= 16` chars, using `crypto.timingSafeEqual` for constant-time comparison, and explicitly rejecting `SUPABASE_SERVICE_ROLE_KEY` if misused as an HTTP `x-admin-key` or `Authorization` token. |
| [`render.yaml`](file:///c:/remix-verixa/render.yaml) | `1–36` | Created Render Blueprint declaring `NODE_ENV=production`, `SUPABASE_URL=https://jnbaumemwxydjktwedtz.supabase.co`, `VITE_SUPABASE_URL=https://jnbaumemwxydjktwedtz.supabase.co`, and `sync: false` for `SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET_TOKEN`, and `GEMINI_API_KEY`, with `autoDeploy: false`. |
| [`.env.example`](file:///c:/remix-verixa/.env.example) | `1–21` | Documented `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_SECRET_TOKEN`, and `NODE_ENV` with empty secret placeholders and security rules. |

---

## 4. Safe Verification Results (Zero Secret Values Printed)

All verification checks were executed locally without printing any environment variable values:

1. **TypeScript & Production Bundle Build (`npx tsc --noEmit; npm run build`):**
   - `npx tsc --noEmit`: Exit code `0` (`0` errors).
   - `npm run build`: Exit code `0` (`dist/assets/index-DukhcLcJ.js` and `dist/server.cjs` built cleanly).
2. **Phase 3 Server Initialization & Privilege Separation (`verify_phase3_init_and_isolation.mjs`):**
   - `[PASS] [2] Configured Env Readiness (booleans only)`: `{"supabaseUrlConfigured":true,"supabaseAnonKeyConfigured":true,"serviceRoleKeyConfigured":true,"adminSecretTokenConfigured":true}`
   - `[PASS] [3] Client Privilege Separation`: `userUsesAnonKey=true, defaultWithAuthUsesAnonKey=true, serviceUsesServiceRoleKey=true` (proving user-scoped requests continue using the caller's JWT and RLS while privileged server tasks use the service-role client).
   - `[PASS] [4] Short ADMIN_SECRET_TOKEN (<16 chars) rejected`: `adminSecretTokenConfigured=false`
   - `[PASS] [5] Frontend Bundle Secret Isolation`: `distJsFilesChecked=1, secretLeakedInDist=false`
   - `[PASS] [6] render.yaml & .env.example Safe Configuration`: `templatesSafe=true`

---

## 5. Operator Checklist When Applying in Render Dashboard (Requires Restart)

When you are ready to apply the live Render environment variables (which **will require/trigger a Render service restart**):

1. In **Render Dashboard → `verixa-app` → Settings**, set **Auto-Deploy** to **No** (`Off`) if you wish to edit multiple variables before restarting.
2. In **Render Dashboard → `verixa-app` → Environment**, add/update:
   - `SUPABASE_URL` = `https://jnbaumemwxydjktwedtz.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = *(paste `service_role` secret from Supabase Dashboard → Project Settings → API)*
   - `ADMIN_SECRET_TOKEN` = *(paste 32-byte hex secret generated via `openssl rand -hex 32`)*
3. Trigger a single manual restart/deploy and verify `GET /api/health` returns:
   ```json
   {
     "status": "ok",
     "envReadiness": {
       "supabaseUrlConfigured": true,
       "supabaseAnonKeyConfigured": true,
       "serviceRoleKeyConfigured": true,
       "adminSecretTokenConfigured": true
     }
   }
   ```
