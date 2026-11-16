import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveHistory, expandReviewSpan, reviewNeedsAttention, validateReview
} from '../src/history.js';

const records = (...dates) => dates.map((date) => ({ date, bleeding: 'medium', periodStart: true }));
const review = (start, end, answer = 'complete', extra = {}) => ({
  id: `${start}/${end}`, start, end, answer, starts: [start, end],
  needsReview: false, missingUnresolved: answer === 'missing', ...extra
});

test('sparse daily observations yield current intervals across leap days and DST', () => {
  const days = records('2024-02-28', '2024-03-01', '2024-04-01');
  const history = deriveHistory(days, [], '2024-04-05');
  assert.deepEqual(history.intervals.map(({ days, status }) => [days, status]),
    [[2, 'provisional'], [31, 'provisional']]);
  assert.deepEqual(history.summary, { count: 2, confirmed: 0, provisional: 2, min: 2, max: 31 });
  assert.deepEqual(history.openSpan, { start: '2024-04-01', end: '2024-04-05' });
  assert.equal(deriveHistory([], [], '2024-04-05').openSpan, null);
  assert.equal(deriveHistory(records('2024-04-05'), [], '2024-04-05').openSpan, null);
  assert.deepEqual(deriveHistory(days.filter((day) => day.date !== '2024-03-01'), [], '2024-04-05')
    .intervals.map((interval) => interval.days), [33]);
});

test('known missing spans exclude overlapping intervals, without inventing starts', () => {
  const days = records('2026-01-01', '2026-02-01', '2026-04-01');
  const missing = review('2026-01-01', '2026-04-01', 'missing', {
    starts: ['2026-01-01', '2026-02-01', '2026-04-01'], needsReview: true
  });
  const history = deriveHistory(days, [missing], '2026-04-01');
  assert.deepEqual(history.intervals.map((interval) => interval.status), ['missing', 'missing']);
  assert.equal(history.summary.count, 0);
  assert.equal(history.summary.min, null);
  assert.equal(history.starts.length, 3);
  const unsure = { ...missing, answer: 'unsure', needsReview: false };
  assert.equal(deriveHistory(days, [unsure], '2026-04-01').summary.count, 0);
});

test('confirmed long intervals are retained; stale or unsure confirmations are not usable', () => {
  const days = records('2026-01-01', '2026-04-01');
  const answer = review('2026-01-01', '2026-04-01');
  assert.equal(deriveHistory(days, [answer], '2026-04-01').summary.max, 90);
  assert.equal(deriveHistory(days, [answer], '2026-04-01').intervals[0].status, 'complete');
  for (const changed of [{ ...answer, needsReview: true }, { ...answer, answer: 'unsure' }]) {
    assert.equal(deriveHistory(days, [changed], '2026-04-01').intervals[0].status, 'unresolved');
  }
  assert.equal(reviewNeedsAttention(answer, ['2026-01-01', '2026-02-01', '2026-04-01']), true);
});

test('overlap replacement expands to whole answers, transitively, but not adjacent spans', () => {
  const reviews = [
    review('2026-01-01', '2026-03-01'),
    review('2026-03-01', '2026-05-01'),
    review('2026-05-01', '2026-06-01')
  ];
  assert.deepEqual(expandReviewSpan({ start: '2026-02-01', end: '2026-04-01' }, reviews),
    { start: '2026-01-01', end: '2026-05-01' });
  assert.deepEqual(expandReviewSpan({ start: '2026-03-01', end: '2026-05-01' }, reviews),
    { start: '2026-03-01', end: '2026-05-01' });
});

test('reviews validate dates, sorted start context and meaningful missing-history states', () => {
  const valid = review('2026-01-01', '2026-04-01');
  assert.deepEqual(validateReview(valid), valid);
  for (const invalid of [
    { ...valid, end: '2026-02-30' },
    { ...valid, id: 'other' },
    { ...valid, starts: [...valid.starts].reverse() },
    { ...valid, starts: ['2025-12-01'] },
    { ...valid, answer: 'missing' },
    { ...valid, missingUnresolved: true }
  ]) assert.throws(() => validateReview(invalid));
});
