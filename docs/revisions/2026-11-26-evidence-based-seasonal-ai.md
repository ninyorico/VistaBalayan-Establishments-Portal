# Evidence-based seasonal AI recommendations

## Changes

- Expanded AI generation context with the deterministic anomaly evidence, including reported values, reporting coverage, missing reports, late submissions, and period changes.
- Restricted generated recommendations to the affected metric and supplied evidence.
- Added explicit instructions that unsupported promotion, campaign, marketing, capacity, room, lodging-expansion, occupancy, pricing, event, and weather actions must not be generated without matching evidence.
- Added a selected-year Seasonal activity peak finding to the Seasonal Patterns chart.
- The seasonal finding uses the highest recorded combined visitor and overnight check-in activity for the active year and displays its actual month and values.
- Added `seasonality` as a recommendation metric so an AI action can be assigned specifically to that peak finding.
- Kept recommendation assignment one-to-one and evidence-bound; invalid or missing actions remain unavailable instead of being invented.

## Expected behavior

- A decline finding can receive an AI action based on reporting completeness or the affected metric when that action is supported by the evidence.
- A seasonal peak can receive an AI action about preserving or studying the observed pattern, but not an invented cause or unsupported marketing/capacity action.
- Changing the reporting year changes the seasonal evidence and the related seasonal finding.
- The officer must use **Refresh AI analysis** to generate current recommendations after this revision; existing unsupported stored recommendations are rejected during assignment.

## Limitations

- AI output still requires officer review.
- The current seasonal finding identifies the strongest observed combined month; it does not infer why that month was strong.
