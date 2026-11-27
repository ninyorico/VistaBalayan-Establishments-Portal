# VistaBalayan Revision Implementation Progress

Source of truth: `REVISION_PLAN.md`

Status values: `TODO`, `IN PROGRESS`, `BLOCKED`, `DONE`, `PARTIAL`

## Rules

- Preserve existing accounts, establishments, reports, ratings, and unrelated functionality.
- Do not expose credentials or secrets.
- Mark a requirement `DONE` only after implementation and relevant verification.
- Record external configuration, policy, or legal dependencies as `BLOCKED` or `PARTIAL`, not as completed.

## GOAL 1 — Public authentication, verified feedback, ratings, reviews

- [PARTIAL] 1.7 Public user registration and authentication: client entry points exist for email/password, verification, sign-in/out, recovery, and Google OAuth; Google provider configuration remains external.
- [PARTIAL] 1.7 Separate public-user role and administrative isolation: profile/RLS structures exist; full live role-isolation test matrix remains.
- [PARTIAL] 1.8 Verified-account enforcement for review writes: client and RPC checks exist and migration was read back; negative authenticated live-flow tests remain.
- [PARTIAL] 1.9 Review schema, validation, ownership, display name, rating, dates, moderation status: implemented and read back; full edit/delete live-flow tests remain.
- [PARTIAL] 1.10 One active review per user/establishment, ownership protection, rate limits, suspicious submission safeguards, self-rating prevention: uniqueness, ownership, a five-per-24-hour backend limit, repeated-text flagging, and self-rating checks are implemented; broader abuse detection remains.
- [PARTIAL] 1.11 Officer moderation workflow, statuses, reasons, audit trail: existing moderation plus migration audit contract is present; full live action verification remains.
- [PARTIAL] 1.12 Public profile rating summaries, review list, verified indicator, sign-in return flow: implemented in public UI; live browser verification remains.
- [DONE] 1.13 Deterministic rating calculations and recalculation after changes.
- [PARTIAL] 1.14 Ratings as secondary recommendation sorting without overriding preferences: public directory now supports opt-in highest-rating, most-reviewed, and name sorting while preserving personalized recommendation order; live browser verification remains.
- [PARTIAL] 1.15 Public profile management, own-review management, privacy notices, account removal path: UI and request path exist; retention/erasure workflow requires policy approval.


## GOAL 3 — Performance scoring and ranking

- [DONE] 3.14 Eligible customer-feedback indicators and recurring themes: eligibility, average, positive percentage, satisfaction, count, and deterministic published-comment themes are implemented; theme output is descriptive rather than causal.
- [PARTIAL] 3.15 Review sufficiency and ranking eligibility rules.
- [DONE] 3.16 Customer satisfaction score formula and reliability indicators.
- [PARTIAL] 3.17 Versioned expanded performance models with approval/configuration state: proposed versioned models exist; approval persistence remains.
- [DONE] 3.18 Officer performance dashboard filters, rankings, distinction between rating and composite score.

## GOAL 4 — Review/rating anomaly detection

- [DONE] 4.8 Deterministic suspicious review/rating pattern detection and human-review flags.
- [DONE] 4.8 Detection methodology and limitations documentation.

## GOAL 5 — Customer-feedback AI insights

- [DONE] 5.8 Verified/eligible feedback in AI input: server-generated AI now receives aggregate rating summaries, eligible-comment counts, and aggregate theme counts through scoped, paginated, eligibility-filtered evidence; raw comments and private identifiers are excluded.
- [DONE] 5.8 Rating, volume, satisfaction, theme, and insufficient-data findings: rating/volume/satisfaction/insufficient-data aggregates and deterministic theme counts are included in scoped server AI evidence; model output remains subject to normalization and human validation.
- [DONE] 5.8 Privacy-safe AI payload with no reviewer private identifiers in the Analytics feedback finding.

## GOAL 6 — Customer-feedback decision support

- [DONE] 6.11 Actionable feedback-based recommendations for high-volume/low-satisfaction, low-volume/high-satisfaction, declining satisfaction, positive feedback, and insufficient feedback: deterministic segment classification, period-aware satisfaction comparison, advisory action templates, and server-generated scoped AI delivery now exist; human validation remains required.
- [DONE] 6.11 Evidence-bound actions with responsible role, timeframe, measurable outcome, and advisory labeling.

## GOAL 7 — Evidence-aware AI recommendation enhancement

- [DONE] Coverage-aware deterministic strategy selection: low coverage prioritizes validation; high-coverage substantial declines produce diagnostic assessment, conditional strategic intervention, and outcome evaluation.
- [DONE] High-coverage establishment decline behavior: zero missing reports no longer produces missing-report follow-up as the primary action; establishment-specific historical, peer, recovery, and evaluation actions are available where evidence supports them.
- [DONE] Evidence-conditioned strategy selection: eligible feedback concerns, comparable-establishment declines, recurring seasonal declines, and verified temporary closures select different advisory strategy families; unsupported causes remain unasserted.
- [DONE] Deterministic server fallback and Gemini guard: missing/unavailable Gemini or reporting-only high-coverage output uses the verified deterministic strategy plan; cache rule version advanced to `decision-support-v9`.
- [DONE] Establishment-account action rendering: structured scoped action plans now render with prerequisites, responsible role, timeframe, decision implication, and measurable indicators.
- [DONE] Fresh live verification of the updated high-coverage establishment card and establishment-account action rendering: production deployment `dpl_BRhJRNYYQwPaPtNk7HnoN78MND5t` served `[TEST FIXTURE] Balayan Sunset Cove Resort` at `/staff/analytics`; the authenticated page displayed the scoped demand assessment, targeted recovery assistance, structured prerequisites, responsible role, timeframe, success indicators, and evidence-bound decision implication.

## GOAL 8 — Security and reliability

- [PARTIAL] Supabase authentication, OAuth, verification, recovery, and secure sessions: repository and migration paths exist; Google provider and live negative tests remain.
- [PARTIAL] RLS, role isolation, review ownership, duplicate constraints, backend validation: read-back confirms RLS, ownership RPCs, and unique index; full authorization matrix remains.
- [PARTIAL] Content safety, rate limiting, moderation audit records, privacy protection, account removal/retention path: audit/profile/request structures, rate limiting, repeated-text detection, and moderation anomaly flags exist; retention and broader content detection remain.

## GOAL 9 — Testing and validation

- [PARTIAL] Public authentication test matrix.
- [PARTIAL] Review authorization, validation, duplicate, ownership, moderation, privacy, and calculation tests: deterministic anomaly and metric tests pass; live authorization and moderation tests remain.
- [DONE] Performance and customer-feedback integration tests.
- [PARTIAL] Live authenticated browser and database read-back verification: database read-back is complete; authenticated browser verification remains.
- [DONE] Documentation of actual results and limitations.

## Cross-cutting documentation

- [DONE] Architecture and data-flow documentation.
- [DONE] Database migration/RLS/RPC documentation.
- [DONE] Moderation policy and anomaly methodology.
- [DONE] Performance model versioning and limitations.
- [DONE] Testing results and unresolved external configuration/legal items.

## Current audit

- [DONE] Inspect repository structure, public application ownership, existing review/auth schema, routes, and Supabase migrations.
- [DONE] Add and test deterministic rating metrics helper for average, positive percentage, distribution, satisfaction score, and insufficient/no-feedback states.
- [DONE] Add and test versioned proposed customer-feedback performance scoring models.
- [DONE] Apply and read back the verified public-review database contract and security migration; migration `202611270002` is present in linked history.
- [DONE] Apply and read back period-aware feedback summary migration `202611270005`; monthly satisfaction view columns and linked migration history verified.
- [DONE] Add public account route and client authentication entry points for email/password, Google OAuth, recovery, sign-out, and verified-review gating.
- [DONE] Add public account review management and account-removal request UI.
- [DONE] Add officer Analytics customer-feedback indicators, sorting, chart-local evidence-bound finding, aggregate recurring themes, period-aware satisfaction comparison, and segment-specific advisory actions.
- [DONE] Remove feedback-query row caps by paging review and period-summary views until completion; portal validation remains green.
- [DONE] Add officer moderation anomaly metadata migration and human-review flag display.
- [DONE] Verify portal: 15 test files / 62 tests, TypeScript, production build, and diff check.
- [DONE] Verify public portal: 7 rating, metric, and directory-sort tests, production build, and diff check.
- [PARTIAL/BLOCKED] Backend rate limiting and repetitive-submission detection are implemented and migration-backed. Live verification completed for five labeled fixture establishment-staff accounts: each authenticated to `/staff/submit-visitor-report`, displayed its fixture data, was redirected from `/officer/analytics` and `/officer/review-moderation` to `/staff`, and logged out to `/admin/login`. Canonical production smoke checks also passed for `https://portal-vistabalayan.vercel.app` and `https://explore-vistabalayan.vercel.app`; the public site rendered anonymous listings, sorting, nearest-picks, and cookie-consent controls, while the portal rendered its login and consent controls. Officer-account, review mutation, moderation-action, and full negative authorization verification remain pending because the fixture batch contains no successful officer account.
