import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWorkedLabor } from '../server/laborAnalytics';

const start = new Date('2026-10-01T09:00:00Z');
const end = new Date('2026-10-01T17:00:00Z');
const wages = [{ id: 'employee', hourlyRate: '20.50' }];
const mapping = [{ posEmployeeId: 'pos-employee', employeeId: 'employee', status: 'manual' }];
const manual = { id: 'manual-entry', employeeId: 'employee', clockInTime: start, clockOutTime: end,
  breakStartTime: new Date('2026-10-01T12:00:00Z'), breakEndTime: new Date('2026-10-01T12:30:00Z') };
const pos = { posEmployeeId: 'pos-employee', clockInAt: start, clockOutAt: end,
  breakSeconds: 1800, wageCents: null, hrTimeEntryId: null };

test('manual labor parses decimal wages and deducts unpaid breaks', () => {
  assert.deepEqual(calculateWorkedLabor(wages, [manual], [], []), { hours: 7.5, labor: 153.75 });
});
test('POS labor resolves HR wages from the POS employee mapping', () => {
  assert.deepEqual(calculateWorkedLabor(wages, [], [pos], mapping), { hours: 7.5, labor: 153.75 });
});
test('POS supplied wages take precedence and mirrored HR shifts are counted once', () => {
  assert.deepEqual(calculateWorkedLabor(wages, [manual], [{ ...pos, wageCents: 2200, hrTimeEntryId: manual.id }], mapping),
    { hours: 7.5, labor: 165 });
});
test('open shifts are excluded and an ignored mapping cannot supply a wage', () => {
  assert.deepEqual(calculateWorkedLabor(wages, [{ ...manual, clockOutTime: null }], [{ ...pos, clockOutAt: null }], mapping),
    { hours: 0, labor: 0 });
  assert.deepEqual(calculateWorkedLabor(wages, [], [pos], [{ ...mapping[0], status: 'ignored' }]), { hours: 7.5, labor: 0 });
});
