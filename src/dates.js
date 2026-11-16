const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

export function parseDate(value) {
  const match = typeof value === 'string' && DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Use a valid YYYY-MM-DD date.');
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (year < 1 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError('Use a valid YYYY-MM-DD date.');
  }
  return date;
}

export function formatDate(date) {
  const year = date.getUTCFullYear();
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('Date is outside the supported calendar.');
  }
  return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function localToday(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dayDifference(start, end) {
  return (parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS;
}

export function addDays(value, amount) {
  if (!Number.isInteger(amount)) throw new TypeError('Use a whole number of calendar days.');
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

export function monthDays(month) {
  const first = parseDate(`${month}-01`);
  const cursor = new Date(first);
  const dates = [];
  while (cursor.getUTCMonth() === first.getUTCMonth()) {
    dates.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { offset: (first.getUTCDay() + 6) % 7, dates };
}

export function shiftMonth(month, amount) {
  const date = parseDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return formatDate(date).slice(0, 7);
}

export function dateLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full', timeZone: 'UTC'
  }).format(parseDate(value));
}

export function monthLabel(month) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(parseDate(`${month}-01`));
}
