import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRows, bundleRanges, change, previousRange, safeNarrative } from './administrative-report.js';

test('aggregateRows keeps day-tour visits and accommodation check-ins separate', () => {
  const source = aggregateRows(
    [
      { establishment_id: 'a', report_date: '2026-11-02', total_guests: 12 },
      { establishment_id: 'a', report_date: '2026-11-03', total_guests: 8 },
    ],
    [{ establishment_id: 'b', report_date: '2026-11-03', total_check_ins: 5 }],
    [
      { id: 'a', name: 'Day Tour A', reporting_mode: 'visitor', status: 'active' },
      { id: 'b', name: 'Stay B', reporting_mode: 'accommodation', status: 'active' },
    ],
    '2026-11-01',
    '2026-11-03',
  );
  assert.equal(source.visitorTotal, 20);
  assert.equal(source.guestCheckInTotal, 5);
  assert.equal(source.visitorRecordCount, 2);
  assert.equal(source.accommodationRecordCount, 1);
  assert.equal(source.daily.find((row) => row.period === '2026-11-03').dayTourVisits, 8);
  assert.equal(source.daily.find((row) => row.period === '2026-11-03').guestCheckIns, 5);
});

test('aggregateRows prefers canonical total_visitors over legacy total_guests', () => {
  const source = aggregateRows(
    [{ establishment_id: 'a', report_date: '2026-11-02', total_visitors: 15, total_guests: 99 }],
    [],
    [{ id: 'a', name: 'Day Tour A', reporting_mode: 'visitor', status: 'active' }],
    '2026-11-01',
    '2026-11-02',
  );
  assert.equal(source.visitorTotal, 15);
});
test('bundleRanges derives the containing week, month, quarter, and year', () => {
  assert.deepEqual(bundleRanges('2026-11-01'), {
    week: { start: '2026-10-26', end: '2026-11-01' },
    month: { start: '2026-11-01', end: '2026-11-30' },
    quarter: { start: '2026-10-01', end: '2026-12-31' },
    year: { start: '2026-01-01', end: '2026-12-31' },
  });
});
test('bundleRanges uses Monday through Sunday ISO weeks across year boundaries', () => {
  assert.deepEqual(bundleRanges('2026-01-01').week, { start: '2025-12-29', end: '2026-01-04' });
});
test('previousRange handles monthly and yearly comparisons', () => {
  assert.deepEqual(previousRange('month', '2026-03-01', '2026-03-31'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(previousRange('year', '2026-01-01', '2026-12-31'), { start: '2025-01-01', end: '2025-12-31' });
});

test('change does not invent a percentage with a zero denominator', () => {
  assert.equal(change(12, 0).percentage, null);
  assert.equal(change(12, 0).label, 'New activity');
});

test('narrative validator falls back on unsupported claims and numbers', () => {
  const source = { visitorTotal: 12, guestCheckInTotal: 5, comparison: { dayTourVisits: { label: '10.0%' }, guestCheckIns: { label: 'New activity' } }, dataQuality: { notes: [] } };
  const result = safeNarrative({ executiveSummary: 'The resort has Wi-Fi and 20 rooms.', dayTourAnalysis: 'Increase', accommodationAnalysis: 'Stable', recommendations: [] }, source);
  assert.equal(result.status, 'fallback');
  assert.equal(result.model, 'deterministic-fallback');
});
