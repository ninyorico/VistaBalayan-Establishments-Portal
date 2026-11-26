# VistaBalayan officer-portal revision traceability

Source checklist: `System To do..docx` supplied for this revision.

## Implemented and verified in source

- Officer **Analytics** already contains cached AI anomaly and recommendation cards directly beside the charts and statistics.
- Deterministic visitor-count decline detection remains evidence-backed with current/previous values, thresholds, reporting coverage, missing reports, late reports, and rule versions.
- Visitor-volume classifications remain explicitly separate from establishment quality/performance. The percentile method is documented as a volume classification only.
- Peak-month analytics now select and label the month with the highest **day-tour visitor count**. Day-tour visitors and accommodation guest check-ins are displayed as separate units rather than being added into a misleading combined activity KPI.
- Seasonal charts retain separate visitor and guest-check-in series.

## Limitations documented rather than fabricated

- Existing anomaly generation is primarily municipality-wide month-over-month detection. Establishment-level, spike, and validated multi-year seasonal anomaly rules require approved thresholds and sufficient history.
- A combined establishment performance score is not implemented. A defensible score needs approved indicators, normalization, weights, missing-data policy, validation, and governance approval for ratings, visitor experience, accreditation, compliance, and growth.
- Research-objective reconciliation and final manuscript revisions require the approved research documents/manuscript, which are not in this repository.

## Verification requirements

Every runtime change must pass the portal test suite, production build, whitespace check, and live bundle/browser verification after deployment. The unrelated working-tree modification `scripts/import-historical-tourism-data.mjs` is intentionally preserved outside panel commits.
