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
let selectionMode = false;
const selectedDates = new Set();
let pendingBulk;
let bulkReturnAction;

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
    button.disabled = date > today || busy;
    if (selectionMode) button.setAttribute('aria-pressed', String(selectedDates.has(date)));
    const number = document.createElement('span');
    number.textContent = String(Number(date.slice(-2)));
    const value = document.createElement('span');
    value.className = 'day-value';
    value.setAttribute('aria-hidden', 'true');
    value.textContent = `${record ? symbols[record.bleeding] : '-'}${record?.periodStart ? ' *' : ''}`;
    button.append(number, value);
    if (selectionMode && selectedDates.has(date)) {
      const marker = document.createElement('span');
      marker.className = 'day-selection';
      marker.textContent = 'x';
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
  applyChanges([{ date, next: record }]);
}

function applyChanges(changes) {
  for (const change of changes) {
    if (change.next) records.set(change.date, change.next);
    else records.delete(change.date);
  }
  renderRecords();
}

function updateSelectionControls() {
  $('select-days').hidden = selectionMode;
  $('select-days').disabled = !storage || busy;
  $('selection-bar').hidden = !selectionMode;
  const count = selectedDates.size;
  $('selection-count').textContent = `${count} ${count === 1 ? 'day' : 'days'} selected`;
  for (const button of document.querySelectorAll('[data-bulk-action]')) {
    button.disabled = busy || count === 0;
  }
  $('cancel-selection').disabled = busy;
  $('refresh-records').disabled = busy;
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
  for (const id of ['day-form', 'bulk-form']) {
    for (const control of $(id).elements) control.disabled = value;
    $(id).setAttribute('aria-busy', String(value));
  }
  if (!value) $('clear-day').disabled = original == null;
  $('undo').disabled = value;
  for (const button of document.querySelectorAll('nav button')) button.disabled = value;
  for (const button of $('calendar').querySelectorAll('button')) {
    button.disabled = value || button.dataset.date > localToday();
  }
  updateSelectionControls();
  updateBulkCommit();
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

for (const [dialog, form] of [['day-editor', 'day-form'], ['bulk-editor', 'bulk-form']]) {
  $(dialog).addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  $(dialog).addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...$(form).elements]
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
}

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

function offerUndo(changes) {
  discardUndo();
  undo = { changes, expiresAt: Date.now() + 30000 };
  $('undo-description').textContent = changes.length === 1 ?
    `Changed ${dateLabel(changes[0].date)}.` : `Changed ${changes.length} days.`;
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
    if (change.changed) offerUndo([change]);
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
    after.textContent = `After: ${recordSummary(change.next)}; period start will be removed only with your approval`;
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
    const changes = await storage.replaceDays(edits);
    applyChanges(changes);
    const changed = changes.filter((change) => change.changed);
    if (changed.length > 0) offerUndo(changed);
    announce(changed.length > 0 ?
      `Saved batch: ${changed.length} ${changed.length === 1 ? 'day' : 'days'} changed. Undo is available for 30 seconds.` :
      'No changes to save.');
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
    records = new Map((await storage.read()).map((record) => [record.date, record]));
    renderRecords();
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
  announce('Select dates across months, then choose a bleeding value or clear observations.');
  $('cancel-selection').focus();
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

$('undo').addEventListener('click', async () => {
  if (busy || editing || !undo) return;
  if (Date.now() >= undo.expiresAt) {
    discardUndo();
    announce('Undo has expired.');
    return;
  }
  const { changes } = undo;
  setBusy(true);
  try {
    const restored = await storage.replaceDays(changes.map((change) => ({
      date: change.date, next: change.previous, expected: change.next
    })));
    applyChanges(restored);
    discardUndo();
    announce(changes.length === 1 ?
      `Undid the edit to ${dateLabel(changes[0].date)}.` :
      `Undid the batch edit to ${changes.length} days.`);
  } catch (error) {
    announce(error.message);
  } finally {
    setBusy(false);
  }
});

for (const button of document.querySelectorAll('nav [data-page]')) {
  button.addEventListener('click', () => {
    if (busy) return;
    editorRequest++;
    if (button.dataset.page !== 'calendar' && selectionMode) {
      cancelSelection();
      announce('Selection cancelled. No records changed.');
    }
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
updateSelectionControls();
announce('Loading local records...');
try {
  storage = await openStorage();
  records = new Map((await storage.read()).map((record) => [record.date, record]));
  renderRecords();
  updateSelectionControls();
  announce('Local records ready.');
} catch (error) {
  storage = undefined;
  $('storage-error').textContent = `${error.message} Editing is unavailable; no saved records have been changed.`;
  $('storage-error').hidden = false;
  announce('');
}
