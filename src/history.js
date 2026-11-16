import { dayDifference, parseDate } from './dates.js';

export const HISTORY_VERSION = 1;
export const REVIEW_LABELS = Object.freeze({
  complete: 'All starts recorded',
  missing: 'Starts missing; dates forgotten',
  unsure: 'Unsure'
});

export function startDates(records) {
  return records.filter((record) => record.periodStart).map((record) => record.date).sort();
}

export function containsDate(span, date) {
  return span.start <= date && date <= span.end;
}

export function startsInSpan(starts, span) {
  return starts.filter((date) => containsDate(span, date));
}

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function expandReviewSpan(span, reviews) {
  const result = { start: span.start, end: span.end };
  let expanded;
  do {
    expanded = false;
    for (const review of reviews) {
      if (!overlaps(result, review)) continue;
      if (review.start < result.start) {
        result.start = review.start;
        expanded = true;
      }
      if (review.end > result.end) {
        result.end = review.end;
        expanded = true;
      }
    }
  } while (expanded);
  return result;
}

export function validateReview(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid history review.');
  const { start, end, answer, starts, needsReview, missingUnresolved } = value;
  parseDate(start);
  parseDate(end);
  if (start >= end || value.id !== `${start}/${end}` ||
      !Object.hasOwn(REVIEW_LABELS, answer) || typeof needsReview !== 'boolean' ||
      typeof missingUnresolved !== 'boolean' || !Array.isArray(starts) ||
      (answer === 'missing' && !missingUnresolved) ||
      (answer === 'complete' && missingUnresolved)) {
    throw new TypeError('Invalid history review.');
  }
  for (const [index, date] of starts.entries()) {
    parseDate(date);
    if (!containsDate(value, date) || (index > 0 && starts[index - 1] >= date)) {
      throw new TypeError('Invalid reviewed starts.');
    }
  }
  return { id: value.id, start, end, answer, starts: [...starts], needsReview, missingUnresolved };
}

export function sameReview(a, b) {
  return a === b || Boolean(a && b && a.id === b.id && a.answer === b.answer &&
    a.needsReview === b.needsReview && a.missingUnresolved === b.missingUnresolved &&
    JSON.stringify(a.starts) === JSON.stringify(b.starts));
}

export function sameReviews(a, b) {
  const sorted = (reviews) => [...reviews].sort((x, y) => x.id.localeCompare(y.id));
  const left = sorted(a);
  const right = sorted(b);
  return left.length === right.length && left.every((review, index) => sameReview(review, right[index]));
}

export function reviewNeedsAttention(review, starts) {
  return review.needsReview ||
    JSON.stringify(review.starts) !== JSON.stringify(startsInSpan(starts, review));
}

export function summarizeIntervals(intervals) {
  const usable = intervals.filter((interval) => ['provisional', 'complete'].includes(interval.status));
  const lengths = usable.map((interval) => interval.days);
  return {
    count: usable.length,
    confirmed: usable.filter((interval) => interval.status === 'complete').length,
    provisional: usable.filter((interval) => interval.status === 'provisional').length,
    min: lengths.length ? Math.min(...lengths) : null,
    max: lengths.length ? Math.max(...lengths) : null
  };
}

export function deriveHistory(records, reviews, today) {
  const starts = startDates(records);
  const intervals = starts.slice(1).map((end, index) => {
    const span = { start: starts[index], end };
    const answers = reviews.filter((review) => overlaps(span, review));
    let status = 'provisional';
    if (answers.some((review) => review.missingUnresolved)) status = 'missing';
    else if (answers.some((review) => review.answer === 'unsure' || reviewNeedsAttention(review, starts))) {
      status = 'unresolved';
    } else if (answers.some((review) => review.answer === 'complete' &&
        review.start <= span.start && review.end >= span.end)) status = 'complete';
    return { ...span, days: dayDifference(span.start, end), status };
  });
  return {
    starts,
    intervals,
    openSpan: starts.length && starts.at(-1) < today ? { start: starts.at(-1), end: today } : null,
    summary: summarizeIntervals(intervals)
  };
}
