import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

const exportableStatuses = new Set(['approved', 'validated']);
const fixtures = [
  'approved', 'validated', 'pending', 'submitted', 'under_review',
  'needs_review', 'on_hold', 'rejected', 'archived',
].map((status, index) => ({ status, value: index + 1 }));

const exported = fixtures.filter((record) => exportableStatuses.has(record.status));
assert.deepEqual(exported.map((record) => record.status), ['approved', 'validated']);
assert.deepEqual(exported.map((record) => record.value), [1, 2]);
assert.equal(fixtures.some((record) => record.status !== 'approved' && record.status !== 'validated' && exported.includes(record)), false);

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('STATUS FIXTURE');
sheet.columns = [{ header: 'Status', key: 'status' }, { header: 'Value', key: 'value' }];
exported.forEach((record) => sheet.addRow(record));
const roundTrip = new ExcelJS.Workbook();
await roundTrip.xlsx.load(await workbook.xlsx.writeBuffer());
const rows = roundTrip.getWorksheet('STATUS FIXTURE').getRows(2, 2).map((row) => ({
  status: row.getCell(1).value,
  value: row.getCell(2).value,
}));
assert.deepEqual(rows, exported);
console.log('EXPORT_STATUS_FIXTURE_PASS', JSON.stringify({ included: ['approved', 'validated'], excluded: fixtures.filter((record) => !exportableStatuses.has(record.status)).map((record) => record.status) }));
