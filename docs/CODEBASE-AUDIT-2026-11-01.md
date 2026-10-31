# VistaBalayan Establishments Portal — Codebase Audit

**Audit date:** 2026-11-01  
**Repository:** `VistaBalayan-Establishments-Portal`  
**Scope:** Full static repository audit, live Supabase policy/schema read-only inspection, dependency audit, unit tests, build/type checks, and attempted browser QA.  
**Data policy:** No production records were modified during this audit.

## Executive summary

The application builds and its unit tests pass, but the audit found several release-blocking risks:

- **Critical — authorization/data-integrity risk:** staff report update policies allow workflow fields such as `status`, `reviewed_by`, `reviewed_at`, and `notes` to be updated from the staff establishment scope. This can let a staff account change review state or attribution unless the client/database contract intentionally permits it.
- **High — migration/release integrity:** local and linked Supabase migration inventories are out of sync. The linked project contains remote-only migrations, while the repository contains local-only migrations. A future migration push can be incomplete, reordered, or unsafe without reconciliation.
- **High — dependency security:** `npm audit --omit=dev` reports 2 high and 9 moderate vulnerabilities, including a high-severity React Router range issue and denial-of-service advisories.
- **High — AI analytics completeness:** the server-side AI data loader limits visitor and accommodation queries to 500 rows per table without pagination. AI insights can therefore be generated from an incomplete dataset.
- **Medium — reporting contract divergence:** Reports, Analytics, and AI use different status and period rules. The Reports page currently loads rows without a status predicate, while Analytics and AI use submitted/approved-style eligibility rules. This can produce different totals for the same selected period.
- **Medium — runtime/availability:** authentication profile-loading errors are converted into a signed-out state, so a transient profile or establishment query failure can look like an invalid account and interrupt users.
- **Verification limitation:** Playwright browser tests could not run because the required browser runtime could not be downloaded in this environment; all 15 tests failed at browser launch, not at application assertions.

The repository is **not fully audit-clean**. The highest-priority work is authorization hardening, migration reconciliation, dependency remediation, and paginating AI/report data paths.

## Findings

### AUD-001 — Staff can update report workflow/review fields

- **Severity:** Critical
- **Category:** Authorization / data integrity
- **Confidence:** Confirmed by live policy and grant inspection
- **Evidence:**
  - `supabase/migrations/20261024_inactive_read_only_access.sql:121-133`
  - `supabase/migrations/20261024_inactive_read_only_access.sql:147-159`
  - Live `pg_policies` query for `visitor_reports` and `accommodation_reports`
  - Live `information_schema.column_privileges` query shows authenticated `UPDATE` on `notes, reviewed_at, reviewed_by, status`
- **Issue:** The staff update policies permit updates for the current active establishment. The authenticated role has update privileges on `status`, `reviewed_by`, `reviewed_at`, and `notes`. The policy does not distinguish officer review updates from staff edits.
- **Impact:** A compromised or malicious establishment account may mark its own report as approved, rejected, or otherwise change review attribution and notes. This undermines the report workflow and the truthfulness of monitoring/analytics eligibility.
- **Recommended remediation:** Revoke staff update privileges on workflow/review columns. Split staff self-edit columns from officer-only review columns, or expose a narrowly validated RPC for staff edits. Add database-level regression tests for status/reviewer tampering.

### AUD-002 — Supabase migration history is out of sync

- **Severity:** High
- **Category:** Release integrity / database operations
- **Confidence:** Confirmed by `supabase migration list --linked`
- **Evidence:**
  - `supabase migration list --linked` showed local-only and remote-only entries.
  - Remote-only examples include `20261005`, `202610290001`, `202610290002`, `202610290003`, and `202610290004`.
  - Local-only entries include multiple dated migrations whose remote column is blank.
  - Repository contains 34 migration files, including `20261029_preserve_user_role_on_edit.sql` and `20260922_harden_room_detail_validation.sql`.
- **Issue:** The repository migration directory does not represent the same ordered migration history as the linked database.
- **Impact:** A normal `supabase db push` can fail, apply an unintended subset, or leave frontend/API code ahead of the deployed schema. Manual repair without mapping every version can also mark unapplied changes as applied.
- **Recommended remediation:** Freeze migration changes, export the linked migration history, compare every local file to the remote version, identify intentionally applied SQL, then reconcile with narrowly scoped `supabase migration repair` and idempotent SQL only after review. Do not use broad `--include-all` pushing.

### AUD-003 — Production dependency vulnerabilities

- **Severity:** High
- **Category:** Supply-chain security
- **Confidence:** Confirmed by `npm audit --omit=dev --json`
- **Evidence:**
  - `package.json:55` uses `exceljs`.
  - `package.json:68` uses `react-router`.
  - Audit result: **11 production vulnerabilities: 2 high, 9 moderate, 0 critical**.
  - React Router is in an affected range below `7.18.2`, with advisories including route matching denial of service and other protocol/redirect issues.
  - ExcelJS pulls affected `archiver`, `brace-expansion`, `glob`, `minimatch`, `rimraf`, `uuid`, and `zip-stream` dependency ranges.
- **Impact:** Depending on reachable code paths and runtime packaging, attackers may trigger denial of service, route handling abuse, or vulnerable archive behavior.
- **Recommended remediation:** Create a dependency-upgrade branch. Upgrade React Router to the patched compatible release and test routing/redirect behavior. Evaluate the ExcelJS major-version upgrade and run export regression tests before production deployment. Re-run both full and production-only audits.

### AUD-004 — AI generation silently truncates report data at 500 rows

- **Severity:** High
- **Category:** Analytics correctness / data completeness
- **Confidence:** Confirmed by source inspection
- **Evidence:** `api/generate-insights.js:87-100`
- **Issue:** Both visitor and accommodation AI queries use `.limit(500)` and do not paginate or aggregate server-side.
- **Impact:** Municipal AI insights can omit older or additional reports once a table exceeds 500 rows. The resulting recommendations and anomalies may be based on an incomplete dataset while appearing successful.
- **Recommended remediation:** Paginate with a deterministic order, or replace raw-row loading with bounded server-side aggregates. Include a returned source count and completeness marker in the prompt/result. Add a regression fixture above 500 rows.

### AUD-005 — Reporting screens use different eligibility and period contracts

- **Severity:** Medium
- **Category:** Reporting consistency
- **Confidence:** Confirmed by source inspection
- **Evidence:**
  - `src/app/pages/officer/Reports.tsx:149-155` loads reports by date without a status predicate.
  - `src/app/pages/officer/Analytics.tsx:145-152` applies a status allow-list and a selected-year range.
  - `api/generate-insights.js:87-100` uses `status = 'submitted'` and a 500-row limit.
  - `src/app/pages/officer/Reports.tsx:103-106` defaults to the current month, while Analytics is year-based.
- **Issue:** The same records can appear in Reports but be excluded from Analytics or AI. Current-month versus full-year defaults also make side-by-side totals appear inconsistent.
- **Impact:** Officers may interpret valid differences as missing data, or make decisions using totals that are not comparable across pages.
- **Recommended remediation:** Define one documented eligibility contract and one normalized period model. Reuse the same query helper for Reports, Monitoring, Analytics, exports, and AI. Label monthly/yearly comparisons explicitly in the UI.

### AUD-006 — Accommodation performance uses check-ins while surrounding analytics exposes guest nights

- **Severity:** Medium
- **Category:** Metric correctness
- **Confidence:** Confirmed by source inspection
- **Evidence:** `src/app/pages/officer/Analytics.tsx:210-219`, `src/app/pages/officer/Analytics.tsx:233-244`, and `src/app/components/vista/EstablishmentPerformanceDashboard.tsx:50-55`
- **Issue:** The overnight performance dashboard stores accommodation `total_check_ins` as `visitorCount`, while the main Analytics seasonal data separately computes `total_guest_nights`.
- **Impact:** Officers may read the accommodation performance ranking as guest-night performance when it is actually based on check-ins.
- **Recommended remediation:** Rename the metric to `Guest check-ins` where that is intended, or feed and label guest nights separately. Keep check-ins, guest nights, occupied rooms, and room usage as distinct measures.

### AUD-007 — Profile/establishment load failures force logout

- **Severity:** Medium
- **Category:** Availability / authentication UX
- **Confidence:** Confirmed by source inspection
- **Evidence:** `src/contexts/AuthContext.tsx:29-69`, `src/contexts/AuthContext.tsx:91-105`, and `src/contexts/AuthContext.tsx:115-123`
- **Issue:** Any profile or linked-establishment query error returns `null`; the auth flow then signs the user out.
- **Impact:** Temporary Supabase/network failures can appear as invalid credentials, terminate a valid session, and make troubleshooting difficult.
- **Recommended remediation:** Distinguish `auth_invalid`, `profile_missing`, and `dependency_unavailable`. Keep the session on transient errors, show a retry state, and sign out only when the session is invalid or the profile is definitively deleted.

### AUD-008 — Staff route refresh can render stale capability state briefly

- **Severity:** Medium
- **Category:** Authorization UX / state consistency
- **Confidence:** Confirmed by source inspection; database policies remain the final boundary
- **Evidence:** `src/app/components/ProtectedRoute.tsx:12-16` and `src/app/components/ProtectedRoute.tsx:22-26`
- **Issue:** Staff profile refresh is started in an effect after navigation, while the existing profile is rendered immediately. A route requiring an active staff account can therefore briefly render using stale profile status.
- **Impact:** The UI may show mutation controls for an account that has just been deactivated. RLS blocks properly protected writes, but the experience is misleading and can produce confusing failures.
- **Recommended remediation:** Gate protected capability routes on a current profile check, or expose a profile-refresh/loading state before rendering mutation pages. Keep server/database enforcement independent.

### AUD-009 — Server error helper can expose internal provider/database details

- **Severity:** Medium
- **Category:** Information disclosure
- **Confidence:** Confirmed by source inspection
- **Evidence:** `api/_utils/emailjs.js:36-42` and `api/geoapify-search.js:63-68,87-89`
- **Issue:** `describeError` returns arbitrary provider/database error messages, and the Geoapify endpoint sends those details to clients.
- **Impact:** Internal schema names, provider diagnostics, or configuration details may be exposed to authenticated callers and become useful reconnaissance.
- **Recommended remediation:** Log detailed errors server-side with a request ID. Return stable, generic client errors and only expose validation messages intentionally classified as safe.

### AUD-010 — Serverless in-memory rate limits are not durable

- **Severity:** Medium
- **Category:** Abuse protection
- **Confidence:** Confirmed by source inspection
- **Evidence:** `api/_utils/emailjs.js:73-98` and `api/generate-insights.js:13-55`
- **Issue:** OTP and AI request limits are stored in process-local `Map` instances.
- **Impact:** Serverless cold starts and multiple instances reset or split the counters, allowing more requests than the configured limits. This weakens OTP abuse protection and AI cost controls.
- **Recommended remediation:** Use a database/Redis-backed limiter or a provider-supported rate-limit service. Bind limits to trusted platform client identity/IP data and retain a user-level fallback.

### AUD-011 — Local generated/test artifacts are untracked

- **Severity:** Medium
- **Category:** Repository hygiene / release risk
- **Confidence:** Confirmed by `git status --short`
- **Evidence:** Untracked `.hermes/`, `playwright-report/`, `src/lib/.hermes-tmp.hnk1d1`, `supabase/.temp/`, `test-results/`, and `supabase/migrations/20260922_harden_room_detail_validation.sql`.
- **Issue:** Generated reports, temporary files, and an apparently substantive migration are mixed with the working tree.
- **Impact:** A broad `git add -A` can commit generated artifacts, temporary database metadata, or an unreviewed migration. A deployment may also omit a locally present migration that was assumed to be included.
- **Recommended remediation:** Keep generated artifacts ignored and outside commits. Review the untracked migration separately, decide whether it is approved, and commit only intentionally reviewed files.

### AUD-012 — End-to-end browser QA is currently blocked by environment setup

- **Severity:** Medium
- **Category:** Verification gap
- **Confidence:** Confirmed by command output
- **Evidence:** `npx playwright test --project=desktop --reporter=line` attempted 15 tests; all failed before execution because the Chromium executable was missing. `npx playwright install chromium` then failed while downloading FFmpeg due repeated CDN timeouts.
- **Impact:** Accessibility, keyboard, responsive, and authenticated interaction behavior were not verified in this audit.
- **Recommended remediation:** Run the suite in a networked environment or CI runner with `npx playwright install --with-deps chromium webkit`, then verify authenticated test secrets by presence only. Do not treat the current 15 failures as application failures.

## Positive verification

- `npm test`: **5 test files passed; 23 tests passed**.
- `npx tsc --noEmit`: passed during the audit’s latest application validation.
- `npm run build`: passed during the audit’s latest application validation.
- `git diff --check`: passed during the audit’s latest application validation.
- Live Supabase policy inspection confirmed that the latest inactive-read-only migration is present for reports, establishments, profiles, AI cache, and notifications.
- No tracked `.env`, private-key, or credential file was found by `git ls-files`.
- The production portal returned HTTP 200 during the latest deployment verification.

## Audit limitations

- No destructive or state-changing security tests were executed against production.
- No credentials, tokens, or authenticated browser cookies were printed or stored.
- Browser-based QA could not run because Playwright browser downloads timed out.
- Dependency advisories require reachability analysis and upgrade testing before assigning exploitability to each runtime path.
- This report identifies issues; it does not apply fixes or migration repairs.

## Recommended remediation order

1. Lock report/profile workflow columns at the database grant/policy level and add role-matrix regression tests.
2. Reconcile local and remote Supabase migration histories before any further schema deployment.
3. Upgrade React Router and evaluate the ExcelJS dependency tree in an isolated branch with export/routing tests.
4. Remove the 500-row AI truncation with pagination or server-side aggregation.
5. Establish one report eligibility/date-period contract shared by Reports, Monitoring, Analytics, exports, and AI.
6. Replace process-local rate limits and genericize client-facing server errors.
7. Run the complete Playwright suite in CI and attach the results to the next release audit.

## Conclusion

The portal is buildable and its unit-level utility tests are green, but it should not be described as fully security- or production-verified until the authorization workflow, migration drift, dependency vulnerabilities, AI truncation, and browser-test blocker are addressed.