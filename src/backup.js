import { localToday, parseDate } from './dates.js';
import { validateRecord } from './records.js';
import { overlaps, startDates, startsInSpan, validateReview } from './history.js';
import { validateDismissal } from './predictions.js';

export const BACKUP_VERSION = 1;
const FORMAT = 'phase-backup';

function fields(value, names, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== names.length ||
      names.some((name) => !Object.hasOwn(value, name))) {
    throw new TypeError(`Invalid ${label} fields. No data was imported.`);
  }
}

function entries(values, names, validate, key, label) {
  if (!Array.isArray(values)) throw new TypeError(`Backup ${label} must be a list.`);
  const seen = new Set();
  return values.map((value) => {
    fields(value, names, label);
    const valid = validate(value);
    if (seen.has(valid[key])) throw new TypeError(`Duplicate ${label}: ${valid[key]}.`);
    seen.add(valid[key]);
    return valid;
  }).sort((a, b) => a[key].localeCompare(b[key]));
}

export function validateState(state, today = localToday()) {
  parseDate(today);
  fields(state, ['records', 'reviews', 'dismissals'], 'diary');
  const records = entries(state.records, ['date', 'bleeding', 'periodStart'],
    validateRecord, 'date', 'daily record');
  const reviews = entries(state.reviews,
    ['id', 'start', 'end', 'answer', 'starts', 'needsReview', 'missingUnresolved'],
    validateReview, 'id', 'history review');
  const dismissals = entries(state.dismissals, ['id', 'start', 'end', 'anchor', 'starts'],
    validateDismissal, 'id', 'check-in dismissal');
  if (records.some((record) => record.date > today) ||
      [...reviews, ...dismissals].some((span) => span.end > today)) {
    throw new RangeError('Backup contains future observations or reviewed dates.');
  }
  const starts = startDates(records);
  for (const span of [...reviews, ...dismissals]) {
    if (JSON.stringify(span.starts) !== JSON.stringify(startsInSpan(starts, span))) {
      throw new TypeError(`Recorded-start context does not match ${span.id}.`);
    }
  }
  for (let index = 1; index < reviews.length; index++) {
    if (overlaps(reviews[index - 1], reviews[index])) {
      throw new TypeError('Backup contains overlapping history reviews.');
    }
  }
  if (dismissals.some((span) => span.anchor !== null && span.anchor !== starts.at(-1))) {
    throw new TypeError('An open check-in dismissal does not match the latest start.');
  }
  return { records, reviews, dismissals };
}

export function createBackup(state, today = localToday()) {
  return { format: FORMAT, version: BACKUP_VERSION, ...validateState(state, today) };
}

export function parseBackup(text, today = localToday()) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError('This file is not valid JSON. Choose a Phase JSON backup.');
  }
  if (value?.format !== FORMAT || value?.version !== BACKUP_VERSION) {
    throw new TypeError('Unsupported backup format or version. Choose a supported Phase JSON backup.');
  }
  fields(value, ['format', 'version', 'records', 'reviews', 'dismissals'], 'backup');
  return validateState({ records: value.records, reviews: value.reviews, dismissals: value.dismissals }, today);
}

export function sameState(a, b) {
  const canonical = (state) => ({
    records: state.records.map(validateRecord).sort((a, b) => a.date.localeCompare(b.date)),
    reviews: state.reviews.map(validateReview).sort((a, b) => a.id.localeCompare(b.id)),
    dismissals: state.dismissals.map(validateDismissal).sort((a, b) => a.id.localeCompare(b.id))
  });
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function createCSV(state, today = localToday()) {
  const { records } = validateState(state, today);
  return ['date,bleeding,periodStart', ...records.map((record) =>
    `${record.date},${record.bleeding},${record.periodStart}`)].join('\r\n') + '\r\n';
}
