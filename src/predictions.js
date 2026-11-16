import { addDays, dayDifference, parseDate } from './dates.js';
import {
  containsDate, deriveHistory, expandReviewSpan, overlaps, reviewNeedsAttention,
  startsInSpan, summarizeIntervals
} from './history.js';

export const PREDICTION_VERSION = 1;
const MIN_HISTORY = 3;
const HISTORY_LIMIT = 6;

const usable = (interval) => ['complete', 'provisional'].includes(interval.status);
const sameStarts = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function baseline(intervals) {
  const lengths = intervals.filter(usable).slice(-HISTORY_LIMIT)
    .map((interval) => interval.days).sort((a, b) => a - b);
  if (lengths.length < MIN_HISTORY) return null;
  const middle = Math.floor(lengths.length / 2);
  const median = lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2;
  return { threshold: median * 1.5, count: lengths.length };
}

export function validateDismissal(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid check-in dismissal.');
  const { id, start, end, anchor, starts } = value;
  parseDate(start);
  parseDate(end);
  if (anchor !== null) parseDate(anchor);
  if (start >= end || (anchor !== null && !containsDate(value, anchor)) ||
      id !== (anchor === null ? `span:${start}/${end}` : `open:${anchor}`) || !Array.isArray(starts)) {
    throw new TypeError('Invalid check-in dismissal.');
  }
  for (const [index, date] of starts.entries()) {
    parseDate(date);
    if (!containsDate(value, date) || (index > 0 && starts[index - 1] >= date)) {
      throw new TypeError('Invalid dismissed-start context.');
    }
  }
  return { id, start, end, anchor, starts: [...starts] };
}

export function sameDismissal(a, b) {
  return a === b || Boolean(a && b && a.id === b.id && a.start === b.start &&
    a.end === b.end && a.anchor === b.anchor && sameStarts(a.starts, b.starts));
}

export function deriveInsights(records, reviews, dismissals, today) {
  const base = deriveHistory(records, reviews, today);
  const checks = new Map();
  const addCheck = (requested, reason, comparison = null, anchor = null) => {
    const reviewed = expandReviewSpan(requested, reviews);
    const span = expandReviewSpan(reviewed, [...checks.values()]);
    const merged = [...checks.values()].filter((check) => overlaps(check, span));
    for (const check of merged) checks.delete(check.id);
    anchor ??= merged.find((check) => check.anchor)?.anchor ?? null;
    const id = anchor === null ? `span:${span.start}/${span.end}` : `open:${anchor}`;
    const priority = { limited: 1, long: 2, changed: 3 };
    const source = [{ reason, comparison }, ...merged]
      .sort((a, b) => priority[b.reason] - priority[a.reason])[0];
    checks.set(id, {
      id, ...span, anchor, starts: startsInSpan(base.starts, span),
      reason: source.reason, comparison: source.comparison
    });
  };
  // Score each gap against the same unflagged input set, not a cascading detection result.
  const intervals = base.intervals.map((interval) => {
    const answers = reviews.filter((review) => overlaps(interval, review));
    if (answers.some((review) => reviewNeedsAttention(review, base.starts))) {
      addCheck(interval, 'changed');
    }
    if (interval.status !== 'provisional') return interval;
    const comparison = baseline(base.intervals.filter((other) => other !== interval));
    if (!comparison) {
      addCheck(interval, 'limited');
      return interval;
    }
    if (interval.days > comparison.threshold) {
      addCheck(interval, 'long', { ...comparison, days: interval.days });
      return { ...interval, status: 'unresolved' };
    }
    return interval;
  });

  let openBlocked = false;
  if (base.openSpan) {
    const open = base.openSpan;
    const answers = reviews.filter((review) => overlaps(open, review));
    const changed = answers.some((review) => reviewNeedsAttention(review, base.starts));
    const unresolved = answers.some((review) => review.missingUnresolved ||
      review.answer === 'unsure' || reviewNeedsAttention(review, base.starts));
    if (changed) addCheck(open, 'changed', null, open.start);
    openBlocked = unresolved;
    if (!unresolved) {
      const completeThrough = answers.filter((review) => review.answer === 'complete' &&
        review.start <= open.start).map((review) => review.end).sort().at(-1);
      const coolingDown = completeThrough &&
        (completeThrough >= today || dayDifference(completeThrough, today) < 7);
      if (!coolingDown) {
        const comparison = baseline(base.intervals);
        const days = dayDifference(open.start, today);
        if (!comparison) addCheck(open, 'limited', null, open.start);
        else if (days > comparison.threshold) {
          addCheck(open, 'long', { ...comparison, days }, open.start);
          openBlocked = true;
        }
      }
    }
  }
  const recent = intervals.slice(-HISTORY_LIMIT);
  const eligible = recent.filter(usable);
  let forecast;
  if (openBlocked || recent.some((interval) => interval.status === 'unresolved')) {
    forecast = {
      status: 'blocked',
      reason: openBlocked ? 'Start history since the latest start is missing or unresolved.' :
        'One or more of the six most recent recorded intervals need history review.'
    };
  } else if (eligible.length < MIN_HISTORY) {
    forecast = { status: 'insufficient' };
  } else {
    const lengths = eligible.map((interval) => interval.days);
    try {
      const start = addDays(base.starts.at(-1), Math.max(1, Math.min(...lengths) - 2));
      const end = addDays(base.starts.at(-1), Math.max(...lengths) + 2);
      forecast = { status: today > end ? 'passed' : 'available', start, end };
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      forecast = { status: 'unavailable', reason: 'The estimated dates fall outside the supported calendar.' };
    }
  }
  return {
    history: { ...base, intervals, summary: summarizeIntervals(intervals) },
    checkins: [...checks.values()].filter((check) => !dismissals.some((dismissal) =>
      dismissal.id === check.id && sameStarts(dismissal.starts, check.starts))),
    forecast: {
      ...forecast, sampleCount: eligible.length,
      provisionalCount: eligible.filter((interval) => interval.status === 'provisional').length
    }
  };
}
