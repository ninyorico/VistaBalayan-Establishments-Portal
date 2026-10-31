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

## Additional independent-review findings

### AUD-013 — Visitor report submission is not idempotent

- **Severity:** High
- **Evidence:** `src/app/pages/staff/SubmitVisitorReport.tsx:292-327`; accommodation idempotency exists in `supabase/migrations/20260915_ai_cache_and_atomic_accommodation.sql:57-62`, but visitor submission has no equivalent key or uniqueness rule.
- **Impact:** A timeout, double-click, or retry can insert duplicate visitor rows, inflating monitoring, analytics, and exports.
- **Recommended remediation:** Add a client-generated submission key with a database uniqueness constraint or transactional RPC. Retries should return the original result.

### AUD-014 — Staff onboarding can leave orphaned Auth users

- **Severity:** High
- **Evidence:** `src/app/pages/officer/Establishments.tsx:540-587` creates/updates the Auth user before all establishment/profile steps finish; the failure path removes the establishment but does not remove or disable the newly created Auth user.
- **Impact:** Failed onboarding can leave an active login without a matching profile or establishment and can block retry with the same email.
- **Recommended remediation:** Use a server-side compensating transaction or explicitly delete/disable the newly created Auth user on every downstream failure, then verify rollback state.

### AUD-015 — Visitor report default date uses UTC instead of the local Philippine date

- **Severity:** Medium
- **Evidence:** `src/app/pages/staff/SubmitVisitorReport.tsx:50-51` and `:335` use `new Date().toISOString().slice(0, 10)`.
- **Impact:** Between local midnight and 08:00 Philippine time, the form defaults to the previous calendar day.
- **Recommended remediation:** Use a local-calendar formatter based on `getFullYear()`, `getMonth() + 1`, and `getDate()`.

### AUD-016 — Weekly range implementations disagree

- **Severity:** High
- **Evidence:** `src/app/pages/officer/Reports.tsx:34-49` serializes local dates with `toISOString()`, while `src/lib/reportPeriod.ts:17-21` uses a separate UTC-based implementation. Reports uses its local helper; monitoring/export paths use the shared helper.
- **Impact:** The same displayed week can query different seven-day date sets across Reports, monitoring, and exports, especially around New Year.
- **Recommended remediation:** Use one shared week-range helper and add timezone boundary tests.

### AUD-017 — Public review-photo storage permits anonymous unrestricted uploads

- **Severity:** High
- **Evidence:** `supabase/migrations/20260918_moderate_review_photos.sql:19-37` creates a public bucket and permits anonymous/authenticated inserts based primarily on a filename pattern.
- **Impact:** Attackers can repeatedly upload arbitrary files under valid-looking paths, causing storage abuse and hosting unmoderated content. The policy does not enforce object size, MIME type, review linkage, or quota.
- **Recommended remediation:** Use signed/server-owned upload paths, enforce MIME/size limits, link uploads to pending reviews, scan/validate content, and rate-limit anonymous uploads.

### AUD-018 — Authenticated staff can write AI recommendation/anomaly/cache records

- **Severity:** High
- **Evidence:** `supabase/migrations/20261024_inactive_read_only_access.sql:202-228` permits active establishment staff to insert AI recommendations, anomalies, and insight-cache rows. The server endpoint is not the only write path.
- **Impact:** Staff can inject arbitrary AI text, severity, status, timestamps, and cache payloads for their establishment, poisoning operational insights.
- **Recommended remediation:** Remove client INSERT privileges/policies from AI tables. Allow writes only through the validated server endpoint or officer-controlled RPC.

### AUD-019 — Direct staff report INSERTs leave important business values client-controlled

- **Severity:** Medium
- **Evidence:** `supabase/migrations/20261024_inactive_read_only_access.sql:115-152` permits direct staff inserts; the validation trigger in `supabase/migrations/20260914_authorization_report_update_hardening.sql:196-224` does not fully constrain report dates, duplicate daily submissions, or all numeric invariants.
- **Impact:** A staff client can submit backdated/future-dated, duplicate, or numerically manipulated reports while satisfying ownership RLS.
- **Recommended remediation:** Use validated transactional RPCs or database constraints/triggers for dates, duplicates, reporting mode, numeric invariants, and immutable submitter/establishment fields.

### AUD-020 — SECURITY DEFINER RPCs should explicitly revoke PUBLIC execution

- **Severity:** Medium
- **Evidence:** Officer onboarding/removal/deletion RPC migrations grant execution to `authenticated` but do not explicitly revoke execution from `PUBLIC` first, including `20260821_officer_onboarding_staff_profile_rpc.sql`, `20260821_officer_onboarding_establishment_rpc.sql`, `20260821_delete_establishment_with_staff_rpc.sql`, and `20260821_remove_officer_user_rpc.sql`.
- **Impact:** Current function-body officer checks may block anonymous changes, but unnecessary public exposure increases risk if a future guard is weakened.
- **Recommended remediation:** `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated` before granting only the intended role. Retain in-function authorization checks.

### AUD-021 — Credential-named QA artifact exists in the workspace

- **Severity:** High
- **Evidence:** Independent static review identified `.hermes/qa/dummy-account-credentials-20261007.json`. Its contents were intentionally not opened or printed.
- **Impact:** Credential artifacts can be accidentally committed, backed up, or consumed by tooling. If any value was valid, it may require rotation.
- **Recommended remediation:** Remove credential material from the workspace, rotate any potentially valid credentials, add a specific ignore rule, and use environment-managed test secrets. Scan history and CI artifacts without exposing values.

### AUD-022 — Several custom modals lack complete dialog accessibility

- **Severity:** High
- **Evidence:** `src/app/pages/officer/Establishments.tsx:1251-1500` and `src/app/pages/Login.tsx:313-421` contain overlays without consistent `role="dialog"`, `aria-modal`, Escape dismissal, focus trapping, or focus restoration. `src/app/components/vista/EstablishmentPerformanceDashboard.tsx:110` has dialog semantics but no focus-management hook.
- **Impact:** Keyboard and screen-reader users can tab behind dialogs and may not be able to dismiss or return focus reliably.
- **Recommended remediation:** Standardize on the existing Radix dialog primitives or `useDialogFocus` hook, with labelled dialogs, Escape, focus trap, and focus restoration.

### AUD-023 — Performance ranking rows and sort control are pointer-only

- **Severity:** High
- **Evidence:** `src/app/components/vista/EstablishmentPerformanceDashboard.tsx:105` uses row/header `onClick` handlers without native buttons/links, keyboard handlers, tabindex, or sort semantics.
- **Impact:** Keyboard users cannot open establishment details or change visitor sorting.
- **Recommended remediation:** Use a button/link inside each row or add complete keyboard semantics; expose sort state with a real button and `aria-sort`.

### AUD-024 — Several visible form labels are not programmatically associated

- **Severity:** High
- **Evidence:** `src/app/pages/staff/SubmitVisitorReport.tsx:398-403`, `src/app/pages/staff/SubmitAccommodationReport.tsx:918-923`, and multiple `Establishments.tsx` modal fields place labels beside inputs without matching `htmlFor`/`id` associations.
- **Impact:** Assistive technology may announce controls without their intended labels once placeholders disappear.
- **Recommended remediation:** Add stable IDs and `htmlFor`, or wrap each control in its label. Add automated accessible-name assertions.

### AUD-025 — Accommodation entry blocks copy, paste, selection, and context menus

- **Severity:** Medium
- **Evidence:** `src/app/pages/staff/SubmitAccommodationReport.tsx:1006-1024` calls `preventDefault()` for copy/cut/select/context-menu/drag and applies `user-select: none`.
- **Impact:** Users cannot copy or correct values using standard keyboard and touch workflows; this provides no meaningful security benefit.
- **Recommended remediation:** Remove broad interaction blocking. Restrict prevention to the specifically required gesture, if any, while retaining normal text editing and accessibility.

### AUD-026 — Reports trend chart uses a different accommodation metric than the table/export

- **Severity:** High
- **Evidence:** `src/app/pages/officer/Reports.tsx:225-231` maps table rows to `total_check_ins`, but `:336-340` prefers `guest_check_ins` when both fields exist. Shared reporting logic and official export use the combined metric.
- **Impact:** The Reports chart can understate accommodation activity compared with its table, monitoring cards, Analytics, and official workbook.
- **Recommended remediation:** Select one canonical metric and use it consistently, with labels distinguishing check-ins, guest nights, and room usage.

### AUD-027 — Reports aggregates establishments by display name instead of ID

- **Severity:** Medium
- **Evidence:** `src/app/pages/officer/Reports.tsx:211-237` drops `establishment_id`; `:551-560` counts and aggregates by establishment name. Analytics keys by ID at `src/app/pages/officer/Analytics.tsx:275-291`.
- **Impact:** Two establishments with the same name are merged in Reports but kept separate in Analytics.
- **Recommended remediation:** Preserve and aggregate by canonical establishment ID, using name only for display.

### AUD-028 — Reports export directory query is not paginated

- **Severity:** Medium
- **Evidence:** `src/app/pages/officer/Reports.tsx:426-433` performs a separate establishments query without pagination, unlike the page-state query and monitoring export helper.
- **Impact:** At provider response limits, establishments—especially no-report establishments expected in the workbook—can be omitted.
- **Recommended remediation:** Reuse a paginated directory helper and verify exports with a directory over 1,000 rows.

### AUD-029 — Mobile tables and custom scroll owners are difficult to operate

- **Severity:** Medium
- **Evidence:** `src/app/components/EstablishmentSubmissionRecords.tsx:217-225`, `src/app/pages/officer/VisitorMonitoring.tsx:291-293,385-398`, and `src/app/components/vista/EstablishmentPerformanceDashboard.tsx:105` use large minimum widths, nested overflow, and `touch-none`.
- **Impact:** Phone users must perform two-axis scrolling in constrained regions, and nested scroll owners can make swipe direction unpredictable.
- **Recommended remediation:** Apply one dominant-axis scroll controller per table, reduce mobile minimum widths, and verify on real Android/iOS devices.

### AUD-030 — Production bundle is oversized

- **Severity:** Low
- **Evidence:** `npm run build` emitted a minified JavaScript chunk of approximately 2.5 MB and warned that chunks exceed the 500 KB threshold.
- **Impact:** Slow mobile networks may delay first interaction and make the portal appear unresponsive.
- **Recommended remediation:** Split route-level code with dynamic imports and separate heavy export/chart dependencies.
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