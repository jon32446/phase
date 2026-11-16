import { dateLabel, localToday, monthDays, monthLabel, parseDate, shiftMonth } from './dates.js';
import { BLEEDING_LABELS, supportsStart } from './records.js';
import { openStorage } from './storage.js';
import {
  expandReviewSpan, overlaps, REVIEW_LABELS, reviewNeedsAttention, startDates
} from './history.js';
import { deriveInsights } from './predictions.js';
import { createBackup, createCSV, parseBackup } from './backup.js';
import { setupOffline } from './offline.js';

const $ = (id) => document.getElementById(id);
// Keep native keyboard scrolling clear of fixed controls and notifications.
function updateScrollPadding() {
  const navigation = document.querySelector('nav');
  const navigationHeight = getComputedStyle(navigation).position === 'fixed' ? navigation.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--navigation-height', `${Math.ceil(navigationHeight)}px`);
  const overlays = document.querySelectorAll('nav, .feedback, #selection-bar');
  const bottom = Math.max(0, ...[...overlays].map((element) => {
    const box = element.getBoundingClientRect();
    return box.height && getComputedStyle(element).position === 'fixed' ? innerHeight - box.top : 0;
  }));
  document.documentElement.style.setProperty('--bottom-overlay', `${Math.ceil(bottom)}px`);
}
const overlayObserver = new ResizeObserver(updateScrollPadding);
for (const element of document.querySelectorAll('nav, .feedback, #selection-bar')) overlayObserver.observe(element);
window.addEventListener('resize', updateScrollPadding);

const diaryDates = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
});
const resetChannel = globalThis.BroadcastChannel ? new BroadcastChannel('phase-diary-reset') : null;
resetChannel?.addEventListener('message', (event) => {
  if (event.data === 'reset') location.reload();
});
let records = new Map();
let reviews = [];
let dismissals = [];
let storage;
let month = localToday().slice(0, 7);
let selectedDate;
let original;
let returnFocus;
let editing = false;
let busy = false;
let pendingConflict;
let undo;
let editorRequest = 0;
let selectionMode = false;
const selectedDates = new Set();
let pendingBulk;
let bulkReturnAction;
let pendingReview;
let reviewReturnSpan;
let reviewReturnSection;
let pendingData;
const refreshUpdate = setupOffline(() => !busy && !editing && !selectionMode &&
  !document.querySelector('dialog[open]'), setBusy);
new MutationObserver(refreshUpdate).observe(document.body, {
  subtree: true, attributes: true, attributeFilter: ['open']
});

function announce(message, quiet = false) {
  $('status').textContent = message;
  $('status').classList.toggle('quiet', quiet);
}

function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function shortDate(date) {
  return diaryDates.format(parseDate(date));
}

function dateRange(start, end) {
  return diaryDates.formatRange(parseDate(start), parseDate(end));
}

function choice(id) {
  return $(id).querySelector('input:checked')?.value ?? '';
}

function setChoice(id, value) {
  for (const input of $(id).querySelectorAll('input')) input.checked = input.value === value;
}

function focusChoice(id) {
  ($(id).querySelector('input:checked') ?? $(id).querySelector('input')).focus();
}

function renderCalendar() {
  $('month-heading').textContent = monthLabel(month);
  $('previous-month').disabled = month === '0001-01';
  $('next-month').disabled = month === '9999-12';
  const today = localToday();
  const { offset, dates } = monthDays(month);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < offset; index++) {
    const spacer = document.createElement('span');
    spacer.setAttribute('aria-hidden', 'true');
    fragment.append(spacer);
  }
  for (const date of dates) {
    const record = records.get(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';
    button.dataset.date = date;
    button.dataset.bleeding = record?.bleeding ?? 'unknown';
    const observation = record ? BLEEDING_LABELS[record.bleeding] : 'Not recorded';
    button.setAttribute('aria-label', `${dateLabel(date)}: ${observation}${record?.periodStart ? ', period start' : ''}${date > today ? ', future date, view-only' : ''}`);
    if (date === today) button.setAttribute('aria-current', 'date');
    button.disabled = date > today || busy;
    if (selectionMode) button.setAttribute('aria-pressed', String(selectedDates.has(date)));
    const number = document.createElement('span');
    number.className = 'day-number';
    number.textContent = String(Number(date.slice(-2)));
    const value = document.createElement('span');
    value.className = 'day-value';
    value.setAttribute('aria-hidden', 'true');
    if (record?.bleeding === 'none') value.append(icon('none'));
    else if (record?.bleeding === 'spotting') {
      const spots = document.createElement('span');
      spots.className = 'spotting-mark';
      value.append(spots);
    } else {
      const drops = { light: 1, medium: 2, heavy: 3 }[record?.bleeding] ?? 0;
      for (let index = 0; index < drops; index++) value.append(icon('drop'));
    }
    button.append(number, value);
    if (record?.periodStart) button.append(icon('start', 'day-start'));
    if (selectionMode && selectedDates.has(date)) {
      const marker = document.createElement('span');
      marker.className = 'day-selection';
      marker.append(icon('check'));
      marker.setAttribute('aria-hidden', 'true');
      button.append(marker);
    }
    button.addEventListener('click', () => {
      if (busy) return;
      if (selectionMode) {
        if (selectedDates.has(date)) selectedDates.delete(date);
        else selectedDates.add(date);
        renderCalendar();
        updateSelectionControls();
        [...$('calendar').querySelectorAll('button')].find((day) => day.dataset.date === date).focus();
      } else openEditor(date, { page: 'calendar', date });
    });
    fragment.append(button);
  }
  $('calendar').replaceChildren(fragment);
}

function renderHistory() {
  const fragment = document.createDocumentFragment();
  const starts = [...records.values()].filter((record) => record.periodStart)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const record of starts) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.date = record.date;
    button.setAttribute('aria-label', `${shortDate(record.date)} - ${BLEEDING_LABELS[record.bleeding]} flow. Edit period start`);
    const label = document.createElement('span');
    label.className = 'start-date';
    const date = document.createElement('span');
    date.textContent = shortDate(record.date);
    const observation = document.createElement('small');
    observation.textContent = `${BLEEDING_LABELS[record.bleeding]} flow`;
    label.append(date, observation);
    button.append(label, icon('arrow'));
    button.addEventListener('click', () => openEditor(record.date, { page: 'history', date: record.date }));
    item.append(button);
    fragment.append(item);
  }
  $('history').replaceChildren(fragment);
  $('empty-history').hidden = starts.length > 0;
  const insights = deriveInsights([...records.values()], reviews, dismissals, localToday());
  const { history } = insights;
  renderForecast(insights.forecast);
  renderCheckins(insights.checkins);
  const { summary } = history;
  $('cycle-summary').replaceChildren();
  const summaryValue = document.createElement('strong');
  summaryValue.textContent = summary.count ?
    `${summary.min === summary.max ? summary.min : `${summary.min}-${summary.max}`} days between starts` :
    'A little more history will help.';
  const summaryContext = document.createElement('small');
  summaryContext.textContent = summary.count ?
    `From ${summary.count} usable recorded ${summary.count === 1 ? 'interval' : 'intervals'}: ${summary.confirmed} confirmed complete, ${summary.provisional} provisional.` :
    'No usable completed intervals yet. Log at least two period starts, or check any missing or uncertain history.';
  $('cycle-summary').append(summaryValue, summaryContext);
  const labels = {
    provisional: 'Not yet checked',
    complete: 'History confirmed',
    missing: 'Missing starts',
    unresolved: 'History uncertain'
  };
  const intervals = document.createDocumentFragment();
  for (const interval of [...history.intervals].reverse()) {
    const item = document.createElement('li');
    item.dataset.status = interval.status;
    const top = document.createElement('div');
    top.className = 'interval-top';
    const length = document.createElement('strong');
    length.textContent = `${interval.days} days`;
    const status = document.createElement('span');
    status.textContent = labels[interval.status];
    top.append(length, status);
    const dates = document.createElement('p');
    dates.className = 'interval-dates';
    dates.textContent = dateRange(interval.start, interval.end);
    item.append(top, dates, reviewButton(interval, 'Review'));
    intervals.append(item);
  }
  $('intervals').replaceChildren(intervals);
  $('open-span').replaceChildren();
  if (history.openSpan) {
    const text = document.createElement('p');
    text.textContent = `Since your latest start: ${dateRange(history.openSpan.start, history.openSpan.end)}. This span ends when another period start is recorded.`;
    $('open-span').append(text, reviewButton(history.openSpan, 'Review'));
  }
  const answers = document.createDocumentFragment();
  for (const review of [...reviews].sort((a, b) => b.start.localeCompare(a.start))) {
    const item = document.createElement('li');
    item.dataset.reviewId = review.id;
    const text = document.createElement('p');
    text.textContent = `${dateRange(review.start, review.end)}: ${reviewDescription(review, history.starts)}.`;
    item.append(text, reviewButton(review, 'Change review'));
    answers.append(item);
  }
  $('history-reviews').replaceChildren(answers);
  $('empty-reviews').hidden = reviews.length > 0;
}

function renderForecast(forecast) {
  $('forecast').dataset.state = forecast.status;
  const hasRange = ['available', 'passed'].includes(forecast.status);
  $('estimate-heading').textContent = forecast.status === 'passed' ? 'Your last estimate' : 'Looking ahead';
  $('estimate-text').textContent = hasRange ? dateRange(forecast.start, forecast.end) :
    forecast.status === 'blocked' ? 'A quick check first.' :
    forecast.status === 'insufficient' ? 'Getting to know your rhythm.' : 'No estimate just now.';
  $('estimate-note').textContent = forecast.status === 'passed' ?
    'This estimated window has passed. These dates remain based on your last recorded period start.' :
    forecast.status === 'available' ?
      'Your next period may start around these dates. The timing can vary.' :
      forecast.status === 'blocked' ?
        'Some start history is missing or uncertain. You can check it in History, or keep logging as usual.' :
        forecast.status === 'insufficient' ?
          'An estimate needs at least four recorded period starts, giving three usable intervals. No daily logging needed.' :
          'The estimated dates are outside the calendar this diary supports.';
  $('estimate-sample').hidden = !hasRange;
  $('estimate-sample').textContent = hasRange ?
    `Based on ${forecast.sampleCount} intervals, including ${forecast.provisionalCount} you haven't confirmed.` : '';
  $('estimate-method').textContent = ['available', 'passed'].includes(forecast.status) ?
    `Based on ${forecast.sampleCount} usable intervals among the latest six, including ${forecast.provisionalCount} provisional. The range extends two days on either side of your shortest and longest intervals. It starts at least one day after your latest recorded start. We haven't established how reliably this range predicts a period start. Do not use it for contraception. The window does not move forward when it passes.` :
    'Estimates need at least three eligible intervals among the latest six. Uncertain history needs checking before an estimate can be shown. Intervals with missing starts are left out of the calculation. Phase cannot provide medical or contraception advice.';
  $('view-checkins').hidden = forecast.status !== 'blocked' &&
    !(forecast.status === 'insufficient' && records.size > 0);
  $('view-checkins').disabled = busy || !storage;
}

function renderCheckins(checkins) {
  const fragment = document.createDocumentFragment();
  for (const check of checkins) {
    const card = document.createElement('div');
    card.className = 'checkin-card';
    card.dataset.checkinId = check.id;
    card.dataset.reason = check.reason;
    const heading = document.createElement('h3');
    heading.textContent = dateRange(check.start, check.end);
    const text = document.createElement('p');
    const detail = document.createElement('details');
    const explanation = document.createElement('summary');
    explanation.textContent = 'Why this question?';
    const reason = document.createElement('p');
    if (check.reason === 'changed') {
      text.textContent = 'You changed a period start here. Does your earlier answer still fit?';
      reason.textContent = 'A recorded start changed after your answer. This does not mean a period start is missing.';
    } else if (check.reason === 'long') {
      text.textContent = `There are ${check.comparison.days} days between these dates. Have you recorded every period start?`;
      reason.textContent = `We ask when a span is over ${check.comparison.threshold} days: 1.5 times the median of ${check.comparison.count} other usable intervals. This threshold helps decide when to ask about your records. It cannot establish whether another period occurred or assess your health.`;
    } else {
      text.textContent = 'We are still getting to know your history. Have you recorded every period start here?';
      reason.textContent = 'There are fewer than three other usable intervals to compare with this span. You can check what you remember. No general cycle-length cutoff has been applied, and no missing start has been assumed.';
    }
    detail.append(explanation, reason);
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss check-in';
    dismiss.className = 'text-button';
    dismiss.disabled = busy || !storage;
    dismiss.addEventListener('click', () => dismissCheckin(check));
    card.append(heading, text, detail, reviewButton(check, 'Review history'), dismiss);
    fragment.append(card);
  }
  $('history-checkins').replaceChildren(fragment);
  $('empty-checkins').hidden = checkins.length > 0;
}

async function dismissCheckin(check) {
  if (!storage || busy || editing) return;
  editorRequest++;
  setBusy(true);
  try {
    applyState(await storage.dismissCheckin(check));
    announce(`Check-in dismissed. No history answer was saved. Any uncertainty still affects estimates.${undo ? ' Your previous Undo is unchanged.' : ''}`);
  } catch (error) {
    announce(`${error.message}${error.code === 'STALE_RECORD' ? ' Reload to refresh this check-in.' : ''}`);
  } finally {
    setBusy(false);
    ($('history-checkins').querySelector('button') ?? $('history-heading')).focus();
  }
}

function reviewDescription(review, starts) {
  return `${REVIEW_LABELS[review.answer]}${reviewNeedsAttention(review, starts) ? '. Your recorded starts have changed since this answer. Please check it again' : ''}${review.missingUnresolved && review.answer !== 'missing' ? '. You previously reported missing starts here. Please check whether any are still missing' : ''}`;
}

function reviewButton(span, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.span = `${span.start}/${span.end}`;
  button.textContent = action === 'Review' ? 'Check this history' :
    action === 'Change review' ? 'Change answer' : 'Check history';
  button.setAttribute('aria-label', `${button.textContent}: ${shortDate(span.start)} to ${shortDate(span.end)}`);
  button.disabled = !storage || busy;
  button.addEventListener('click', () => openReview(span, button.closest('[id]').id));
  return button;
}

function renderRecords() {
  renderCalendar();
  renderHistory();
}

function applyState(state) {
  records = new Map(state.records.map((record) => [record.date, record]));
  reviews = state.reviews;
  dismissals = state.dismissals;
  renderRecords();
}

function updateSelectionControls() {
  refreshUpdate();
  $('select-days').hidden = selectionMode;
  $('select-days').disabled = !storage || busy;
  $('selection-bar').hidden = !selectionMode;
  const count = selectedDates.size;
  $('selection-count').textContent = `${count} ${count === 1 ? 'day' : 'days'} selected`;
  $('log-today').hidden = selectionMode;
  for (const button of document.querySelectorAll('[data-bulk-action]')) {
    button.disabled = busy || count === 0;
  }
  $('cancel-selection').disabled = busy;
  $('refresh-records').disabled = busy;
  updateScrollPadding();
}

function clearSelectionError() {
  $('selection-error').hidden = true;
}

function showSelectionError(error) {
  $('selection-error-message').textContent = error.message;
  $('refresh-records').hidden = error.code !== 'STALE_RECORD';
  $('selection-error').hidden = false;
}

function cancelSelection() {
  selectionMode = false;
  selectedDates.clear();
  clearSelectionError();
  updateSelectionControls();
  renderCalendar();
}

function showEditorError(message) {
  $('editor-error').textContent = message;
  $('editor-error').hidden = false;
}

function clearConflict() {
  pendingConflict = undefined;
  $('marker-conflict').hidden = true;
}

function setBusy(value) {
  busy = value;
  refreshUpdate();
  for (const id of ['day-form', 'bulk-form', 'review-form', 'data-form']) {
    for (const control of $(id).elements) control.disabled = value;
    $(id).setAttribute('aria-busy', String(value));
  }
  if (!value) {
    $('clear-day').disabled = original == null;
    $('clear-day').hidden = original == null;
  }
  $('undo').disabled = value;
  $('undo-notice').disabled = value;
  $('dismiss-save').disabled = value;
  $('view-checkins').disabled = value || !storage;
  $('log-today').disabled = value || !storage;
  for (const button of document.querySelectorAll('nav button')) button.disabled = value;
  for (const button of $('calendar').querySelectorAll('button')) {
    button.disabled = value || button.dataset.date > localToday();
  }
  for (const button of $('history-page').querySelectorAll('button')) button.disabled = value || !storage;
  for (const control of $('settings-page').querySelectorAll('button, input')) control.disabled = value || !storage;
  updateSelectionControls();
  updateBulkCommit();
  updateReviewControls();
  updateDataControls();
}

async function openEditor(date, focusTarget) {
  if (!storage || busy || editing || date > localToday()) return;
  const requestId = ++editorRequest;
  try {
    const state = await storage.readState();
    if (requestId !== editorRequest) return;
    const latest = state.records.find((record) => record.date === date) ?? null;
    original = latest;
    selectedDate = date;
    returnFocus = focusTarget;
    applyState(state);
    editing = true;
    $('editor-heading').textContent = shortDate(date);
    $('editor-current').textContent = latest ?
      `Recorded: ${BLEEDING_LABELS[latest.bleeding]}${latest.periodStart ? ', period start' : ''}.` :
      'Nothing logged yet. Start with what you remember.';
    $('editor-help').textContent = 'Only this day changes. Unlogged days stay blank.';
    setChoice('bleeding', latest?.bleeding ?? '');
    $('period-start').checked = latest?.periodStart ?? false;
    $('editor-error').hidden = true;
    clearConflict();
    setBusy(false);
    $('day-editor').showModal();
    focusChoice('bleeding');
  } catch (error) {
    announce(error.message);
  }
}

function closeEditor() {
  if (busy) return;
  $('day-editor').close();
}

$('day-editor').addEventListener('close', () => {
  editing = false;
  refreshUpdate();
  clearConflict();
  const container = returnFocus?.page === 'history' ? $('history') : $('calendar');
  const target = [...container.querySelectorAll('button[data-date]')]
    .find((button) => button.dataset.date === returnFocus?.date);
  (target ?? document.querySelector('nav [aria-current="page"]')).focus();
});

for (const [dialog, form] of [
  ['day-editor', 'day-form'], ['bulk-editor', 'bulk-form'],
  ['review-editor', 'review-form'], ['data-editor', 'data-form']
]) {
  $(dialog).addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  $(dialog).addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...$(form).querySelectorAll('button, input, select, summary')]
      .filter((control) => !control.disabled && control.getClientRects().length > 0 &&
        (control.type !== 'radio' || control.checked ||
          !$(form).querySelector(`input[name="${control.name}"]:checked`)));
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function offerConflict(record, message, action) {
  pendingConflict = { record };
  $('conflict-message').textContent = message;
  $('resolve-conflict').textContent = action;
  $('marker-conflict').hidden = false;
  $('resolve-conflict').focus();
}

function updateReviewControls() {
  const approval = !pendingReview?.replaced.length || $('review-replace').checked;
  $('save-review').disabled = busy || !pendingReview || !approval || !choice('review-answer');
  $('remove-review').disabled = busy || !pendingReview?.replaced.length || !approval;
  $('remove-review').hidden = !pendingReview?.replaced.length;
}

async function openReview(requested, section) {
  if (!storage || busy || editing) return;
  const requestId = ++editorRequest;
  try {
    const state = await storage.readState();
    if (requestId !== editorRequest) return;
    applyState(state);
    const span = expandReviewSpan(requested, state.reviews);
    const replaced = state.reviews.filter((review) => overlaps(review, span));
    const starts = startDates(state.records);
    pendingReview = { span, replaced, expected: state };
    reviewReturnSpan = `${requested.start}/${requested.end}`;
    reviewReturnSection = section;
    $('review-heading').textContent = dateRange(span.start, span.end);
    $('review-boundaries').textContent = span.start !== requested.start || span.end !== requested.end ?
      'This includes the full span of overlapping answers. Saving replaces each answer listed below in full.' :
      'Your answer applies only to the dates shown above.';
    $('review-starts').textContent = `Period starts recorded here: ${starts.filter((date) =>
      span.start <= date && date <= span.end).map(shortDate).join(', ') || 'none'}.`;
    const list = document.createDocumentFragment();
    for (const review of replaced) {
      const item = document.createElement('li');
      item.textContent = `${dateRange(review.start, review.end)}: ${reviewDescription(review, starts)}.`;
      list.append(item);
    }
    $('review-existing').replaceChildren(list);
    $('review-replacement').hidden = replaced.length === 0;
    $('review-replace').checked = false;
    $('review-missing-warning').hidden = !replaced.some((review) => review.missingUnresolved);
    const exact = replaced.length === 1 && replaced[0].start === span.start && replaced[0].end === span.end &&
      !reviewNeedsAttention(replaced[0], starts) ? replaced[0] : null;
    setChoice('review-answer', exact?.answer ?? '');
    $('remembered-start').open = false;
    $('review-add-date').value = '';
    $('review-add-date').min = span.start;
    $('review-add-date').max = span.end;
    $('review-error').hidden = true;
    editing = true;
    setBusy(false);
    $('review-editor').showModal();
    focusChoice('review-answer');
  } catch (error) {
    announce(error.message);
  }
}

$('review-answer').addEventListener('change', updateReviewControls);
$('review-replace').addEventListener('change', updateReviewControls);
$('cancel-review').addEventListener('click', () => {
  if (!busy) $('review-editor').close();
});
$('review-editor').addEventListener('close', () => {
  editing = false;
  refreshUpdate();
  pendingReview = undefined;
  const target = [...$(reviewReturnSection).querySelectorAll('button[data-span]')]
    .find((button) => button.dataset.span === reviewReturnSpan);
  (target ?? $('history-heading')).focus();
});

async function saveReview(answer) {
  if (busy || !pendingReview) return;
  if (pendingReview.replaced.length && !$('review-replace').checked) return;
  setBusy(true);
  $('review-error').hidden = true;
  try {
    const result = await storage.saveReview(pendingReview.span, answer, pendingReview.expected);
    applyState(result);
    if (result.reviewChanges.length) offerUndo(result);
    announce(result.reviewChanges.length ?
      `History review ${answer === null ? 'removed' : 'saved'}. Daily observations are unchanged.` :
      'No changes to save.', result.reviewChanges.length > 0);
    setBusy(false);
    $('review-editor').close();
  } catch (error) {
    setBusy(false);
    $('review-error').textContent = error.message;
    $('review-error').hidden = false;
  }
}

$('review-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (Object.hasOwn(REVIEW_LABELS, choice('review-answer'))) saveReview(choice('review-answer'));
});
$('remove-review').addEventListener('click', () => saveReview(null));
$('add-remembered-start').addEventListener('click', () => {
  if (busy || !pendingReview) return;
  const date = $('review-add-date').value;
  try {
    parseDate(date);
    if (date < pendingReview.span.start || date > pendingReview.span.end || date > localToday()) {
      throw new RangeError('Choose a date within the reviewed span, no later than today.');
    }
  } catch (error) {
    $('review-error').textContent = error.message;
    $('review-error').hidden = false;
    $('review-add-date').focus();
    return;
  }
  $('review-editor').addEventListener('close', async () => {
    await openEditor(date, { page: 'history', date });
    if (editing) {
      $('period-start').checked = true;
      $('editor-help').textContent = "Choose a flow to save this remembered start. Your draft history answer hasn't been saved. After adding this start, check your history again.";
    }
  }, { once: true });
  $('review-editor').close();
});

function dismissSaveNotice() {
  const hadFocus = $('save-notice').contains(document.activeElement);
  $('save-notice').hidden = true;
  $('save-description').textContent = '';
  if (hadFocus) $('undo').focus({ preventScroll: true });
}

function discardUndo() {
  const hadFocus = document.activeElement === $('undo') || $('save-notice').contains(document.activeElement);
  undo = undefined;
  dismissSaveNotice();
  $('undo-bar').hidden = true;
  $('undo-description').textContent = '';
  if (hadFocus) document.querySelector('nav [aria-current="page"]').focus();
}

function describeEdit(changes, reviewChanges) {
  if (changes.length === 0) {
    const spans = reviewChanges.map((change) => change.next ?? change.previous);
    const start = spans.map((span) => span.start).sort()[0];
    const end = spans.map((span) => span.end).sort().at(-1);
    return `History answer ${reviewChanges.every((change) => !change.next) ? 'removed' : 'updated'} for ${dateRange(start, end)}.`;
  }
  if (changes.length === 1) {
    const { date, previous, next } = changes[0];
    if (!next) return `Cleared ${shortDate(date)}.`;
    const flow = next.bleeding === 'none' ? 'no bleeding' :
      next.bleeding === 'spotting' ? 'spotting' : `${next.bleeding} flow`;
    const start = next.periodStart ? ' Period start recorded.' :
      previous?.periodStart ? ' Period start removed.' : '';
    return `Recorded ${flow} for ${shortDate(date)}.${start}`;
  }
  const dates = changes.map((change) => change.date).sort();
  return `${changes.every((change) => !change.next) ? 'Cleared' : 'Updated'} ${changes.length} days (${dateRange(dates[0], dates.at(-1))}).`;
}

function offerUndo(result) {
  discardUndo();
  const changes = result.changes.filter((change) => change.changed);
  undo = {
    resetToken: result.resetToken,
    changes, reviewChanges: result.reviewChanges,
    reviewGuards: result.reviewGuards, startGuards: result.startGuards,
    dismissalChanges: result.dismissalChanges
  };
  const description = describeEdit(changes, result.reviewChanges);
  $('undo-description').textContent = description;
  $('undo-bar').hidden = false;
  $('save-description').textContent = description;
  $('save-notice').hidden = false;
}

async function saveRecord(record) {
  if (busy) return;
  setBusy(true);
  $('editor-error').hidden = true;
  try {
    const result = await storage.replaceDay(selectedDate, record, original);
    const change = result.changes[0];
    applyState(result);
    if (change.changed) offerUndo(result);
    announce(change.changed ?
      `${record ? 'Saved' : 'Cleared'} ${dateLabel(change.date)}.` :
      'No changes to save.', change.changed);
    setBusy(false);
    closeEditor();
  } catch (error) {
    setBusy(false);
    showEditorError(error.message);
  }
}

$('day-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  clearConflict();
  const bleeding = choice('bleeding');
  if (!Object.hasOwn(BLEEDING_LABELS, bleeding)) {
    showEditorError('Choose a bleeding observation to save this day, or close to leave it blank.');
    focusChoice('bleeding');
    return;
  }
  const record = { date: selectedDate, bleeding, periodStart: $('period-start').checked };
  if (record.periodStart && !supportsStart(bleeding)) {
    offerConflict({ ...record, periodStart: false },
      `A period start needs light, medium, or heavy flow. To save ${bleeding === 'none' ? 'no bleeding' : 'spotting'}, remove the period start or choose a different flow.`,
      'Remove period start and save');
    return;
  }
  saveRecord(record);
});

$('clear-day').addEventListener('click', () => {
  if (busy || !original) return;
  clearConflict();
  if (original.periodStart) {
    offerConflict(null,
      'Clearing this day removes both its bleeding observation and its recorded period start. The day will become unknown.',
      'Remove observation and period start');
  } else saveRecord(null);
});

$('resolve-conflict').addEventListener('click', () => {
  if (pendingConflict && !busy) saveRecord(pendingConflict.record);
});
$('keep-editing').addEventListener('click', () => {
  clearConflict();
  focusChoice('bleeding');
});
for (const id of ['bleeding', 'period-start']) {
  $(id).addEventListener('change', () => {
    clearConflict();
    $('editor-error').hidden = true;
  });
}
$('cancel-editor').addEventListener('click', closeEditor);

function recordSummary(record) {
  return record ?
    `${BLEEDING_LABELS[record.bleeding]}${record.periodStart ? ', period start' : ', no period-start marker'}` :
    'Not recorded (unknown)';
}

function updateBulkCommit() {
  const missingApproval = [...$('bulk-preview').querySelectorAll('input')]
    .some((checkbox) => !checkbox.checked);
  $('save-bulk').disabled = busy || !pendingBulk || missingApproval;
}

async function applyBulkAction(action) {
  if (!storage || busy || editing || !selectionMode || selectedDates.size === 0) return;
  clearSelectionError();
  const changes = [...selectedDates].sort().map((date) => {
    const previous = records.get(date) ?? null;
    const conflict = Boolean(previous?.periodStart && (action === 'clear' || !supportsStart(action)));
    const next = action === 'clear' ? null : {
      date, bleeding: action, periodStart: Boolean(previous?.periodStart && !conflict)
    };
    return { date, next, expected: previous };
  });
  const conflicts = changes.filter((change) => change.expected?.periodStart && !change.next?.periodStart);
  if (conflicts.length === 0) {
    await saveBulk(changes);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const change of conflicts) {
    const row = document.createElement('li');
    row.dataset.date = change.date;
    const heading = document.createElement('h3');
    heading.textContent = dateLabel(change.date);
    const before = document.createElement('p');
    before.textContent = `Before: ${recordSummary(change.expected)}`;
    const after = document.createElement('p');
    after.textContent = `After: ${recordSummary(change.next)}. Removing the period start needs your approval.`;
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.date = change.date;
    checkbox.addEventListener('change', updateBulkCommit);
    label.append(checkbox, `Remove period start on ${dateLabel(change.date)}`);
    row.append(heading, before, after, label);
    fragment.append(row);
  }
  pendingBulk = changes;
  bulkReturnAction = action;
  $('bulk-preview').replaceChildren(fragment);
  $('bulk-summary').textContent = `${action === 'clear' ? 'Clear observations' : `Set bleeding to ${BLEEDING_LABELS[action].toLowerCase()}`} for ${changes.length} ${changes.length === 1 ? 'day' : 'days'}. ${conflicts.length} ${conflicts.length === 1 ? 'period start needs' : 'period starts need'} removal approval.`;
  $('bulk-error').hidden = true;
  editing = true;
  updateBulkCommit();
  $('bulk-editor').showModal();
  $('bulk-preview').querySelector('input').focus();
}

$('bulk-editor').addEventListener('close', () => {
  editing = false;
  refreshUpdate();
  pendingBulk = undefined;
  $('bulk-preview').replaceChildren();
  updateBulkCommit();
  const target = selectionMode ?
    [...document.querySelectorAll('[data-bulk-action]')].find((button) => button.dataset.bulkAction === bulkReturnAction) :
    $('select-days');
  target.focus();
});

$('cancel-bulk').addEventListener('click', () => {
  if (!busy) $('bulk-editor').close();
});

async function saveBulk(edits) {
  if (busy) return;
  setBusy(true);
  $('bulk-error').hidden = true;
  try {
    const result = await storage.replaceDays(edits);
    const { changes } = result;
    applyState(result);
    const changed = changes.filter((change) => change.changed);
    if (changed.length > 0) offerUndo(result);
    announce(changed.length > 0 ?
      `Saved batch: ${changed.length} ${changed.length === 1 ? 'day' : 'days'} changed.` :
      'No changes to save.', changed.length > 0);
    setBusy(false);
    cancelSelection();
    if ($('bulk-editor').open) $('bulk-editor').close();
    else $('select-days').focus();
  } catch (error) {
    setBusy(false);
    showSelectionError(error);
    if ($('bulk-editor').open) {
      $('bulk-error').textContent = error.message;
      $('bulk-error').hidden = false;
    }
  }
}

$('bulk-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || !pendingBulk) return;
  const missing = [...$('bulk-preview').querySelectorAll('input')].find((checkbox) => !checkbox.checked);
  if (missing) {
    $('bulk-error').textContent = 'Approve each conflicting period-start removal, or go back to change the selection or action.';
    $('bulk-error').hidden = false;
    missing.focus();
    return;
  }
  saveBulk(pendingBulk);
});

$('refresh-records').addEventListener('click', async () => {
  if (busy || editing || !storage || !selectionMode) return;
  setBusy(true);
  try {
    applyState(await storage.readState());
    clearSelectionError();
    announce('Calendar records refreshed. Review selected days, then choose an action again.');
    setBusy(false);
    const selectedDay = [...$('calendar').querySelectorAll('button')]
      .find((button) => selectedDates.has(button.dataset.date) && !button.disabled);
    (selectedDay ?? $('cancel-selection')).focus();
  } catch (error) {
    setBusy(false);
    showSelectionError(error);
  }
});

$('select-days').addEventListener('click', () => {
  if (!storage || busy || editing) return;
  editorRequest++;
  selectionMode = true;
  updateSelectionControls();
  renderCalendar();
  announce('Tap the days you want to change, then choose a flow below. You can move between months.', true);
  ($('calendar').querySelector('[aria-current="date"]:not(:disabled)') ??
    $('calendar').querySelector('button:not(:disabled)'))?.focus();
});

$('cancel-selection').addEventListener('click', () => {
  if (busy) return;
  cancelSelection();
  announce('Selection cancelled. No records changed.');
  $('select-days').focus();
});

for (const button of document.querySelectorAll('[data-bulk-action]')) {
  button.addEventListener('click', () => applyBulkAction(button.dataset.bulkAction));
}

async function undoEdit() {
  if (busy || editing || !undo) return;
  const hadFocus = document.activeElement === $('undo') || document.activeElement === $('undo-notice');
  const { changes } = undo;
  setBusy(true);
  try {
    const restored = await storage.restore(undo);
    applyState(restored);
    discardUndo();
    announce(changes.length === 0 ? 'Undid the history review edit.' : changes.length === 1 ?
      `Undid the edit to ${dateLabel(changes[0].date)}.` :
      `Undid the batch edit to ${changes.length} days.`);
  } catch (error) {
    if (error.code === 'DIARY_RESET') discardUndo();
    announce(error.message);
  } finally {
    setBusy(false);
    if (hadFocus && !undo) document.querySelector('nav [aria-current="page"]').focus();
  }
}
$('undo').addEventListener('click', undoEdit);
$('undo-notice').addEventListener('click', undoEdit);
$('dismiss-save').addEventListener('click', dismissSaveNotice);

for (const button of document.querySelectorAll('nav [data-page]')) {
  button.addEventListener('click', () => {
    if (busy) return;
    if (button.getAttribute('aria-current') !== 'page') dismissSaveNotice();
    editorRequest++;
    if (button.dataset.page !== 'calendar' && selectionMode) {
      cancelSelection();
      announce('Selection cancelled. No records changed.');
    } else announce('', true);
    for (const navButton of document.querySelectorAll('nav [data-page]')) {
      if (navButton === button) navButton.setAttribute('aria-current', 'page');
      else navButton.removeAttribute('aria-current');
      $(`${navButton.dataset.page}-page`).hidden = navButton !== button;
    }
    renderRecords();
    window.scrollTo(0, 0);
  });
}
$('view-checkins').addEventListener('click', () => {
  if (busy) return;
  document.querySelector('nav [data-page="history"]').click();
  $('checkins-heading').focus();
});
for (const [id, amount] of [['previous-month', -1], ['next-month', 1]]) {
  $(id).addEventListener('click', () => {
    month = shiftMonth(month, amount);
    renderRecords();
  });
}
$('today').addEventListener('click', () => {
  month = localToday().slice(0, 7);
  renderRecords();
  $('calendar').querySelector('[aria-current="date"]')?.focus();
});
$('log-today').addEventListener('click', () => {
  month = localToday().slice(0, 7);
  renderRecords();
  openEditor(localToday(), { page: 'calendar', date: localToday() });
});
$('history-log').addEventListener('click', () => {
  document.querySelector('nav [data-page="calendar"]').click();
  $('log-today').focus();
});

function settingsError(error) {
  $('settings-error').textContent = error.message;
  $('settings-error').hidden = false;
}

function download(text, type, filename) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

for (const kind of ['json', 'csv']) {
  $(`export-${kind}`).addEventListener('click', async () => {
    if (!storage || busy || editing) return;
    const hadFocus = document.activeElement === $(`export-${kind}`);
    setBusy(true);
    $('settings-error').hidden = true;
    try {
      const state = await storage.readState();
      const text = kind === 'json' ? JSON.stringify(createBackup(state), null, 2) + '\n' : createCSV(state);
      download(text, kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
        kind === 'json' ? 'phase-backup.json' : 'phase-observations.csv');
      announce('Download requested. Keep the unencrypted file somewhere secure.');
    } catch (error) {
      settingsError(error);
    } finally {
      setBusy(false);
      if (hadFocus) $(`export-${kind}`).focus();
    }
  });
}

function updateDataControls() {
  $('confirm-data').disabled = busy || !pendingData || pendingData.stale || !$('data-approval').checked;
}

function stateCounts(state) {
  const starts = startDates(state.records).length;
  return `${state.records.length} daily ${state.records.length === 1 ? 'observation' : 'observations'} ` +
    `(${starts} period ${starts === 1 ? 'start' : 'starts'}), ` +
    `${state.reviews.length} history ${state.reviews.length === 1 ? 'review' : 'reviews'}, ` +
    `${state.dismissals.length} check-in ${state.dismissals.length === 1 ? 'dismissal' : 'dismissals'}.`;
}

async function previewData(deleting) {
  if (!storage || busy || editing) return;
  setBusy(true);
  $('settings-error').hidden = true;
  try {
    let state;
    if (!deleting) {
      const file = $('import-file').files[0];
      if (!file) throw new Error('Choose a Phase JSON backup first.');
      state = parseBackup(await file.text());
    }
    const expected = await storage.readState();
    pendingData = { state, expected, deleting };
    $('data-heading').textContent = deleting ? 'Delete all Phase data?' : 'Replace diary with this backup?';
    $('data-help').textContent = deleting ?
      'This permanently deletes your saved diary from this browser, including history answers and dismissed check-ins. It clears Undo and cannot be undone. Downloaded files and other devices are unaffected.' :
      'This replaces your whole diary with the backup, including observations, period starts, history answers, and dismissed check-ins. It clears Undo and cannot be undone. Nothing changes until you confirm.';
    $('data-help').textContent += resetChannel ?
      ' Other open Phase tabs will reload and discard unsaved drafts.' :
      ' Close other Phase tabs to clear any diary data still shown there. Their old edits can no longer be restored.';
    $('data-current').textContent = `Currently saved: ${stateCounts(expected)}`;
    $('data-incoming').textContent = deleting ? '' : `Backup to restore: ${stateCounts(state)}`;
    $('data-approval-label').textContent = deleting ?
      'I understand that all saved Phase data will be permanently deleted.' :
      'I understand that the backup will replace my entire current diary.';
    $('confirm-data').textContent = deleting ? 'Permanently delete all data' : 'Replace diary';
    $('data-approval').checked = false;
    $('data-error').hidden = true;
    editing = true;
    $('data-editor').showModal();
  } catch (error) {
    pendingData = undefined;
    settingsError(error);
  } finally {
    $('import-file').value = '';
    setBusy(false);
    if ($('data-editor').open) $('data-approval').focus();
  }
}

$('preview-import').addEventListener('click', () => previewData(false));
$('delete-data').addEventListener('click', () => previewData(true));
$('data-approval').addEventListener('change', updateDataControls);
$('cancel-data').addEventListener('click', () => {
  if (!busy) $('data-editor').close();
});
$('data-editor').addEventListener('close', () => {
  const deleting = pendingData?.deleting;
  pendingData = undefined;
  editing = false;
  refreshUpdate();
  $('data-form').reset();
  for (const id of ['data-current', 'data-incoming', 'data-error']) $(id).textContent = '';
  updateDataControls();
  $(deleting ? 'delete-data' : 'preview-import').focus();
});

function clearDiaryMemory() {
  discardUndo();
  editorRequest++;
  original = selectedDate = returnFocus = pendingConflict = pendingBulk = pendingReview = undefined;
  bulkReturnAction = reviewReturnSpan = reviewReturnSection = undefined;
  selectedDates.clear();
  selectionMode = false;
  for (const id of ['day-form', 'bulk-form', 'review-form']) $(id).reset();
  for (const id of [
    'editor-heading', 'editor-current', 'editor-error', 'conflict-message', 'resolve-conflict',
    'bulk-preview', 'bulk-summary', 'bulk-error', 'review-heading', 'review-boundaries',
    'review-starts', 'review-existing', 'review-error', 'selection-error-message', 'settings-error'
  ]) $(id).replaceChildren();
  $('review-add-date').removeAttribute('min');
  $('review-add-date').removeAttribute('max');
  $('import-file').value = '';
  month = localToday().slice(0, 7);
}

$('data-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !pendingData || pendingData.stale || !$('data-approval').checked) return;
  setBusy(true);
  $('data-error').hidden = true;
  try {
    const { state, expected, deleting } = pendingData;
    const result = deleting ? await storage.deleteAll(expected) : await storage.replaceState(state, expected);
    clearDiaryMemory();
    applyState(result);
    // Drop the preview's recovery copy before announcing successful deletion or restore.
    pendingData = { deleting };
    resetChannel?.postMessage('reset');
    announce(deleting ? 'All saved Phase data deleted. Undo has been cleared.' :
      'Backup restored. Your diary was replaced and Undo has been cleared.');
    setBusy(false);
    $('data-editor').close();
  } catch (error) {
    if (error.code === 'STALE_RECORD') pendingData.stale = true;
    $('data-error').textContent = error.message;
    $('data-error').hidden = false;
    setBusy(false);
  }
});

renderRecords();
updateSelectionControls();
announce('Loading your diary...', true);
try {
  storage = await openStorage();
  applyState(await storage.readState());
  setBusy(false);
  announce('Local records ready.', true);
} catch (error) {
  storage = undefined;
  $('storage-error').textContent = `${error.message} Editing is unavailable. Your saved records are unchanged.`;
  $('storage-error').hidden = false;
  announce('');
}
