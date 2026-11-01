# VistaBalayan Entire-System Audit Report

**Audit date:** 2026-11-02 (PHT)  
**Target:** `https://portal-vistabalayan.vercel.app`  
**Authenticated account:** local `.env` Charisort both-form staff account (credential values intentionally omitted)  
**Audit mode:** Read-only; no report, profile, listing, room, password, notification, or database writes were performed.

## Executive summary

The live Charisort staff portal is reachable and its principal staff routes loaded successfully. The authenticated browser sweep found no JavaScript console errors, uncaught page exceptions, or failed network requests across the tested routes. Role isolation also worked: navigating directly to the officer reports route redirected the staff account back to `/staff`.

The main risks found are:

1. **Accessibility defects:** automated axe testing found serious color-contrast violations on every tested staff route, critical unlabeled form controls on the visitor report, accommodation report, and profile pages, a serious keyboard-focus issue on submission-history scrollable regions, and serious missing alternative text for SVG image-role elements on staff analytics.
2. **Dependency vulnerabilities:** `npm audit --omit=dev` reported **2 high** and **9 moderate** vulnerabilities in production dependencies/transitive packages. The most important affected chains include `react-router`, `brace-expansion`, `minimatch`, `uuid`, and `exceljs`/`archiver`.
3. **Audit coverage limits:** this was an authenticated Charisort staff audit using Chrome automation. It did not certify physical-device behavior, screen-reader behavior, officer workflows under an officer account, or every state-changing workflow. Production data was intentionally not modified.

## Scope and method

### Live authenticated routes tested

- `/staff`
- `/staff/submit-visitor-report`
- `/staff/submit-accommodation-report`
- `/staff/submission-history`
- `/staff/analytics`
- `/staff/ai-insights`
- `/staff/manage-listing`
- `/staff/profile`
- Direct access attempt: `/officer/reports`

### Live checks performed

- Fresh login using the local `.env` Charisort account.
- Route navigation and final-route verification.
- Page title, heading, button, and input presence checks.
- Browser console error collection.
- Uncaught page-error collection.
- Failed network-request collection.
- AI Insights refresh click and API response verification.
- Day-tour November 2 retrieval verification from the authenticated Charisort account.
- Direct staff-to-officer route authorization check.
- Unauthenticated AI API request check.
- Automated axe WCAG 2A/2AA scan at a 390×844 viewport.

### Static checks performed

- `git diff --check`
- `npx tsc --noEmit`
- `npm test -- --run`
- `npm run build`
- `npm audit --omit=dev`
- Source scans for dangerous DOM/evaluation sinks and tracked secret-like files.
- Repository status review to distinguish existing untracked artifacts from audit changes.

## Verified passes

### Build and tests

- TypeScript type-check: **passed**
- Unit tests: **6 test files, 25 tests passed**
- Production Vite build: **passed**
- Git diff check: **passed**

The production build emitted existing non-blocking warnings:

- `src/styles/fonts.css` is empty.
- Browserslist data is stale.
- The main JavaScript chunk is approximately 2.52 MB before gzip and triggers Vite’s chunk-size warning.

### Authenticated staff route sweep

All listed staff routes loaded with:

- No console errors.
- No uncaught page exceptions.
- No failed network requests.
- Expected staff navigation and route content.

The Charisort account displayed both Day-tour and Accommodation workflows, matching its configured combined reporting capability.

### Role isolation

A direct navigation from the authenticated staff session to `/officer/reports` ended at `/staff`. The staff account was not granted the officer route.

### AI Insights

The Charisort AI Insights refresh flow was exercised live:

- Refresh button enabled.
- Button changed to `Refreshing` during the request.
- `POST /api/generate-insights` returned HTTP `200`.
- Response contained generated insights and anomalies.
- The Last Updated timestamp changed.
- The timestamp was subsequently corrected to Philippine time in commit `34b6ea4` and verified live as `Nov 2, 2026, 1:37 AM PHT` for the corresponding UTC cache value.

An unauthenticated request to `/api/generate-insights` returned HTTP `401` with `Authentication required`.

### Day-tour November 2 retrieval

The authenticated Charisort account returned the six November 2 source rows and restored them as two visitor groups:

- Group totals: 12 and 10.
- Total visitors: 22.

The legacy unnamed-group reconstruction fix is deployed in commit `e889cfc`.

### Static security scan

The source scan found:

- No `eval`, `new Function`, `document.write`, or direct `innerHTML` use in application source.
- One `dangerouslySetInnerHTML` use in `src/app/components/ui/chart.tsx`; this is used for generated chart styling and should remain restricted to trusted internal configuration.
- No tracked private-key files or tracked real `.env` file.
- `.env.example` is tracked as expected; the real `.env` remains local and was not included in this report.

## Findings

### F-001 — Critical: unlabeled form controls

**Category:** Accessibility / Forms  
**Severity:** Critical axe impact  
**Status:** Open

Axe reported the `label` rule with critical impact on:

- `/staff/submit-visitor-report`: 2 nodes
- `/staff/submit-accommodation-report`: 2 nodes
- `/staff/profile`: 5 nodes

**Risk:** Screen-reader users may not know what a control edits, particularly in dense reporting forms. This can cause incorrect data entry even when sighted users can infer the meaning visually.

**Recommended remediation:**

- Give every input, date field, numeric field, map/listing field, and profile field a programmatic label.
- Use explicit `htmlFor`/`id` associations or a correctly scoped label wrapper.
- Preserve visible labels; do not solve this only with placeholder text or ARIA labels.
- Add automated assertions for accessible names on representative repeated controls.

### F-002 — High: serious color-contrast failures

**Category:** Accessibility / Visual readability  
**Severity:** Serious axe impact  
**Status:** Open

The `color-contrast` rule reported serious violations on every tested staff route:

- Dashboard: 28 nodes
- Day-tour form: 9 nodes
- Accommodation form: 5 nodes
- Submission history: 5 nodes
- Analytics: 12 nodes
- AI Insights: 33 nodes
- Manage listing: 1 node
- Profile: 2 nodes

**Risk:** Users with low vision or color-vision differences may be unable to read labels, metadata, statuses, or controls reliably. This is especially important in the neumorphic gray-on-gray design.

**Recommended remediation:**

- Inspect the exact axe nodes and increase text/background contrast while preserving the visual system.
- Prioritize small uppercase metadata, muted labels, button text, table content, and status text.
- Do not rely on shadows or color alone to convey state.
- Re-run axe at mobile and desktop widths after changes.

### F-003 — High: keyboard access for scrollable history regions

**Category:** Accessibility / Keyboard  
**Severity:** Serious axe impact  
**Status:** Open

Axe reported `scrollable-region-focusable` with 2 nodes on `/staff/submission-history`.

**Risk:** Keyboard users may not be able to reach or scroll content that mouse/touch users can access.

**Recommended remediation:**

- Give the actual scroll owner a suitable focus strategy and accessible name.
- Prefer native focusable table/container semantics where appropriate.
- Verify Tab, arrow-key scrolling, and screen-reader announcements.

### F-004 — Medium: SVG image-role elements lack alternative text

**Category:** Accessibility / Analytics  
**Severity:** Serious axe impact  
**Status:** Open

Axe reported `svg-img-alt` with 3 nodes on `/staff/analytics`.

**Risk:** Chart or SVG elements exposed as images may be announced without a useful alternative, preventing non-visual users from understanding the data visualization.

**Recommended remediation:**

- Give informative chart SVGs an accessible name and summary, or mark decorative SVGs as hidden.
- Provide nearby text summaries for key chart conclusions and exact values.

### F-005 — High: production dependency vulnerabilities

**Category:** Dependency / Security  
**Severity:** High  
**Status:** Open

`npm audit --omit=dev` reported:

- **2 high vulnerabilities**
- **9 moderate vulnerabilities**
- **0 critical vulnerabilities**

Relevant dependency chains include:

- `react-router`: advisories include open redirect, route matching denial of service, and other issues across the installed range.
- `brace-expansion`: denial-of-service risks through unbounded expansion/recursion.
- `minimatch`: denial-of-service risk through globparts amplification.
- `uuid`: missing buffer bounds check in affected versions.
- `exceljs` through `archiver` and related packages.
- `glob`, `readdir-glob`, `rimraf`, and `zip-stream` transitive chains.

**Recommended remediation:**

1. Review the lockfile and determine which findings are production-reachable versus export/build-only.
2. Upgrade `react-router` and vulnerable transitive packages to compatible patched versions.
3. Re-run `npm audit --omit=dev`, type-check, tests, build, and authenticated smoke tests.
4. Do not use `npm audit fix --force` blindly; it may introduce breaking framework changes.

### F-006 — Medium: large production JavaScript bundle

**Category:** Performance  
**Severity:** Medium  
**Status:** Open

The Vite build reports a main JavaScript bundle of approximately 2.52 MB before gzip and approximately 698 KB gzip in the recent build.

**Risk:** Slower initial loads on mobile or constrained networks, particularly for staff users opening operational forms.

**Recommended remediation:**

- Add route-level lazy loading for officer/staff pages.
- Split heavy charting, Excel/export, map, and AI-related dependencies.
- Measure Web Vitals on mobile before and after changes.

### F-007 — Low: generated chart styling uses `dangerouslySetInnerHTML`

**Category:** Security / Maintainability  
**Severity:** Low review item  
**Status:** Review recommended

`src/app/components/ui/chart.tsx` uses `dangerouslySetInnerHTML` to inject generated chart CSS.

No user-supplied HTML or general-purpose HTML injection was found in the scan, so this was not classified as an active injection vulnerability. The helper should remain constrained to trusted internal chart configuration.

**Recommended remediation:**

- Keep the input to the style generator limited to static/internal chart configuration.
- Avoid passing listing, report, or profile text into this path.
- Add a narrow unit test or code comment documenting the trust boundary.

## Route-level live results

| Route | Result | Notable evidence |
|---|---|---|
| `/staff` | Passed | Dashboard loaded; no runtime/network errors |
| `/staff/submit-visitor-report` | Passed functionally | Form loaded; no runtime/network errors; November 2 retrieval restored two groups |
| `/staff/submit-accommodation-report` | Passed functionally | Form loaded; room configuration control visible; no runtime/network errors |
| `/staff/submission-history` | Passed functionally | History loaded; axe found contrast and scrollability issues |
| `/staff/analytics` | Passed functionally | Analytics loaded for Charisort; axe found contrast and SVG alternative-text issues |
| `/staff/ai-insights` | Passed functionally | Refresh API returned 200; Philippine timestamp verified |
| `/staff/manage-listing` | Passed functionally | Listing editor loaded; no runtime/network errors |
| `/staff/profile` | Passed functionally | Profile loaded; axe found contrast and label issues |
| `/officer/reports` under staff account | Protected | Redirected to `/staff` |

## Existing untracked files

The audit did not stage, delete, or modify these pre-existing untracked paths:

- `.hermes/`
- `playwright-report/`
- `src/lib/.hermes-tmp.hnk1d1`
- `supabase/.temp/`
- `supabase/migrations/20260922_harden_room_detail_validation.sql`
- `test-results/`

## Limitations and unverified areas

- No production writes were performed. Submit, Save Draft, Save Profile, Publish Listing, Configure Rooms, password changes, exports, and notification state changes were not executed.
- This audit used a fresh automated Chrome session, not a physical Android/iOS device.
- Screen-reader behavior was not tested with NVDA, JAWS, VoiceOver, or TalkBack.
- Officer authenticated workflows were not exercised with an officer credential during this pass.
- The local Playwright-managed browser installation remains unavailable due to the earlier CDN timeout; installed Google Chrome was used instead.
- `pygount` was not available in the environment, so a language/LOC breakdown was not generated.
- Automated axe results are not a complete accessibility certification; manual keyboard and screen-reader verification remains required.
- Dependency audit findings require reachability review and controlled upgrades before remediation claims can be made.

## Priority plan

1. Fix critical form labels on the three affected staff surfaces.
2. Fix the shared contrast palette and re-run axe across staff and officer routes.
3. Fix keyboard access for submission-history scroll containers and chart alternative text.
4. Review and upgrade vulnerable production dependency chains, starting with React Router and brace-expansion.
5. Add route-level code splitting and measure mobile performance.
6. Repeat authenticated officer, physical-device, keyboard-only, and screen-reader audits.

## Audit conclusion

The current deployed staff experience is operationally reachable and the tested core reporting/AI flows function for the Charisort account. It is **not accessibility-clean** and should not be treated as fully production-audited until the critical label defects, serious contrast issues, keyboard scroll access, SVG alternatives, and dependency vulnerabilities are addressed and re-tested.

**No credentials, tokens, private keys, or private report contents are included in this report.**
