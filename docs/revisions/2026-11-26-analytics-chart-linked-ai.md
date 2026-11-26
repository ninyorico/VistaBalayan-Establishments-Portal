# Analytics chart-linked AI findings and layout revision

## Implemented

- Removed the separate dashboard-wide AI findings card from the Analytics page.
- Rendered related AI anomaly findings and their evidence-bound recommendations inside the Tourism Trends and Seasonal Patterns card, directly below its chart.
- Kept anomaly markers on the chart and connected each related finding to the same chart evidence.
- Related findings use the active `ReportPeriodFilter`, so changing the reporting period reloads the chart and the matching AI findings together.
- Preserved one-to-one recommendation assignment and evidence validation; recommendations are shown inside their related anomaly card instead of as duplicated standalone cards.
- Kept the AI refresh action inside the chart-linked findings area.
- Normalized filter-button layout so labels and period controls stack safely on narrow widths and align without overflow on larger widths.
- Improved `Drop` marker labels with a readable 11px bold red label positioned above the marker with an offset, rather than placing the text directly on the dot.

## Verification

- `npm test`: 45 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- Build warnings remain reportable: empty `src/styles/fonts.css`, stale Browserslist data, and large generated chunks.
- Authenticated browser rendering was not available through the browser harness; live rendered screenshot verification remains a separate limitation.
