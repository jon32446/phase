import test from 'node:test';
import assert from 'node:assert/strict';
import { dayDifference, formatDate, localToday, monthDays, parseDate, shiftMonth } from '../src/dates.js';
import { sameRecord, validateRecord } from '../src/records.js';

test('calendar arithmetic handles leap years and Monday-first month boundaries', () => {
  assert.equal(monthDays('2024-02').dates.length, 29);
  assert.equal(monthDays('2025-02').dates.length, 28);
  assert.equal(monthDays('2026-11').offset, 6);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(formatDate(parseDate('0001-01-01')), '0001-01-01');
  assert.equal(monthDays('9999-12').dates.at(-1), '9999-12-31');
});

test('day differences are calendar days across DST and year boundaries', () => {
  assert.equal(dayDifference('2026-03-07', '2026-03-09'), 2);
  assert.equal(dayDifference('2026-10-31', '2026-11-02'), 2);
  assert.equal(dayDifference('2024-02-28', '2024-03-01'), 2);
  assert.equal(dayDifference('2026-12-31', '2027-01-01'), 1);
  assert.equal(dayDifference('2027-01-01', '2026-12-31'), -1);
  assert.equal(localToday(new Date(2026, 10, 8, 23, 59)), '2026-11-08');
});

test('invalid dates are rejected rather than normalised', () => {
  for (const value of ['2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01',
    '0000-01-01', '2026-1-01', '2026-01-00', '', null]) {
    assert.throws(() => parseDate(value), RangeError);
  }
  assert.throws(() => shiftMonth('0001-01', -1), RangeError);
  assert.throws(() => shiftMonth('9999-12', 1), RangeError);
});

test('observations never implicitly create starts and invalid starts are rejected', () => {
  for (const bleeding of ['none', 'spotting', 'light', 'medium', 'heavy']) {
    const record = { date: '2026-11-01', bleeding, periodStart: false };
    assert.deepEqual(validateRecord(record), record);
  }
  for (const bleeding of ['none', 'spotting']) {
    assert.throws(() => validateRecord({ date: '2026-11-01', bleeding, periodStart: true }));
  }
  assert.throws(() => validateRecord({ date: '2026-11-01', bleeding: 'unknown', periodStart: false }));
  assert.throws(() => validateRecord({ date: '2026-11-01', bleeding: 'heavy' }));
  assert.equal(sameRecord(null, { date: '2026-11-01', bleeding: 'none', periodStart: false }), false);
});
