# Panel system-revision status

Updated after auditing the current production repositories and implementing the safe, source-backed changes in this revision.

## Already implemented

- Recommendation explanations for public establishments.
- Search history, viewed establishments, category signals, and proximity in public recommendation ranking.
- Review reporting and moderation support.
- Officer recent and seasonal tourism charts.
- Deterministic abnormal visitor-drop/anomaly records and officer anomaly display.
- Separate visitor-volume classification using percentile thresholds.

## Implemented in this revision

- Active AI anomalies and AI-assisted recommended actions now appear directly inside the officer Analytics module beside the charts and statistics.
- The establishment classification module is explicitly labelled as visitor-volume classification, not an overall quality or performance ranking.
- The classification code documents the methodological boundary: no combined performance score is claimed without approved ratings, accreditation, compliance, growth, and visitor-experience inputs.

## Still requiring approved data/schema and workflow decisions

- Verified public accounts before submitting ratings. The current public RPC uses anonymous visitor tokens, so this cannot be safely changed in the UI alone without an approved public authentication flow and an RLS/RPC migration.
- Explicit public preference capture beyond category selection, including preference taxonomy and consent/storage policy.
- Municipal Tourism Office entrance-fee verification workflow and authoritative fee fields. No such schema or workflow exists in the audited source.
- A justified multi-indicator establishment-performance score. The current system correctly keeps visitor volume separate; ratings, accreditation, compliance, growth, and visitor-experience measures need approved definitions and weights before implementation.
- Research-objective mapping and final manuscript edits. These belong in the manuscript/research deliverable, not in application runtime code.

## Verification boundary

This document records source-code status. It does not claim that Supabase migrations have been applied to production or that the live Vercel deployment has updated until those deployment and live-behavior checks are run.
