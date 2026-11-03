import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRows } from './generate-administrative-report.js';

test('server aggregation preserves weekly, monthly, quarterly, and yearly totals', () => {
  const result = aggregateRows([
    { report_date: '2026-01-01', total_guests: 10, establishment_id: 'a' },
    { report_date: '2026-01-04', total_guests: 20, establishment_id: 'b' },
    { report_date: '2026-01-05', total_guests: 30, establishment_id: 'a' },
    { report_date: '2026-04-01', total_guests: 40, establishment_id: 'c' },
    { report_date: '2026-12-31', total_guests: 50, establishment_id: 'c' },
    { report_date: '2026-01-06', total_guests: 999, establishment_id: 'ignored' },
  ]);

  assert.deepEqual(result.weekly.slice(0, 3), [
    { period: '2026-W01', visitorTotal: 30, reportCount: 2, establishmentCount: 2 },
    { period: '2026-W02', visitorTotal: 1029, reportCount: 2, establishmentCount: 2 },
    { period: '2026-W14', visitorTotal: 40, reportCount: 1, establishmentCount: 1 },
  ]);
  assert.deepEqual(result.monthly, [
    { period: '2026-01', visitorTotal: 1059, reportCount: 4, establishmentCount: 3 },
    { period: '2026-04', visitorTotal: 40, reportCount: 1, establishmentCount: 1 },
    { period: '2026-12', visitorTotal: 50, reportCount: 1, establishmentCount: 1 },
  ]);
  assert.deepEqual(result.quarterly, [
    { period: '2026-Q1', visitorTotal: 1059, reportCount: 4, establishmentCount: 3 },
    { period: '2026-Q2', visitorTotal: 40, reportCount: 1, establishmentCount: 1 },
    { period: '2026-Q4', visitorTotal: 50, reportCount: 1, establishmentCount: 1 },
  ]);
  assert.deepEqual(result.yearly, [
    { period: '2026', visitorTotal: 1149, reportCount: 6, establishmentCount: 4 },
  ]);
});
