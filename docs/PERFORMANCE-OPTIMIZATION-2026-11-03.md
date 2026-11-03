# VistaBalayan Performance Optimization Report

Date: 2026-11-03

## Scope

This report records the first measured optimization pass based on the supplied full-system performance specification. The work was limited to backward-compatible frontend loading and selective read-payload reductions. No production records, database schema, policies, indexes, storage objects, or deployment configuration were changed.

## Baseline

The baseline was produced with `npm run build` from the repository working tree before the performance changes.

- Initial JavaScript entry: 2,706.25 KB minified / 751.92 KB gzip
- Initial CSS entry: 161.73 KB minified / 29.19 KB gzip
- Build completed successfully in 27.21 seconds
- Vercel production HTML: HTTP 200, `X-Vercel-Cache: HIT`, `Cache-Control: public, max-age=0, must-revalidate`
- Production JavaScript asset: HTTP 200, `X-Vercel-Cache: HIT`, content length approximately 2.7 MB
- Existing untracked files were preserved and not staged or edited

The baseline confirms that the initial JavaScript payload, not the CSS payload, was the primary identified frontend bottleneck.

## Implemented changes

### 1. Route-based code splitting

Officer and staff page modules are now loaded through React Router route `lazy` modules instead of being imported into the initial route module. Authentication, role checks, active-staff checks, redirects, and route paths were preserved.

### 2. Dynamic heavy-library loading

- `exceljs` is loaded only when an Excel workbook export function is invoked.
- `docx-preview` is loaded only when a DOCX permit preview is opened.
- Type-only ExcelJS imports remain available for compile-time types without adding the runtime library to the initial entry.

### 3. Explicit read columns

Broad `select('*')` reads were reduced in these paths:

- Authenticated profile loading
- Officer establishment directory
- Officer user directory
- Staff manage-listing establishment loading
- Staff profile loading

Report review/export queries that intentionally require detailed report payloads were not changed speculatively.

## After measurement

The after-build was produced with `npm run build` after the changes.

- Initial JavaScript entry: 617.93 KB minified / 180.10 KB gzip
- Initial CSS entry: 146.70 KB minified / 22.73 KB gzip
- Build completed successfully in 28.20 seconds
- ExcelJS became a separate 940.03 KB / 271.24 KB gzip chunk
- DOCX preview became a separate 174.66 KB / 51.46 KB gzip chunk
- The largest remaining initial entry was 617.93 KB / 180.10 KB gzip

Compared with the baseline initial entry:

- JavaScript minified reduction: 2,088.32 KB (77.2%)
- JavaScript gzip reduction: 571.82 KB (76.0%)
- CSS minified reduction: 15.03 KB (9.3%)
- CSS gzip reduction: 6.46 KB (22.1%)

These are build-payload measurements, not claims about end-user LCP, INP, database latency, or overall application speed. Browser Web Vitals and authenticated route timings still require a controlled browser measurement matrix.

## Verification performed

- `npx tsc --noEmit` — passed
- `npm test -- --run` — passed: 6 test files, 25 tests
- `npm run build` — passed
- `git diff --check` — passed
- Local Vite `/admin/login` smoke request — HTTP 200; document title `VistaBalayan`
- Production read-only header check — HTTP 200 with existing Vercel edge-cache headers

## Not implemented in this pass

The following remain intentionally blocked or require further evidence/approval:

- Database indexes or migrations
- SQL views, RPCs, materialized views, or summary tables
- Production query-plan inspection that could expose sensitive operational data
- Authenticated browser Web Vitals and route timing matrix
- Server-side analytics aggregation
- Application-level caching of authenticated data
- Production load testing or concurrency testing
- Vercel deployment, Git push, or production rollout

The existing Vercel static-asset CDN behavior remains in place. No service-worker or authenticated-data cache was added.

## Remaining risks and next gates

1. Explicit column lists must be checked against the deployed schema during authenticated verification; the local build cannot prove remote schema compatibility.
2. The remaining initial entry is still above Vite's warning threshold because shared UI/runtime dependencies remain in the core bundle.
3. Report screens still load detailed date-scoped pages in the browser. Further pagination or aggregation changes require hand-checkable report fixtures and equivalence tests.
4. Any index or aggregation proposal requires read-only schema/index/query-plan inspection first and explicit approval before migration.
5. No production deployment should be inferred from this local result.

## Phase 3 database inspection

### Static migration findings

The repository migrations already define these important report indexes:

- Visitor reports: `(status, created_at desc)`
- Visitor reports: `(establishment_id, status, report_date desc)`
- Visitor reports: `(report_date desc)`
- Visitor reports: `(report_date, status, establishment_id)`
- Accommodation reports: `(status, created_at desc)`
- Accommodation reports: `(establishment_id, status, report_date desc)`
- Accommodation reports: `(report_date desc)`
- Accommodation reports: `(report_date, status, establishment_id)`
- Accommodation daily active-record uniqueness: partial unique index on `(establishment_id, report_date)`
- AI cache: `(establishment_id, generated_at desc)`
- Accommodation idempotency: partial unique index on `(establishment_id, submission_idempotency_key)`

The source query audit found that visitor monitoring, accommodation monitoring, report review, and notification queries already use date/status/establishment filters and explicit ranges or limits in their main read paths. This means adding duplicate report indexes without live query-plan evidence would be unjustified.

The most likely remaining database candidates are:

1. Verify whether `room_occupancy_details(accommodation_report_id)` has an index; policy and form reads join/filter through that parent key.
2. Verify whether `profiles(establishment_id)` is indexed; staff-scope lookups and authorization joins use this relationship.
3. Verify whether the active report indexes are actually present in the linked database and not only in repository migrations.
4. Compare report query plans for date-scoped monitoring and officer review before considering any new composite index.
5. Measure report row counts and payload sizes before proposing server-side aggregation or pagination changes.

These are candidates only. No index migration was created or applied.

### Authorization and RLS review

The migration history shows later status-aware policies that separate read scope from active-write scope:

- Inactive staff retain scoped reads for profiles, establishments, reports, room details, and cached AI records.
- Active status is required for staff writes.
- Municipal officers retain privileged read/review access.
- Room-detail access is constrained through the parent accommodation report.
- AI cache reads are establishment-scoped for staff and officer-scoped for municipal officers.

This authorization design must be preserved when evaluating aggregation, caching, or RPCs. Any server-side summary must derive scope from the authenticated session and must not accept a client-controlled establishment ID as the authorization boundary.

### Live inspection blocker

The Supabase CLI could not reach linked metadata in this checkout:

- `supabase migration list --linked` fails before connection because `.env` contains a variable name with `&`, which the CLI dotenv parser rejects.
- `supabase db query --linked` was checked, but the installed CLI uses positional SQL rather than the attempted `--sql` flag.
- Running with `--workdir supabase` cannot find a linked project reference because this checkout has no `supabase/config.toml`.

No workaround was used that would rename, rewrite, print, or expose environment values. Therefore live index existence, effective `pg_policies`, grants, row counts, and `EXPLAIN` plans remain unverified. The next database action requires either a correctly linked Supabase CLI workspace or an approved read-only SQL access path.

## Phase 3 conclusion

The static evidence does not justify adding indexes yet. Existing migrations already cover the principal report filter combinations. The correct next step is to restore a safe read-only metadata path, then verify actual indexes and query plans before preparing any migration. No production data or schema was changed during this phase.

## Authenticated read-only verification

Credentials were read from `.env` in memory only. Values, tokens, emails, and private row contents were not printed or persisted. Each account used a fresh isolated browser context against `https://portal-vistabalayan.vercel.app`. No form was submitted and no save, upload, delete, review, or update action was performed.

### Account route results

- `VISTABALAYAN_OFFICER_EMAIL`: authenticated to `/officer`; officer dashboard, establishments, report monitoring, reports, analytics, and AI insights routes settled on their requested routes. No browser console errors were observed.
- `VISTABALAYAN_overnight_EMAIL`: authenticated to `/staff/submit-accommodation-report`; staff dashboard, submission history, analytics, AI insights, profile, and accommodation form loaded. Visitor-form navigation was redirected away.
- `VISTABALAYAN_daytour_EMAIL`: authenticated to `/staff/submit-visitor-report`; staff dashboard, submission history, analytics, AI insights, profile, and visitor form loaded. Direct accommodation-form navigation settled on `/staff`, matching the capability guard. One transient `ERR_NETWORK_CHANGED` occurred during a retry and one CSS request failed during that run; the account and route checks still completed.
- `VISTABALAYAN_both_form_charisort_EMAIL`: authenticated to `/staff`; both visitor and accommodation form routes loaded.
- `VISTABALAYAN_daytour_and_overnight_EMAIL`: authenticated to `/staff`; both visitor and accommodation form routes loaded.

### Scoped live read evidence

The browser session queried only `id` with exact-count headers. Results were recorded as counts, not row contents:

- Municipal officer scope: 39 profiles, 38 establishments, 2,397 visitor reports, 1,796 accommodation reports, 6,133 room-detail rows, and 69 AI-cache rows.
- Overnight staff scope: 1 profile, 30 establishments returned by the current policy/query path, 0 visitor reports, 103 accommodation reports, 40 room-detail rows, and 2 AI-cache rows.
- Day-tour staff scope: 1 profile, 30 establishments returned by the current policy/query path, 306 visitor reports, 0 accommodation reports, 0 room-detail rows, and 3 AI-cache rows.
- Both-form Charisort scope: 1 profile, 30 establishments returned by the current policy/query path, 49 visitor reports, 24 accommodation reports, 386 room-detail rows, and 26 AI-cache rows.
- Dual-form staff scope: 1 profile, 30 establishments returned by the current policy/query path, 306 visitor reports, 103 accommodation reports, 40 room-detail rows, and 2 AI-cache rows.

These counts are evidence of scoped authenticated reads, not proof that the current data-cache or index design is optimal. The `HEAD` probes used for counts appear as failed requests in browser instrumentation because the application/API path does not treat those probes as normal application requests; they were separate read-only diagnostics.

### Verification conclusion

Authentication, role routing, report-form capability guards, and scoped read access were exercised successfully for all configured accounts. The account matrix did not create or modify production data. Live `pg_indexes`, `pg_policies`, grants, and `EXPLAIN` plans remain blocked by the Supabase CLI linking/dotenv issue documented above.

## Phase 4 analytics and dashboard optimization

### Implemented

- Officer Analytics now fetches the establishment directory, visitor reports, and accommodation reports concurrently with `Promise.all`.
- Officer Dashboard now fetches recent visitor and accommodation submissions concurrently.
- Officer Dashboard establishment counting now selects only `id` while using `count: exact` and `head: true`; it no longer requests every establishment column for a count-only operation.
- Staff Dashboard profile loading now selects only `id`, `establishment_id`, and `status`, which are the fields used by the dashboard.

All existing report status filters, date ranges, aggregation formulas, role scopes, and UI calculations were preserved. No server-side aggregate, cache, RPC, view, or migration was introduced.

### Evidence and limitations

The authenticated read-only matrix established the current scoped dataset sizes and confirmed that officer and staff analytics paths can read their expected data. The local build and tests confirm the new request orchestration compiles and preserves the existing unit-test suite.

A production before/after latency measurement is not available because the Phase 4 code has not been deployed, and aggressive production load testing is prohibited. Therefore this phase is a measured implementation change, not a claimed percentage improvement in dashboard load time. A deployed preview or approved environment is required to compare request waterfall and route timing metrics.

### Phase 4 verification

- `npx tsc --noEmit` — passed
- `npm test -- --run` — passed: 6 test files, 25 tests
- `npm run build` — passed in 23.54 seconds
- `git diff --check` — passed
- Initial JavaScript bundle remained approximately 618.01 KB minified / 180.17 KB gzip, consistent with this phase changing request sequencing rather than bundle composition

The next evidence-based opportunities are server-side aggregation or pagination for officer-wide historical analytics, but those require live query plans, hand-checkable calculation fixtures, and explicit approval before schema/RPC changes.

## Phase 5 scalability and caching assessment

### Current caching findings

- Vercel already serves static hashed assets through its edge cache; the production CSS and JavaScript asset checks returned `X-Vercel-Cache: HIT`.
- HTML remains configured for revalidation with `Cache-Control: public, max-age=0, must-revalidate`.
- `public/sw.js` handles push notifications and notification clicks only. It has no `fetch` handler and does not use Cache Storage.
- No React Query, SWR, Redis, custom response cache, or server-side analytics cache is present.
- `localStorage` is used for scoped drafts, consent, notification state, and form preferences. It is not a server-response cache.

No authenticated report, permit, profile, analytics, or AI response was cached. This is the correct safe default until cache keys, authorization scope, freshness, write invalidation, and logout behavior are defined and tested.

### Bounded local scalability measurement

A temporary Vitest benchmark exercised the existing `buildVisitorHistoricalSeries` and `buildAccommodationHistoricalSeries` helpers with synthetic in-memory records. It was removed after the run and was not committed.

- 1,000 records: visitor 20.15 ms; accommodation 2.21 ms
- 10,000 records: visitor 3.01 ms; accommodation 5.56 ms
- 100,000 records: visitor 15.97 ms; accommodation 20.84 ms
- 500,000 records: visitor 96.92 ms; accommodation 113.13 ms

Every run produced the expected 12 monthly output entries. These are local CPU measurements, not production network or database benchmarks. They do not justify aggressive production load testing or a claim about end-user dashboard latency.

### Phase 5 conclusion

No code change was justified for caching or synthetic aggregation optimization in this phase:

- Static asset CDN behavior is already provided by Vercel.
- Authenticated data is tenant- and role-scoped and must not enter a shared browser/service-worker cache without a complete invalidation design.
- Existing pure aggregation helpers scale linearly through 500,000 synthetic records in the bounded local test.
- Production concurrency testing remains prohibited without a separate test environment and explicit approval.

Remaining scalability blockers are live query-plan access, a safe non-production dataset for database benchmarks, and an approved definition of acceptable staleness for any future analytics cache.
