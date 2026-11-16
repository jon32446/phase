import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, createCSV, parseBackup, sameState } from '../src/backup.js';

const today = '2026-11-08';
const record = (date, bleeding = 'medium', periodStart = true) => ({ date, bleeding, periodStart });
const sample = () => ({
  records: [record('2026-10-01'), record('2026-10-28'), record('2026-11-05', 'none', false)],
  reviews: [{
    id: '2026-10-01/2026-10-28', start: '2026-10-01', end: '2026-10-28',
    answer: 'unsure', starts: ['2026-10-01', '2026-10-28'], needsReview: true, missingUnresolved: true
  }],
  dismissals: [{
    id: 'open:2026-10-28', start: '2026-10-28', end: today,
    anchor: '2026-10-28', starts: ['2026-10-28']
  }]
});
const serialize = (state) => JSON.stringify(createBackup(state, today));

test('JSON round-trip preserves all mutable health state, including stale reviews and dismissals', () => {
  const state = sample();
  assert.deepEqual(parseBackup(serialize(state), today), state);
  assert.deepEqual(parseBackup(serialize({ records: [], reviews: [], dismissals: [] }), today),
    { records: [], reviews: [], dismissals: [] });
  const reordered = sample();
  reordered.records.reverse();
  assert.ok(sameState(state, reordered));
  reordered.reviews[0].missingUnresolved = false;
  assert.ok(!sameState(state, reordered));
});

test('CSV exports only recorded observations with explicit marker values, sorted by date', () => {
  const state = sample();
  state.records.reverse();
  assert.equal(createCSV(state, today),
    'date,bleeding,periodStart\r\n2026-10-01,medium,true\r\n2026-10-28,medium,true\r\n2026-11-05,none,false\r\n');
});

test('malformed, unsupported, duplicate, future, or inconsistent backups are rejected whole', () => {
  assert.throws(() => parseBackup('<script>not JSON</script>', today), /not valid JSON/);
  assert.throws(() => parseBackup('null', today), /Unsupported/);
  const cases = [
    [(backup) => { backup.version = 99; }, /Unsupported/],
    [(backup) => { backup.extra = 'not silently discarded'; }, /fields/],
    [(backup) => { backup.records = {}; }, /must be a list/],
    [(backup) => { backup.records.push(backup.records[0]); }, /Duplicate/],
    [(backup) => { backup.reviews.push(backup.reviews[0]); }, /Duplicate/],
    [(backup) => { backup.dismissals.push(backup.dismissals[0]); }, /Duplicate/],
    [(backup) => { backup.records[0].bleeding = '=WEBSERVICE("example")'; }, /bleeding/],
    [(backup) => { backup.records[0].bleeding = 'spotting'; }, /period start/],
    [(backup) => { backup.records[0].date = '2026-02-30'; }, /valid YYYY/],
    [(backup) => { backup.records.push(record('2026-11-09')); }, /future/],
    [(backup) => { backup.reviews[0].starts = []; }, /context/],
    [(backup) => { backup.dismissals[0].starts = []; }, /context/],
    [(backup) => {
      backup.dismissals = [{
        id: 'open:2026-10-01', start: '2026-10-01', end: '2026-10-28',
        anchor: '2026-10-01', starts: ['2026-10-01', '2026-10-28']
      }];
    }, /latest start/],
    [(backup) => {
      backup.dismissals[0].end = '2026-11-09';
    }, /future/],
    [(backup) => {
      backup.reviews.push({
        ...backup.reviews[0], id: '2026-10-20/2026-10-29',
        start: '2026-10-20', end: '2026-10-29', starts: ['2026-10-28']
      });
    }, /overlapping/]
  ];
  for (const [mutate, error] of cases) {
    const backup = createBackup(sample(), today);
    mutate(backup);
    assert.throws(() => parseBackup(JSON.stringify(backup), today), error);
  }
});
