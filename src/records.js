import { parseDate } from './dates.js';

export const BLEEDING_LABELS = Object.freeze({
  none: 'None', spotting: 'Spotting', light: 'Light', medium: 'Medium', heavy: 'Heavy'
});

export function supportsStart(bleeding) {
  return ['light', 'medium', 'heavy'].includes(bleeding);
}

export function validateRecord(record) {
  if (!record || typeof record !== 'object') throw new TypeError('Invalid daily record.');
  parseDate(record.date);
  if (!Object.hasOwn(BLEEDING_LABELS, record.bleeding) ||
      typeof record.periodStart !== 'boolean') {
    throw new TypeError('Choose a bleeding observation and a valid period-start marker.');
  }
  if (record.periodStart && !supportsStart(record.bleeding)) {
    throw new TypeError('A period start requires light, medium, or heavy bleeding.');
  }
  return { date: record.date, bleeding: record.bleeding, periodStart: record.periodStart };
}

export function sameRecord(a, b) {
  return a === b || Boolean(a && b && a.date === b.date &&
    a.bleeding === b.bleeding && a.periodStart === b.periodStart);
}
