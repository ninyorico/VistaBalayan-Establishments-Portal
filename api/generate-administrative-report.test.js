import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRows } from './generate-administrative-report.js';

test('server aggregation preserves visitors and guest check-ins across all periods', () => {
  const result = aggregateRows([
    { report_date: '2026-01-01', total_guests: 10, establishment_id: 'a' },
    { report_date: '2026-01-04', total_guests: 20, establishment_id: 'b' },
    { report_date: '2026-01-05', total_guests: 30, establishment_id: 'a' },
    { report_date: '2026-04-01', total_guests: 40, establishment_id: 'c' },
    { report_date: '2026-12-31', total_guests: 50, establishment_id: 'c' },
    { report_date: '2026-01-06', total_guests: 999, establishment_id: 'ignored' },
  ], [
    { report_date: '2026-01-01', total_check_ins: 4, establishment_id: 'a' },
    { report_date: '2026-04-01', total_check_ins: 6, establishment_id: 'c' },
    { report_date: '2026-12-31', total_check_ins: 8, establishment_id: 'c' },
  ]);

  assert.deepEqual(result.weekly.slice(0, 3), [
    { period: '2026-W01', visitorTotal: 30, guestCheckInTotal: 4, visitorRecordCount: 2, accommodationRecordCount: 1, submissionCount: 2, establishmentCount: 2 },
    { period: '2026-W02', visitorTotal: 1029, guestCheckInTotal: 0, visitorRecordCount: 2, accommodationRecordCount: 0, submissionCount: 2, establishmentCount: 2 },
    { period: '2026-W14', visitorTotal: 40, guestCheckInTotal: 6, visitorRecordCount: 1, accommodationRecordCount: 1, submissionCount: 1, establishmentCount: 1 },
  ]);
  assert.deepEqual(result.monthly, [
    { period: '2026-01', visitorTotal: 1059, guestCheckInTotal: 4, visitorRecordCount: 4, accommodationRecordCount: 1, submissionCount: 4, establishmentCount: 3 },
    { period: '2026-04', visitorTotal: 40, guestCheckInTotal: 6, visitorRecordCount: 1, accommodationRecordCount: 1, submissionCount: 1, establishmentCount: 1 },
    { period: '2026-12', visitorTotal: 50, guestCheckInTotal: 8, visitorRecordCount: 1, accommodationRecordCount: 1, submissionCount: 1, establishmentCount: 1 },
  ]);
  assert.deepEqual(result.quarterly, [
    { period: '2026-Q1', visitorTotal: 1059, guestCheckInTotal: 4, visitorRecordCount: 4, accommodationRecordCount: 1, submissionCount: 4, establishmentCount: 3 },
    { period: '2026-Q2', visitorTotal: 40, guestCheckInTotal: 6, visitorRecordCount: 1, accommodationRecordCount: 1, submissionCount: 1, establishmentCount: 1 },
    { period: '2026-Q4', visitorTotal: 50, guestCheckInTotal: 8, visitorRecordCount: 1, accommodationRecordCount: 1, submissionCount: 1, establishmentCount: 1 },
  ]);
  assert.deepEqual(result.yearly, [
    { period: '2026', visitorTotal: 1149, guestCheckInTotal: 18, visitorRecordCount: 6, accommodationRecordCount: 3, submissionCount: 6, establishmentCount: 4 },
  ]);
});
