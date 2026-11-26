# Chart-specific AI findings and recommendation diversity

## Implemented

- Added verified visitor-origin aggregates and establishment visitor-volume aggregates to the AI generation input.
- Expanded supported recommendation metrics:
  - `visitorOrigins`
  - `establishmentPerformance`
  - existing day-tour, overnight, and seasonal metrics
- Added a separate AI finding block inside:
  - Tourism Trends and Seasonal Patterns
  - Visitor Origins & Actual Growth
  - Tourism Establishment Performance Dashboard
- Added visible Seasonal activity peak markers directly on the seasonal chart for the visitor and guest-check-in series.
- Required municipality AI generation to cover distinct metrics instead of spending multiple insights on the same reporting-compliance issue.
- Added metric-specific action validation so origin and establishment-volume actions cannot be attached to unrelated charts.
- Kept unsupported generic marketing, capacity, lodging, occupancy, pricing, event, and weather claims rejected without matching evidence.

## Recommendation quality change

AI actions must be specific to the chart evidence and cannot be only a differently worded request to review or monitor data. The structured action plan must identify an operational step, suggested responsible entity, timeframe, intended outcome, and success indicator.

## Limitations

- The current origin aggregate uses the submitted residence/origin labels available in visitor reports.
- The establishment performance evidence is reported visitor volume and classification distribution only; it is not a quality, profitability, or capacity assessment.
- Existing cached recommendations require a fresh AI refresh to generate the new metric-specific action plans.
