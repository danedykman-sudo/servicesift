# ServiceSift - Project Status

## 1. Project Overview
- **What ServiceSift does:** Convert Google (and Yelp) review feeds into actionable root causes, staff coaching scripts, process changes, and a 30-day backlog so businesses can stop chasing bad reviews and start fixing the experience.
- **Target users & value:** Operators of experience-driven businesses (gyms, restaurants, retail/service brands) who want a low-effort way to translate customer feedback into prioritized operational fixes, coaching scripts, and shareable reports.
- **Current status:** Production-ready beta—the UI, payment gating, Supabase-backed auth/DB, and report pipeline are wired end-to-end, and docs show Stripe + Supabase deployments live on Vercel/Supabase with `MAINTENANCE_MODE` off by default.

## 2. Complete Feature Inventory
| Feature | What a user can do | Status |
| --- | --- | --- |
| Landing + analysis composer | Paste a Google Maps/Yelp URL (demo mode available), validate it, optionally edit the parsed business name, and trigger the payment modal or free-run path. | Fully Functional |
| Payment flow + deferred analysis creation | PaymentModal handles deferred analysis drafts, `create-checkout` → Stripe, `confirm-payment` → Supabase, and Stripe webhook updates `payment_status`. Handles retries, manual `Run Analysis Now`, and free runs when `VITE_PAYMENTS_DISABLED=true`. | Fully Functional |
| Dashboard (business list, cleanup, manual triggers) | View every business, rename/delete it, clean duplicates, detect stuck analyses, see inline progress cards, and use “Run Analysis Now” to re-trigger the Supabase pipeline. | Fully Functional |
| Report status/Artifacts page | Poll `/api/report-status`, show a stepper, copy links, download signed PDFs/JSON via `/api/mint-report-artifact-url`, and route to the finished report. | Fully Functional |
| Detailed report viewer | Inspect root causes, coaching scripts, process changes, backlog, download PDFs, and view history/backlinks to delta reports. | Fully Functional |
| Delta/3-lens comparison page | Compare against baseline with Pulse (last 30 vs prev 30 days), new-since-last-run, and baseline-drift views backed by `deltaAnalysis` helpers. | Fully Functional |
| Supabase review pipeline (extract → analyze → persist → PDF) | Edge functions `extract-reviews` and `analyze-reviews` feed data into `run-analysis`, which stores reviews, root causes, coaching scripts, backlog, creates reports/artifacts, and fires `generate-pdf-report`. | Fully Functional |
| Authentication flows + route protection | Signup/login/forgot/reset all call Supabase auth through `AuthContext` and `ProtectedRoute` gates. | Fully Functional |
| Share & export actions | Download PDF via browser print, copy any section, share URL, or send the report link over email (`send-report-email` using Resend). | Fully Functional |
| Report emails | `/api/send-report-email` verifies ownership, builds Resend email with the status URL, and can be triggered from the dashboard/report. | Fully Functional |

## 3. Technical Architecture
- **Tech stack:** Vite + React 18 + TypeScript frontend, Tailwind for styling, Lucide icons, React Router 7 for navigation, Supabase for auth/DB/edge functions/storage, Stripe for payments, Resend for outbound emails, PDF-Lib for PDF generation, hosted on Vercel with rewrites and Node API routes.
- **Frontend architecture:** `main.tsx` boots `AuthProvider`, `App.tsx` defines routes + header logic, `src/pages/LandingPage.tsx` handles the hero, input validation, PaymentModal, demo mode, `Dashboard` monitors analyses, and `ViewReport`/`DeltaReport` render results. Shared components (`PaymentModal`, `BusinessCard`, `Header`, `ProtectedRoute`) and libs (`supabase`, `database`, `deltaAnalysis`, `stripe`, `analysisGuard`) keep logic reusable.
- **Backend architecture:**
  - **Vercel API routes:** `/api/create-checkout`, `/api/confirm-payment`, `/api/stripe-webhook`, `/api/trigger-analysis`, `/api/free-run-analysis`, `/api/report-status`, `/api/report-by-analysis`, `/api/mint-report-artifact-url`, `/api/send-report-email`, `/api/mint-report-artifact-url`.
  - **Supabase edge functions:** `extract-reviews`, `analyze-reviews`, `run-analysis`, `generate-pdf-report`, `test-auth`.
  - `run-analysis` orchestrates extraction → AI analysis → database writes → report creation → PDF kick-off (see snippet below).

```216:239:supabase/functions/run-analysis/index.ts
    console.log("[run-analysis] DEBUG: Analysis record found", {
      analysisId,
      currentStatus: analysis.status,
      paymentStatus: analysis.payment_status,
      businessUrlFromRequest: businessUrl,
      businessUrlFromDb: analysis.business_url,
      finalBusinessUrl,
      businessNameFromRequest: businessName,
      businessNameFromDb: analysis.business_name,
      finalBusinessName,
      timestamp: new Date().toISOString()
    });

    const analysisStartTime = Date.now();

    try {
      // Step 1: Extract reviews
      console.log("[run-analysis] Step 1/3: Extracting reviews", {
        analysisId,
        businessUrl: finalBusinessUrl.substring(0, 50),
        timestamp: new Date().toISOString()
      });
```

- **Authentication flow:** `AuthProvider` refreshes Supabase sessions, exposes `signUp`, `signIn`, `signOut`, `resetPassword`, and `ProtectedRoute` redirects unauthenticated users to `/login` while showing a loader.
- **Payment processing:** `PaymentModal` calls `createCheckoutSession` (frontend `src/lib/stripe.ts`), which POSTs to `/api/create-checkout` with the user’s JWT, amount, business ID, analysis ID, and metadata; Stripe redirects to `/dashboard?session_id=...`; `Dashboard` sees the query param, calls `/api/confirm-payment` to hard-link payment status, create a report row, and fire `run-analysis`; `stripe-webhook` keeps `payment_status` in sync for async payments; manual fallback uses `/api/trigger-analysis`.

## 4. API Integrations Status
- **Stripe (checkout, webhook, subscription management):**
  - Purpose: Accept card payments, tie checkout sessions to analyses, update Supabase payment fields.
  - Endpoints: `/api/create-checkout`, `/api/confirm-payment`, `/api/stripe-webhook`, `/api/trigger-analysis` (manual rerun).
  - Status: Live (checkout → confirm → run analysis loop). Webhook only flips `payment_status`; `confirm-payment` handles orchestration and report creation.
  - Required credentials: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
  - Known issues: Payment processing logs guard against duplicate `session_id`s and stuck status; manual trigger exists for stuck analyses.
- **Supabase (auth, database, functions, storage):**
  - Purpose: Auth (email/password), RLS-protected tables (businesses, analyses, reviews, delta data, reports), edge functions for extraction/analysis/pdf, storage bucket `report-artifacts`.
  - Endpoints/features: Supabase client in `src/lib/supabase.ts`, edge functions invoked via `run-analysis`, storage access through service role, migrations define schema.
  - Status: Active; `run-analysis` updates statuses and writes artifacts, `generate-pdf-report` uses `PDF_INTERNAL_SECRET`.
  - Credentials needed: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend); `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (edge functions); optional `DEBUG_SYNC_RUN_ANALYSIS`.
  - Known limitations: RLS policies block client updates to payment fields, so webhooks/service role must mutate them.
- **Google Maps / Places (review fetching):**
  - Purpose: Source review text/ratings from Google Maps (Landing validates URLs containing `google.com/maps`/`yelp.com`).
  - Implementation: `extract-reviews` edge function hits the crawler (observed in code) and returns `reviewCount`, `reviews`, `businessName`, `totalScore`.
  - Status: Working when URL points to public reviews; `LandingPage` shows extraction errors with recovery tips.
  - Credentials: None explicitly stored here, but the crawler may rely on environment or runtime configuration.
- **Resend (email delivery):**
  - Purpose: Send “Report ready” emails via `/api/send-report-email`.
  - Status: Operational; POSTs to `https://api.resend.com/emails` with `RESEND_API_KEY`, `FROM_EMAIL`, builds HTML/text using report URL.
  - Known issues: None noted; error logging surfaces failures.
- **PDF generation (pdf-lib via Supabase function):**
  - Purpose: Transform stored JSON artifact into a printable PDF and save it with `report-artifacts`.
  - Status: Fire-and-forget call from `run-analysis`; edge function validates `PDF_INTERNAL_SECRET` and writes to storage.
  - Credentials: `PDF_INTERNAL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

## 5. User Journey & Workflows
1. **New user signup flow**
   - User lands on `/signup`, fills email/password; `signUp` uses Supabase to create a session.
   - On success, `AuthContext` stores the session and redirects to `/dashboard`, where businesses will load via `getUserBusinesses`.
2. **Payment/subscription flow**
   - Landing page collects a URL; `handleAnalyze` ensures business exists, prepares draft data, and opens `PaymentModal`.
   - `PaymentModal` calls `createCheckoutSession`; Stripe redirects back with `session_id` in `/dashboard`.
   - `Dashboard` sees the query param, calls `/api/confirm-payment`, hard-links payment, inserts/updates `reports`, and fires `run-analysis`.
   - If `run-analysis` fails/polls too long, dashboard shows manual `Run Analysis Now` to call `/api/trigger-analysis`.
3. **Core 3-lens feature usage**
   - Once a follow-up is saved, `compareAnalyses` (frontend or backend) populates `analysis_deltas`.
   - `/delta/:analysisId` displays Pulse (`getPulseComparison`), “New Since Last Run” (`getNewSinceLastRunComparison`), and baseline drift (`getBaselineDriftComparison`), highlighting improving/worsening/new issues.
4. **Business data input**
   - Landing input normalizes URLs (`normalizeUrl` in `src/lib/database.ts`), reuses existing businesses, and prevents duplicate analyses via `analysisGuard`.
   - Custom names update `businesses` via `updateBusinessName`; deletion removes analysis cascades.
5. **Viewing/exporting analysis results**
   - Report status page polls `/api/report-status`, then `ViewReport` loads `getFullAnalysisReport`.
   - Users download PDF through `generate-pdf-report` artifact URL, copy sections, share the link, or use `/api/send-report-email` to notify stakeholders.

## 6. Data Models & Storage
- `businesses` (id PK, user_id FK auth.users, business_name, google_maps_url, created_at, unique per user+URL).
- `analyses` (id PK, business_id FK, user_id, business_url/name, review_count, average_rating, is_baseline, status, payment_status, payment_id, amount_paid, paid_at, stripe_checkout_session_id/payment_intent, created_at, completed_at, error_message). Clients allowed only to modify non-payment fields; service role handles payments.
- `root_causes`, `coaching_scripts`, `process_changes`, `backlog_tasks` (all FK to `analysis_id`, store analysis insights and are inserted en masse from `run-analysis` result arrays).
- `analysis_deltas` (analysis_id FK, baseline_id FK, delta_data JSONB, created_at, UNIQUE on analysis_id) stores the 3-lens comparison payload.
- `reviews` (rating, text, review_date, author per review) saved from `extract-reviews`.
- `reports` (analysis_id, business_id, stripe_checkout_session_id, status enum, coverage_level, run_type, latest_artifact_version, error fields); used by `/report-status` and ensures the UI has a single flow status.
- `report_artifacts` (report_id FK, kind json/pdf/zip, storage_path, version) backs signed downloads via `/api/mint-report-artifact-url`.
- `report_events` (audit trail for statuses; mostly optional but useful for debugging).
- Storage bucket `report-artifacts` (Supabase storage) holds JSON/PDF blobs referenced via the artifact table.
- `localStorage` usage: Dashboard saves `lastActiveReportId` so users can return to in-progress reports.

## 7. Code Organization
- `src/pages/` – main views (Landing, Dashboard, ReportStatus, ViewReport, DeltaReport, auth screens, Maintenance). Landing orchestrates detections, Dashboard handles payment confirmation/polling, reports render results.
- `src/components/` – reusable UI (Header, PaymentModal, BusinessCard, ProtectedRoute).
- `src/contexts/AuthContext.tsx` – Supabase auth lifecycle, exposed hooks for sign in/out/reset.
- `src/lib/` – helpers (`supabase` client, `database` queries, `stripe` session creation, `deltaAnalysis` comparisons, `dateFiltering`, `analysisGuard`).
- `api/` – Vercel serverless routes for payments, reporting, background triggers, free-run, PDF/email artifacts.
- `supabase/functions/` – Deno edge functions for extraction, analysis, running the pipeline, and generating PDFs.
- `supabase/migrations/` – SQL definitions for tables, RLS policies, indexes, service-role protections, and payment safeguards.

## 8. Known Issues, TODOs, and Technical Debt
- **TODO comments:** None found in the current code (verified via ripgrep).
- **Known/repeat issues:**
  - Dashboard polling watches for repeated `PGRST116` 400s and timeouts; underlying RLS/schema drift may still surface during migrations.
  - Analysis pipeline logs indicate long-running extractions; `trigger-analysis` exists to recover from `500` or stuck `extracting`/`analyzing` states.
  - Payment guard logic (`analysisGuard`, duplicate session filters) prevents double inserts but makes debugging complex—no automated assertions yet.
- **Technical debt/perf:** No automated tests yet; manual end-to-end flows (analysis → dashboard → report) serve as quality gate. Logging is verbose and uses `any`, so TypeScript strictness is lower around API responses and `fetch` helpers.

## 9. Recent Major Changes
1. **Confirm-payment-driven pipeline:** `/api/confirm-payment` now hard-links the Stripe session to an analysis, creates/updates `reports`, and asynchronously calls `/functions/v1/run-analysis`, reducing duplicate analysis creation (vs. earlier Landing page handling).
2. **3-lens delta tracking:** `analysis_deltas` table + `deltaAnalysis.ts` support Pulse/New-Since/Baseline comparisons surfaced in `/delta/:analysisId`; delta results are saved whenever `is_baseline` is false.
3. **PDF artifact workflow:** `run-analysis` now writes JSON artifacts, stores them in `report-artifacts`, and triggers `generate-pdf-report`, which uses `PDF_INTERNAL_SECRET` to guard PDF creation and surfaces downloads via `/api/mint-report-artifact-url`.
4. **Robust Dashboard recovery:** Added manual `Run Analysis Now`, duplicate cleanup utilities (`cleanupDuplicateBusinesses`, `fixCorruptedBusinessNames`), and `localStorage` persistence for the last active report to keep in-progress runs connected.
5. **Free-run and email flows:** `PaymentModal` free button + `/api/free-run-analysis` let teams run analyses without Stripe when `VITE_PAYMENTS_DISABLED=true`, while `/api/send-report-email` uses Resend to notify stakeholders once reports are ready.

## 10. Environment & Deployment
- **Hosting:** Vercel (front-end + API routes) with `vercel.json` rewrites; Supabase hosts PostgreSQL, storage, and edge functions.
- **Build/deploy:** `npm run build` (Vite), `npm run dev` for local, `npm run lint`, `npm run typecheck`. Vercel automatically rebuilds on push; Supabase edge functions deploy separately via CLI/`supabase/functions`.
- **Required env vars:**
  - Client/UI: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYMENTS_DISABLED` (optional to enable demo/free mode).
  - Server/API: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PDF_INTERNAL_SECRET`, `RESEND_API_KEY`, `FROM_EMAIL`, `VERCEL_URL` (for email link), optional `DEBUG_SYNC_RUN_ANALYSIS`.
  - Supabase functions auto-inject `SUPABASE_URL`/`ANON_KEY`; service role key is required for database mutations (reports, analyses, artifacts) and storage access.
- **CI/CD/observability:** No dedicated CI apart from `npm` scripts; logging statements across API routes/edge functions capture flow state and errors. Vercel + Supabase handle deployment; Supabase migrations update schema.

## 11. Dependencies
- **Critical runtime:** `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, `stripe`, `lucide-react`.
- **Styling/build tooling:** `tailwindcss`, `postcss`, `autoprefixer`, `@vitejs/plugin-react`, `vite`.
- **Type tooling/lint:** `typescript`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `typescript-eslint`.
- **Comments:** The stack is intentionally minimal; frontend depends on Supabase + Stripe helper libs while lint/type deps remain standard.

## 12. Testing & Quality
- **Existing tests:** None. Quality relies on manual E2E flows: hitting `/` → `PaymentModal` → Stripe → Dashboard → Report/Delta.
- **Lint/type checks:** `npm run lint` (eslint), `npm run typecheck` (tsc). No automated coverage reports.
- **Code quality notes:** API routes use `any` for `req/res`, so the TypeScript surface there is loose. `run-analysis` and other Deno functions log heavily but also treat failures as `throw` with messages (e.g., `SAVE_FAILED`, `EXTRACTION_FAILED`), giving debugging context. Manual testers should watch the Dashboard debug panel (session id, API status, polling info) and the `_debug` logs in `api/trigger-analysis`/`confirm-payment`.


