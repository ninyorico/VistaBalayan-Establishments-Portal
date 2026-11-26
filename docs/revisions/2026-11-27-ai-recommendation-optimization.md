# AI Recommendation Optimization and Decision Support Revision

## Root causes addressed

- Gemini-supplied confidence was accepted without deterministic coverage enforcement.
- Priority values were not normalized consistently.
- Reports entered after the report date were described as late without an applicable deadline.
- AI refresh generation was not scoped to the active Analytics period.
- Recommendations lost period and evidence metadata during normalization.
- Reporting-compliance actions could be repeated across insight cards.
- Expired AI rows remained eligible in Analytics reads.
- Months with no submitted rows were absent from explicit analysis ranges.
- Action fields could be filled with generic defaults rather than rejected.

## Implemented rules

### Confidence

Coverage confidence is calculated in `src/lib/tourismMetrics.js` and is not taken from Gemini:

- Below 25%: Very Low
- 25% to below 50%: Low
- 50% to below 80%: Moderate
- 80% to 100%: High

When coverage cannot be calculated, the value remains unavailable rather than being assigned an unsupported confidence class.

### Reporting timing

`created_at` later than `report_date` is stored as `entered_after_report_date`. It is not classified as late unless a configured submission deadline is available. The interface uses neutral timing language.

### Period grounding

Analytics refresh sends selected and comparison dates to `/api/generate-insights`. The API validates the dates, filters source report queries to the combined requested range, includes the exact context in the prompt, and persists it in the recommendation snapshot.

### Evidence grounding

The API constructs an allowlisted evidence catalog containing monthly metrics, deterministic anomaly keys, visitor-origin records, and establishment-performance records. Model-provided evidence identifiers are filtered against that catalog before persistence.

### Recommendation quality

Actions without a title, description, responsible entity, timeframe, measurable success indicator, or valid evidence identifier are rejected. Strategic actions under Very Low coverage must remain conditional and require validation. Invented organizational roles are rejected.

### Deduplication

Reporting-completeness objectives are canonicalized as one shared objective across insight cards. Duplicate objectives within a card are removed before persistence.

### Cache invalidation

Generation uses a deterministic key derived from scope, establishment scope, requested period, source-data fingerprint, and decision-support rule version. Cached rows are looked up by this key and expired rows are excluded. Prior active recommendations for the same authorized scope are superseded before a new set is inserted.

### Empty months

When an explicit period is supplied, monthly aggregation initializes every month in the range. Months without submissions retain zero activity and expose expected, submitted, missing, and coverage evidence.

## Verification

- Full Vitest suite: 48 tests passed.
- TypeScript check: passed.
- API syntax check: passed.
- Production build: passed.
- Git diff check: passed.

## Remaining limitations

- The current source schema does not expose an official reporting deadline, so verified late-submission classification remains unavailable.
- Strategic recommendations still require human approval; the system does not assign or track action completion or outcomes.
- A rendered authenticated production screenshot was not available during this revision, so live visual verification remains a separate release gate.
- Existing historical cached rows are not rewritten destructively; they become ineligible through expiry/status rules and are replaced on the next authorized generation.
