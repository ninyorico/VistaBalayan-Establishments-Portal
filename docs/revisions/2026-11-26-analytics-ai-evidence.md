# Analytics AI Evidence and Recommendation Revision

Date: 2026-11-26

## Scope

This revision keeps AI findings in one unified Analytics section while connecting unusual periods to the source trend chart and preventing unsupported or redundant recommendations from being shown.

## Implemented

- Added deterministic one-to-one recommendation assignment between anomaly cards and AI recommendations.
- Required linked recommendations to declare the same metric as the anomaly.
- Prevented one recommendation from being attached to multiple anomaly cards.
- Removed linked recommendations from standalone recommendation cards.
- Collapsed duplicate standalone recommendation actions.
- Excluded generic fallback actions such as `Review this trend and take one focused action.`
- Rejected recommendation text containing unsupported causal claims such as weather, events, or guaranteed outcomes.
- Used the deterministic anomaly recommendation as the fallback when an AI action is not evidence-bound.
- Added red markers to the visitor and overnight guest-check-in trend series for verified unusual decline periods.
- Added a link from each anomaly card back to the unified trend chart.
- Corrected the AI section count to count visible cards instead of raw linked database rows.

## Evidence basis

The existing deterministic anomaly snapshot remains authoritative for metric, current period, previous period, values, percentage change, reporting coverage, missing reports, late reports, threshold, and rule version. AI wording does not replace those calculations.

## Files

- `src/app/pages/officer/Analytics.tsx`
- `src/lib/aiRecommendationIntegrity.ts`
- `src/lib/aiRecommendationIntegrity.test.ts`

## Verification

- `npm test`: 11 test files, 45 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

Build warnings remain non-blocking: stale Browserslist data, empty `src/styles/fonts.css`, and existing large bundle-size warnings.

## Remaining scope

This revision does not implement public-site verified rating accounts, entrance-fee verification, or a multi-indicator establishment-quality score because those flows are not contained in the audited authenticated portal implementation. They require a separate public-site/data-governance scope and must not be fabricated in this repository.

## Follow-up layout revision

- Removed the `Compare with` control from the Tourism intelligence hero.
- Removed the redundant outer Establishment performance filter card.
- Kept the establishment performance reporting-period control inside the Tourism Establishment Performance Dashboard card.
- Moved the unified AI findings section directly below the tourism trend chart so anomaly evidence, AI findings, and recommendations appear together before origins and performance panels.
- Preserved the single unified AI section; AI cards are not embedded separately inside every chart.

Verification for this follow-up:

- `npm test`: 11 test files, 45 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
