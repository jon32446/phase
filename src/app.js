import { dateLabel, localToday, monthDays, monthLabel, shiftMonth } from './dates.js';
import { BLEEDING_LABELS, supportsStart } from './records.js';
import { openStorage } from './storage.js';

const $ = (id) => document.getElementById(id);
const symbols = { none: '0', spotting: 'S', light: 'L', medium: 'M', heavy: 'H' };
let records = new Map();
let storage;
let month = localToday().slice(0, 7);
let selectedDate;
let original;
let returnFocus;
let editing = false;
let busy = false;
let pendingConflict;
let undo;
let undoTimer;
let editorRequest = 0;

function announce(message) {
  $('status').textContent = message;
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
    button.disabled = date > today;
    const number = document.createElement('span');
    number.textContent = String(Number(date.slice(-2)));
    const value = document.createElement('span');
    value.className = 'day-value';
    value.setAttribute('aria-hidden', 'true');
    value.textContent = `${record ? symbols[record.bleeding] : '-'}${record?.periodStart ? ' *' : ''}`;
    button.append(number, value);
    button.addEventListener('click', () => openEditor(date, { page: 'calendar', date }));
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
    button.textContent = `${dateLabel(record.date)} - ${BLEEDING_LABELS[record.bleeding]}`;
    button.addEventListener('click', () => openEditor(record.date, { page: 'history', date: record.date }));
    item.append(button);
    fragment.append(item);
  }
  $('history').replaceChildren(fragment);
  $('empty-history').hidden = starts.length > 0;
}

function renderRecords() {
  renderCalendar();
  renderHistory();
}

function applyRecord(date, record) {
  if (record) records.set(date, record);
  else records.delete(date);
  renderRecords();
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
  for (const control of $('day-form').elements) control.disabled = value;
  if (!value) $('clear-day').disabled = original === null;
  $('day-form').setAttribute('aria-busy', String(value));
  $('undo').disabled = value;
}

async function openEditor(date, focusTarget) {
  if (!storage || busy || editing || date > localToday()) return;
  const requestId = ++editorRequest;
  try {
    const latest = await storage.read(date);
    if (requestId !== editorRequest) return;
    original = latest;
    selectedDate = date;
    returnFocus = focusTarget;
    applyRecord(date, latest);
    editing = true;
    $('editor-heading').textContent = dateLabel(date);
    $('editor-current').textContent = latest ?
      `Recorded: ${BLEEDING_LABELS[latest.bleeding]}${latest.periodStart ? ', period start' : ''}.` :
      'Not recorded (unknown).';
    $('bleeding').value = latest?.bleeding ?? '';
    $('period-start').checked = latest?.periodStart ?? false;
    $('editor-error').hidden = true;
    clearConflict();
    setBusy(false);
    $('day-editor').showModal();
    $('bleeding').focus();
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
  clearConflict();
  const container = returnFocus?.page === 'history' ? $('history') : $('calendar');
  const target = [...container.querySelectorAll('button[data-date]')]
    .find((button) => button.dataset.date === returnFocus?.date);
  (target ?? document.querySelector('nav [aria-current="page"]')).focus();
});

$('day-editor').addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});

$('day-editor').addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [...$('day-form').elements]
    .filter((control) => !control.disabled && control.getClientRects().length > 0);
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

function offerConflict(record, message, action) {
  pendingConflict = { record };
  $('conflict-message').textContent = message;
  $('resolve-conflict').textContent = action;
  $('marker-conflict').hidden = false;
  $('resolve-conflict').focus();
}

function discardUndo() {
  clearTimeout(undoTimer);
  undo = undefined;
  const hadFocus = document.activeElement === $('undo');
  $('undo-bar').hidden = true;
  if (hadFocus) document.querySelector('nav [aria-current="page"]').focus();
}

function offerUndo(change) {
  discardUndo();
  undo = { ...change, expiresAt: Date.now() + 30000 };
  $('undo-description').textContent = `Changed ${dateLabel(change.date)}.`;
  $('undo-bar').hidden = false;
  undoTimer = setTimeout(discardUndo, 30000);
}

async function saveRecord(record) {
  if (busy) return;
  setBusy(true);
  $('editor-error').hidden = true;
  try {
    const change = await storage.replaceDay(selectedDate, record, original);
    applyRecord(change.date, change.next);
    if (change.changed) offerUndo(change);
    announce(change.changed ?
      `${record ? 'Saved' : 'Cleared'} ${dateLabel(change.date)}. Undo is available for 30 seconds.` :
      'No changes to save.');
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
  const bleeding = $('bleeding').value;
  if (!Object.hasOwn(BLEEDING_LABELS, bleeding)) {
    showEditorError('Choose a bleeding observation, or clear the day to leave it unknown.');
    $('bleeding').focus();
    return;
  }
  const record = { date: selectedDate, bleeding, periodStart: $('period-start').checked };
  if (record.periodStart && !supportsStart(bleeding)) {
    offerConflict({ ...record, periodStart: false },
      `Saving ${BLEEDING_LABELS[bleeding].toLowerCase()} conflicts with the selected period start. Remove the marker explicitly to save this observation, or keep editing.`,
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
  $('bleeding').focus();
});
for (const id of ['bleeding', 'period-start']) {
  $(id).addEventListener('change', () => {
    clearConflict();
    $('editor-error').hidden = true;
  });
}
$('cancel-editor').addEventListener('click', closeEditor);

$('undo').addEventListener('click', async () => {
  if (busy || editing || !undo) return;
  if (Date.now() >= undo.expiresAt) {
    discardUndo();
    announce('Undo has expired.');
    return;
  }
  const change = undo;
  busy = true;
  $('undo').disabled = true;
  try {
    await storage.replaceDay(change.date, change.previous, change.next);
    applyRecord(change.date, change.previous);
    discardUndo();
    announce(`Undid the edit to ${dateLabel(change.date)}.`);
  } catch (error) {
    announce(error.message);
  } finally {
    busy = false;
    $('undo').disabled = false;
  }
});

for (const button of document.querySelectorAll('nav [data-page]')) {
  button.addEventListener('click', () => {
    editorRequest++;
    for (const navButton of document.querySelectorAll('nav [data-page]')) {
      if (navButton === button) navButton.setAttribute('aria-current', 'page');
      else navButton.removeAttribute('aria-current');
      $(`${navButton.dataset.page}-page`).hidden = navButton !== button;
    }
  });
}
for (const [id, amount] of [['previous-month', -1], ['next-month', 1]]) {
  $(id).addEventListener('click', () => {
    month = shiftMonth(month, amount);
    renderCalendar();
  });
}
$('today').addEventListener('click', () => {
  month = localToday().slice(0, 7);
  renderCalendar();
  $('calendar').querySelector('[aria-current="date"]')?.focus();
});

renderRecords();
announce('Loading local records...');
try {
  storage = await openStorage();
  records = new Map((await storage.read()).map((record) => [record.date, record]));
  renderRecords();
  announce('Local records ready.');
} catch (error) {
  storage = undefined;
  $('storage-error').textContent = `${error.message} Editing is unavailable; no saved records have been changed.`;
  $('storage-error').hidden = false;
  announce('');
}
