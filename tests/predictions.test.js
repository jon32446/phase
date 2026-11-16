import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/dates.js';
import { deriveInsights, validateDismissal } from '../src/predictions.js';

function history(lengths, first = '2026-01-01') {
  const dates = [first];
  for (const days of lengths) dates.push(addDays(dates.at(-1), days));
  return dates.map((date) => ({ date, bleeding: 'medium', periodStart: true }));
}

function review(records, first, last, answer, extra = {}) {
  const start = records[first].date;
  const end = records[last].date;
  return {
    id: `${start}/${end}`, start, end, answer,
    starts: records.slice(first, last + 1).map((record) => record.date),
    needsReview: false, missingUnresolved: answer === 'missing', ...extra
  };
}

function insights(records, reviews = [], daysSince = 0, dismissals = []) {
  return deriveInsights(records, reviews, dismissals, addDays(records.at(-1).date, daysSince));
}

test('forecasts require three intervals and use shortest/longest lengths with two-day padding', () => {
  assert.equal(deriveInsights([], [], [], '2026-01-01').forecast.status, 'insufficient');
  for (const lengths of [[], [28], [28, 28]]) {
    assert.equal(insights(history(lengths)).forecast.status, 'insufficient');
  }
  const records = history([25, 28, 32]);
  const result = insights(records, [], 5);
  assert.deepEqual(result.forecast, {
    status: 'available', start: addDays(records.at(-1).date, 23),
    end: addDays(records.at(-1).date, 34), sampleCount: 3, provisionalCount: 3
  });
  assert.equal(result.history.summary.count, 3);
});

test('calendar-day forecast arithmetic handles leap years and refuses unsupported dates', () => {
  const records = history([28, 28, 28], '2023-12-07');
  assert.equal(records.at(-1).date, '2024-02-29');
  assert.equal(insights(records).forecast.start, '2024-03-26');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  const short = history([1, 1, 1]);
  assert.equal(insights(short).forecast.start, addDays(short.at(-1).date, 1));
  assert.equal(insights(short).forecast.end, addDays(short.at(-1).date, 3));
  assert.equal(insights(history([1, 1, 1], '9999-12-27')).forecast.status, 'unavailable');
});

test('gap detection excludes its own interval, requires three others, and uses a strict threshold', () => {
  const sparse = insights(history([28, 28, 70]));
  assert.equal(sparse.history.intervals.at(-1).status, 'provisional');
  assert.equal(sparse.checkins.at(-1).reason, 'limited');
  assert.equal(insights(history([28, 28, 28, 42])).history.intervals.at(-1).status, 'provisional');
  const records = history([28, 28, 28, 43]);
  const result = insights(records);
  assert.equal(result.history.intervals.at(-1).status, 'unresolved');
  assert.equal(result.forecast.status, 'blocked');
  assert.equal(result.checkins[0].reason, 'long');
  assert.deepEqual(result.checkins[0].comparison, { threshold: 42, count: 3, days: 43 });
  assert.equal(result.history.summary.count, 3);
  const confirmed = insights(records, [review(records, 3, 4, 'complete')]);
  assert.equal(confirmed.forecast.status, 'available');
  assert.equal(confirmed.history.summary.max, 43);
  assert.equal(confirmed.forecast.end, addDays(records.at(-1).date, 45));
});

test('detection does not cascade classifications or use its candidate in the baseline', () => {
  const result = insights(history([10, 10, 40, 40]));
  assert.deepEqual(result.history.intervals.map((interval) => interval.status),
    ['provisional', 'provisional', 'unresolved', 'unresolved']);
  assert.equal(result.checkins.length, 2);
});

test('only the latest six intervals govern forecast eligibility, without backfilling exclusions', () => {
  const records = history(Array(10).fill(28));
  const oldUnsure = review(records, 0, 1, 'unsure');
  assert.equal(insights(records, [oldUnsure]).forecast.status, 'available');
  const recentUnsure = review(records, 9, 10, 'unsure');
  assert.equal(insights(records, [recentUnsure]).forecast.status, 'blocked');
  const missing = review(records, 9, 10, 'missing');
  const result = insights(records, [missing]);
  assert.equal(result.forecast.status, 'available');
  assert.equal(result.forecast.sampleCount, 5);
  const tooMuchMissing = review(records, 4, 9, 'missing');
  assert.equal(insights(records, [tooMuchMissing]).forecast.status, 'insufficient');
  assert.equal(insights(records, [tooMuchMissing]).forecast.sampleCount, 1);
});

test('passed windows keep their dates; an open duration trigger withholds without inventing starts', () => {
  const records = history([28, 28, 28, 28]);
  const available = insights(records, [], 10).forecast;
  const passed = insights(records, [], 31).forecast;
  assert.equal(passed.status, 'passed');
  assert.equal(passed.start, available.start);
  assert.equal(passed.end, available.end);
  assert.equal(insights(records, [], 42).forecast.status, 'passed');
  const long = insights(records, [], 43);
  assert.equal(long.forecast.status, 'blocked');
  assert.equal(long.checkins[0].anchor, records.at(-1).date);
  assert.equal(long.history.starts.length, records.length);
});

test('relevant open uncertainty blocks; complete answers suppress until seven days later', () => {
  const records = history([28, 28, 28, 28]);
  const start = records.at(-1).date;
  const end = addDays(start, 50);
  const openReview = {
    id: `${start}/${end}`, start, end, starts: [start],
    answer: 'complete', missingUnresolved: false, needsReview: false
  };
  assert.equal(insights(records, [openReview], 50).checkins.length, 0);
  assert.equal(insights(records, [openReview], 56).checkins.length, 0);
  assert.equal(insights(records, [openReview], 56).forecast.status, 'passed');
  assert.equal(insights(records, [openReview], 57).checkins[0].reason, 'long');
  for (const answer of ['unsure', 'missing']) {
    const changed = { ...openReview, answer, missingUnresolved: answer === 'missing' };
    const result = insights(records, [changed], 60);
    assert.equal(result.forecast.status, 'blocked');
    assert.equal(result.checkins.length, 0);
    const stale = insights(records, [{ ...changed, needsReview: true }], 60);
    assert.equal(stale.checkins[0].reason, 'changed');
  }
});

test('dismissals suppress prompts, not unresolved classification or forecast blocking', () => {
  const records = history([28, 28, 28, 43]);
  const before = insights(records);
  const dismissal = validateDismissal(before.checkins[0]);
  const result = insights(records, [], 0, [dismissal]);
  assert.equal(result.checkins.length, 0);
  assert.equal(result.forecast.status, 'blocked');
  assert.equal(result.history.intervals.at(-1).status, 'unresolved');
  const openRecords = history([28, 28, 28]);
  const openDismissal = validateDismissal(insights(openRecords, [], 43).checkins.find((check) => check.anchor));
  assert.equal(insights(openRecords, [], 44, [openDismissal]).checkins.some((check) => check.anchor), false);
  assert.equal(insights(openRecords, [], 44, [openDismissal]).forecast.status, 'blocked');
});

test('limited-history questions use no population duration cutoff or implicit missing-start flag', () => {
  const records = history([28]);
  const short = insights(records, [], 1);
  const long = insights(records, [], 150);
  assert.deepEqual(short.checkins.map((check) => check.reason), ['limited', 'limited']);
  assert.deepEqual(long.checkins.map((check) => check.reason), ['limited', 'limited']);
  assert.equal(long.history.intervals[0].status, 'provisional');
  assert.equal(long.forecast.status, 'insufficient');
  const dismissal = validateDismissal(long.checkins.find((check) => check.anchor));
  assert.equal(insights(records, [], 151, [dismissal]).checkins.some((check) => check.anchor), false);
});

test('one stale reviewed span is not prompted separately as historical and open history', () => {
  const records = history([28, 28, 28, 28, 10]);
  const start = records.at(-2).date;
  const end = addDays(start, 15);
  const stale = {
    id: `${start}/${end}`, start, end, answer: 'complete',
    starts: records.slice(-2).map((record) => record.date), needsReview: true, missingUnresolved: false
  };
  const result = insights(records, [stale], 6);
  assert.equal(result.checkins.length, 1);
  assert.equal(result.checkins[0].reason, 'changed');
  assert.equal(result.checkins[0].anchor, records.at(-1).date);
  assert.equal(result.checkins[0].start, start);
  assert.equal(result.checkins[0].end, addDays(start, 16));
});

test('dismissals validate fixed dates, anchor identity and sorted recorded-start context', () => {
  const valid = validateDismissal(insights(history([28])).checkins[0]);
  for (const invalid of [
    { ...valid, id: 'other' }, { ...valid, end: valid.start },
    { ...valid, starts: [...valid.starts].reverse() }, { ...valid, anchor: '2025-01-01' }
  ]) assert.throws(() => validateDismissal(invalid));
});
