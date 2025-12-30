# Feature Flags Applied

## Files Checked In
- `src/components/BusinessCard.tsx` – Wrapped the delta comparison link in `FEATURES.ENABLE_DELTA_ANALYSIS`.
- `src/pages/ViewReport.tsx` – Imported `FEATURES`, short-circuited delta navigation + delta buttons when the flag is off, and gated the Download PDF button (also added the flag guard for downloads so the API path isn’t hit when PDFs are disabled).
- `src/lib/deltaAnalysis.ts` – Imported the flag helper and return `null` from every exported helper when delta tracking is turned off.
- `src/pages/LandingPage.tsx` – Wrapped delta-save logic behind `ENABLE_DELTA_ANALYSIS` so follow-up toast and `saveDeltaAnalysis` only fire when the feature is enabled.
- `src/pages/DeltaReport.tsx` – Imported `FEATURES` and render a “Delta Analysis Disabled” placeholder when the flag is false to avoid footguns from unused hooks.
- `supabase/functions/run-analysis/index.ts` – Added a local `FEATURES` map for Deno, skipped delta saves when the flag is off, and wrapped the PDF generation block in `ENABLE_PDF_GENERATION`.
- `src/pages/ReportStatus.tsx` & `api/mint-report-artifact-url.ts` – Added `FEATURES.ENABLE_PDF_GENERATION` guards so PDF buttons/API calls disappear/return 404 when disabled.
- `api/send-report-email.ts` – Guarded the handler with `ENABLE_EMAIL_SHARING` so it immediately 404s when disabled.
- `src/pages/LandingPage.tsx` – Also gated the “Share Report” button with `ENABLE_EMAIL_SHARING`.
- `src/pages/Dashboard.tsx` and `api/trigger-analysis.ts` – Wrapped manual cleanup + “Run Analysis Now” buttons behind `ENABLE_MANUAL_TRIGGERS`, and 404’d the manual trigger API when the flag is false.
- `src/config/features.ts` – Enabled `ENABLE_FREE_MODE` per the latest request.

## Notes
- **Testing:** `npm run typecheck` and `npm run lint` currently fail; see logs in the main summary for outstanding issues (mostly unrelated `any`/unused-var lint errors and pre-existing type errors). `npm run build` succeeds with the usual browserslist warning.

