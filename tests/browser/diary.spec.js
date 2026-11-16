import { test, expect } from '@playwright/test';

const FIXED_TIME = new Date('2026-11-08T12:00:00Z');
const day = (page, date) => page.locator(`#calendar button[data-date="${date}"]`);
const editor = (page) => page.getByRole('dialog');

async function start(page, path = '/') {
  await page.clock.install({ time: FIXED_TIME });
  await page.goto(path);
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
}

async function edit(page, date, bleeding, periodStart = false) {
  await day(page, date).click();
  await expect(editor(page)).toBeVisible();
  await page.getByLabel('Bleeding', { exact: true }).selectOption(bleeding);
  await page.getByLabel('Period started this day').setChecked(periodStart);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
}

async function storedRecords(page) {
  return page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const store = await openStorage();
    try {
      return await store.read();
    } finally {
      store.db.close();
    }
  });
}

async function selectDays(page, dates) {
  await page.getByRole('button', { name: 'Select days', exact: true }).click();
  for (const date of dates) await day(page, date).click();
}

async function previewBulk(page, action) {
  await page.locator(`[data-bulk-action="${action}"]`).click();
  await expect(page.locator('#bulk-editor')).toBeVisible();
}

async function applyBulk(page, action) {
  await page.locator(`[data-bulk-action="${action}"]`).click();
  await expect(page.locator('#status')).toHaveText(/Saved batch:|No changes to save/);
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
}

for (const path of ['/', '/phase/']) {
  test(`diary persists observations and marker corrections under ${path}`, async ({ page }) => {
    await start(page, path);
    await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Not recorded/);
    await expect(day(page, '2026-11-09')).toBeDisabled();
    await expect(day(page, '2026-11-09')).toHaveAccessibleName(/future date, view-only/);
    await edit(page, '2026-11-02', 'none');
    await edit(page, '2026-11-03', 'spotting');
    await edit(page, '2026-11-04', 'medium', true);
    await expect(day(page, '2026-11-01')).toHaveAccessibleName(/Not recorded/);
    await expect(day(page, '2026-11-05')).toHaveAccessibleName(/Not recorded/);
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('Local records ready.');
    await expect(day(page, '2026-11-02')).toHaveAccessibleName(/None/);
    await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Spotting/);
    await expect(day(page, '2026-11-04')).toHaveAccessibleName(/Medium, period start/);
    await expect(page.getByRole('button', { name: 'Undo last edit' })).not.toBeVisible();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    const historyDate = page.locator('#history button');
    await expect(historyDate).toHaveCount(1);
    await historyDate.click();
    await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor(page)).not.toBeVisible();
    await expect(page.locator('#history button')).toHaveText(/Light/);
    await expect(page.locator('#history button')).toBeFocused();
    expect(await storedRecords(page)).toEqual([
      { date: '2026-11-02', bleeding: 'none', periodStart: false },
      { date: '2026-11-03', bleeding: 'spotting', periodStart: false },
      { date: '2026-11-04', bleeding: 'light', periodStart: true }
    ]);
  });
}

test('start conflicts require explicit resolution and Undo restores both fields', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'heavy', true);
  await day(page, '2026-11-02').click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('spotting');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove period start and save' })).toBeFocused();
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'heavy', periodStart: true }
  ]);
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Bleeding', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Remove period start and save' }).click();
  await expect(editor(page)).not.toBeVisible();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Spotting$/);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toHaveText(/Undid/);
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Heavy, period start/);
  await page.reload();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Heavy, period start/);
});

test('clearing a start asks explicitly and Undo restores the record', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'light', true);
  await day(page, '2026-11-02').click();
  await page.getByRole('button', { name: "Clear day's record" }).click();
  await expect(page.getByRole('button', { name: 'Remove observation and period start' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Light, period start/);
  await day(page, '2026-11-02').click();
  await page.getByRole('button', { name: "Clear day's record" }).click();
  await page.getByRole('button', { name: 'Remove observation and period start' }).click();
  await expect(editor(page)).not.toBeVisible();
  expect(await storedRecords(page)).toEqual([]);
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Not recorded/);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Light, period start/);
});

test('ordinary clear persists unknown, and Undo of creation removes only that day', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'none');
  await edit(page, '2026-11-03', 'heavy');
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Not recorded/);
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/None/);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).not.toBeVisible();
  await day(page, '2026-11-02').click();
  await page.getByRole('button', { name: "Clear day's record" }).click();
  await expect(editor(page)).not.toBeVisible();
  await page.reload();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Not recorded/);
  expect(await storedRecords(page)).toEqual([]);
});

test('Undo survives elapsed time, navigation, cancelled and unchanged edits', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'medium');
  await day(page, '2026-11-03').click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
  await edit(page, '2026-11-02', 'medium');
  await expect(page.getByRole('status')).toHaveText('No changes to save.');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.clock.fastForward(3600000);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Not recorded/);
});

test('aborted saves preserve committed data, the draft, and the previous Undo', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'medium', true);
  await day(page, '2026-11-02').click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('heavy');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args);
      if (this.name === 'days') this.transaction.abort();
      return result;
    };
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#editor-error')).toHaveText(/not saved/);
  await expect(editor(page)).toBeVisible();
  await expect(page.getByLabel('Bleeding', { exact: true })).toHaveValue('heavy');
  await expect(page.getByLabel('Period started this day')).toBeChecked();
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'medium', periodStart: true }
  ]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Not recorded/);
});

test('quota failure is visible and a failed Undo does not report success', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'light');
  await edit(page, '2026-11-02', 'heavy');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'days') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toHaveText(/storage is full.*not saved/);
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Heavy/);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).toBeVisible();
  await page.evaluate(() => window.restorePut());
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Light/);
});

test('stale edits and Undo do not overwrite another tab-like change', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'light');
  await day(page, '2026-11-02').click();
  await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const store = await openStorage();
    await store.replaceDay('2026-11-02',
      { date: '2026-11-02', bleeding: 'medium', periodStart: true },
      await store.read('2026-11-02'));
    store.db.close();
  });
  await page.getByLabel('Bleeding', { exact: true }).selectOption('heavy');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#editor-error')).toHaveText(/changed elsewhere/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toHaveText(/changed elsewhere/);
  await day(page, '2026-11-02').click();
  await expect(page.getByLabel('Bleeding', { exact: true })).toHaveValue('medium');
  await expect(page.getByLabel('Period started this day')).toBeChecked();
});

test('unavailable storage fails visibly without offering successful edits', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined });
  });
  await page.goto('/');
  await expect(page.locator('#storage-error')).toHaveText(/unavailable.*Editing is unavailable/);
  await day(page, '2026-11-02').click();
  await expect(editor(page)).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last edit' })).not.toBeVisible();
});

test('opening blocked storage reports the problem', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'medium');
  await page.addInitScript(() => {
    indexedDB.open = () => {
      const request = {};
      setTimeout(() => request.onblocked(), 0);
      return request;
    };
  });
  await page.reload();
  await expect(page.locator('#storage-error')).toHaveText(/Another tab.*reload/);
  await expect(editor(page)).not.toBeVisible();
});

test('today uses the local calendar date rather than the UTC date', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-08T22:30:00Z') });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await expect(day(page, '2026-11-09')).toHaveAttribute('aria-current', 'date');
  await expect(day(page, '2026-11-09')).toBeEnabled();
  await expect(day(page, '2026-11-10')).toBeDisabled();
});

test('historical month navigation is Monday-first and Today returns to local today', async ({ page }) => {
  await start(page);
  await expect(page.locator('#calendar > span')).toHaveCount(6);
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('#month-heading')).toHaveText('October 2026');
  await edit(page, '2026-10-01', 'medium', true);
  await page.reload();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(day(page, '2026-10-01')).toHaveAccessibleName(/Medium, period start/);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(day(page, '2026-11-08')).toBeFocused();
});

test('day editor works by keyboard, contains focus, and returns it on Escape and save', async ({ page }) => {
  await start(page);
  await day(page, '2026-11-02').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Bleeding', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor-error')).toHaveText(/Choose a bleeding observation/);
  await expect(page.getByLabel('Bleeding', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor(page)).not.toBeVisible();
  await expect(day(page, '2026-11-02')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('m');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Period started this day')).toBeFocused();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Bleeding', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).not.toBeVisible();
  await expect(day(page, '2026-11-02')).toBeFocused();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Medium, period start/);
});

test('runtime requests contain only static assets, no health data or external resources', async ({ page, baseURL }) => {
  const requests = [];
  const violations = [];
  const errors = [];
  page.on('request', (request) => requests.push({ url: request.url(), body: request.postData() }));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.cspViolations.push(event.violatedDirective);
    });
  });
  await start(page, '/phase/');
  await edit(page, '2026-11-02', 'heavy', true);
  await selectDays(page, ['2026-11-02', '2026-11-03']);
  await previewBulk(page, 'spotting');
  await page.locator('#bulk-preview input').check();
  await page.getByRole('button', { name: 'Save batch' }).click();
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.locator('#open-span button').click();
  await page.getByLabel('Start-history completeness').selectOption('missing');
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.locator('#review-editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.locator('#export-json').click();
  await download;
  const backup = await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      return JSON.stringify({ format: 'phase-backup', version: 1, ...await storage.readState() });
    } finally {
      storage.db.close();
    }
  });
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(backup)
  });
  await page.locator('#preview-import').click();
  await page.locator('#data-approval').check();
  await page.locator('#confirm-data').click();
  await expect(page.locator('#status')).toHaveText(/Backup restored/);
  await page.locator('#delete-data').click();
  await page.locator('#data-approval').check();
  await page.locator('#confirm-data').click();
  await expect(page.locator('#status')).toHaveText(/All saved Phase data deleted/);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  violations.push(...await page.evaluate(() => window.cspViolations));
  expect(errors).toEqual([]);
  expect(violations).toEqual([]);
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe(new URL(baseURL).origin);
    expect(url.pathname).toMatch(/^\/phase\/(?:index\.html|styles\.css|sw\.js|manifest\.webmanifest|icon\.svg|src\/(?:app|offline|dates|records|storage|history|predictions|backup)\.js)?$/);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(request.body).toBeNull();
  }
  expect(page.url()).toBe(`${baseURL}/phase/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(names.map(async (name) => ({
      name, urls: (await (await caches.open(name)).keys()).map((request) => request.url)
    })));
  });
  expect(cached).toHaveLength(1);
  for (const { name, urls } of cached) {
    expect(name).toContain('/phase/:');
    expect(urls).toHaveLength(13);
    for (const url of urls) {
      expect(url).toMatch(/\/phase\/(?:index\.html|styles\.css|manifest\.webmanifest|icon\.svg|src\/(?:app|offline|dates|records|storage|history|predictions|backup)\.js)?$/);
    }
  }
});

test('mobile/touch controls fit the viewport and editor supports a touch workflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const locator of [day(page, '2026-11-02'), page.getByRole('button', { name: 'Calendar', exact: true })]) {
    const box = await locator.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  if (test.info().project.name === 'mobile-chromium') await day(page, '2026-11-02').tap();
  else await day(page, '2026-11-02').click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
  if (test.info().project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Save', exact: true }).tap();
  } else await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Light$/);
});

for (const path of ['/', '/phase/']) {
  test(`cross-month selection applies mixed values without a modal and undoes under ${path}`, async ({ page }) => {
    await start(page, path);
    await edit(page, '2026-11-02', 'none');
    await edit(page, '2026-11-03', 'medium', true);
    await selectDays(page, ['2026-11-02', '2026-11-03']);
    await expect(page.locator('#selection-count')).toHaveText('2 days selected');
    await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Medium, period start/);
    await expect(day(page, '2026-11-03')).toHaveAttribute('aria-pressed', 'true');
    await expect(day(page, '2026-11-03').locator('.day-selection')).toHaveText('x');
    await expect(day(page, '2026-11-09')).toBeDisabled();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await day(page, '2026-10-31').click();
    await expect(page.locator('#selection-count')).toHaveText('3 days selected');
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(day(page, '2026-11-02')).toHaveAttribute('aria-pressed', 'true');
    await expect(day(page, '2026-11-03')).toHaveAttribute('aria-pressed', 'true');
    await applyBulk(page, 'heavy');
    await expect(page.locator('#selection-bar')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Select days', exact: true })).toBeFocused();
    expect(await storedRecords(page)).toEqual([
      { date: '2026-10-31', bleeding: 'heavy', periodStart: false },
      { date: '2026-11-02', bleeding: 'heavy', periodStart: false },
      { date: '2026-11-03', bleeding: 'heavy', periodStart: true }
    ]);
    await page.getByRole('button', { name: 'Undo last edit' }).click();
    await expect(page.getByRole('status')).toHaveText('Undid the batch edit to 3 days.');
    expect(await storedRecords(page)).toEqual([
      { date: '2026-11-02', bleeding: 'none', periodStart: false },
      { date: '2026-11-03', bleeding: 'medium', periodStart: true }
    ]);
    await page.reload();
    await expect(day(page, '2026-11-02')).toHaveAccessibleName(/None/);
    await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Medium, period start/);
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(day(page, '2026-10-31')).toHaveAccessibleName(/Not recorded/);
  });
}

for (const action of ['none', 'spotting', 'clear']) {
  test(`bulk ${action} requires separate approval for every start and Undo restores markers`, async ({ page }) => {
    await start(page);
    await edit(page, '2026-11-02', 'medium', true);
    await edit(page, '2026-11-03', 'heavy', true);
    const before = await storedRecords(page);
    await selectDays(page, ['2026-11-02', '2026-11-03', '2026-11-04']);
    await previewBulk(page, action);
    await expect(page.locator('#bulk-editor')).toHaveAccessibleName('Resolve period-start conflicts');
    await expect(page.locator('#bulk-preview li')).toHaveCount(2);
    await expect(page.locator('#bulk-preview li[data-date="2026-11-04"]')).toHaveCount(0);
    await expect(page.locator('#bulk-summary')).toContainText('for 3 days. 2 period starts');
    const approvals = page.locator('#bulk-preview input');
    await expect(approvals).toHaveCount(2);
    await expect(approvals.first()).toHaveAccessibleName(/Remove period start on/);
    await expect(approvals.first()).toBeFocused();
    await expect(page.getByRole('button', { name: 'Save batch' })).toBeDisabled();
    await approvals.first().check();
    await expect(page.getByRole('button', { name: 'Save batch' })).toBeDisabled();
    expect(await storedRecords(page)).toEqual(before);
    await page.getByRole('button', { name: 'Back to selection' }).click();
    await expect(page.locator('#bulk-editor')).not.toBeVisible();
    await expect(page.locator(`[data-bulk-action="${action}"]`)).toBeFocused();
    await expect(page.locator('#selection-count')).toHaveText('3 days selected');
    await previewBulk(page, action);
    await expect(approvals.first()).not.toBeChecked();
    await approvals.first().check();
    await approvals.last().check();
    await page.getByRole('button', { name: 'Save batch' }).click();
    await expect(page.locator('#bulk-editor')).not.toBeVisible();
    const after = await storedRecords(page);
    expect(after).toEqual(action === 'clear' ? [] :
      ['2026-11-02', '2026-11-03', '2026-11-04'].map((date) => ({
        date, bleeding: action, periodStart: false
      })));
    await page.getByRole('button', { name: 'Undo last edit' }).click();
    expect(await storedRecords(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Undo last edit' })).not.toBeVisible();
  });
}

test('aborting a batch after a write rolls everything back and retains selection and previous Undo', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'light', true);
  await edit(page, '2026-11-03', 'none');
  const before = await storedRecords(page);
  const previousUndo = await page.locator('#undo-description').textContent();
  await selectDays(page, ['2026-11-02', '2026-11-03', '2026-11-04']);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args);
      if (this.name === 'days' && ++writes === 2) this.transaction.abort();
      return result;
    };
  });
  await page.locator('[data-bulk-action="heavy"]').click();
  await expect(page.locator('#selection-error-message')).toHaveText(/not saved/);
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  expect(await storedRecords(page)).toEqual(before);
  await expect(page.locator('#undo-description')).toHaveText(previousUndo);
  await expect(page.locator('[data-bulk-action="heavy"]')).toBeEnabled();
  await expect(page.locator('#selection-count')).toHaveText('3 days selected');
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Light, period start/);
  await expect(day(page, '2026-11-04')).toHaveAccessibleName(/Not recorded/);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'light', periodStart: true }
  ]);
});

test('a failed batch Undo is atomic and can be retried while available', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'light', true);
  await edit(page, '2026-11-03', 'none');
  const before = await storedRecords(page);
  await selectDays(page, ['2026-11-02', '2026-11-03']);
  await applyBulk(page, 'heavy');
  const after = await storedRecords(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => { IDBObjectStore.prototype.put = put; };
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args);
      if (this.name === 'days' && ++writes === 2) this.transaction.abort();
      return result;
    };
  });
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toHaveText(/not saved/);
  expect(await storedRecords(page)).toEqual(after);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).toBeVisible();
  await page.evaluate(() => window.restorePut());
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toHaveText(/Undid the batch/);
  expect(await storedRecords(page)).toEqual(before);
});

test('a stale selected day prevents both partial saves and partial Undo', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'light');
  await edit(page, '2026-11-03', 'medium', true);
  await selectDays(page, ['2026-11-02', '2026-11-03']);
  const externalEdit = (bleeding) => page.evaluate(async (value) => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const store = await openStorage();
    await store.replaceDay('2026-11-03',
      { date: '2026-11-03', bleeding: value, periodStart: true },
      await store.read('2026-11-03'));
    store.db.close();
  }, bleeding);
  await externalEdit('heavy');
  await page.locator('[data-bulk-action="medium"]').click();
  await expect(page.locator('#selection-error-message')).toHaveText(/changed elsewhere/);
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Medium, period start/);
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'light', periodStart: false },
    { date: '2026-11-03', bleeding: 'heavy', periodStart: true }
  ]);
  await page.getByRole('button', { name: 'Refresh calendar records' }).click();
  await expect(page.getByRole('status')).toHaveText(/Calendar records refreshed.*Review selected days/);
  await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Heavy, period start/);
  await expect(page.locator('#selection-count')).toHaveText('2 days selected');
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'light', periodStart: false },
    { date: '2026-11-03', bleeding: 'heavy', periodStart: true }
  ]);
  await applyBulk(page, 'medium');
  await externalEdit('light');
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toHaveText(/changed elsewhere/);
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'medium', periodStart: false },
    { date: '2026-11-03', bleeding: 'light', periodStart: true }
  ]);
});

test('unchanged batches and cancelled conflicts preserve session-only Undo', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'medium', true);
  await edit(page, '2026-11-03', 'medium', true);
  const previousUndo = await page.locator('#undo-description').textContent();
  await selectDays(page, ['2026-11-02', '2026-11-03']);
  await previewBulk(page, 'none');
  await page.keyboard.press('Escape');
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  await applyBulk(page, 'medium');
  await expect(page.getByRole('status')).toHaveText('No changes to save.');
  await expect(page.locator('#undo-description')).toHaveText(previousUndo);
  await page.clock.fastForward(30001);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(day(page, '2026-11-03')).toHaveAccessibleName(/Not recorded/);
  expect(await storedRecords(page)).toHaveLength(1);
});

test('selection, conflicts, and direct saves support keyboard and touch', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await start(page);
  await edit(page, '2026-11-02', 'medium', true);
  await page.getByRole('button', { name: 'Select days', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cancel selection' })).toBeFocused();
  await expect(page.locator('[data-bulk-action="light"]')).toBeDisabled();
  await day(page, '2026-11-02').focus();
  await page.keyboard.press('Space');
  await expect(day(page, '2026-11-02')).toHaveAttribute('aria-pressed', 'true');
  await expect(day(page, '2026-11-02')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(day(page, '2026-11-02')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#selection-count')).toHaveText('0 days selected');
  if (test.info().project.name === 'mobile-chromium') await day(page, '2026-11-02').tap();
  else await day(page, '2026-11-02').click();
  const box = await page.locator('#selection-bar').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(641);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-bulk-action="none"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#bulk-preview input')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back to selection' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#bulk-preview input')).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Save batch' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  await expect(page.locator('[data-bulk-action="none"]')).toBeFocused();
  await page.getByRole('button', { name: 'Cancel selection' }).click();
  await expect(page.getByRole('button', { name: 'Select days', exact: true })).toBeFocused();
  await selectDays(page, ['2026-11-02']);
  if (test.info().project.name === 'mobile-chromium') await page.locator('[data-bulk-action="light"]').tap();
  else {
    await page.locator('[data-bulk-action="light"]').focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('status')).toHaveText(/Saved batch: 1 day changed/);
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Select days', exact: true })).toBeFocused();
  await selectDays(page, ['2026-11-02']);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#selection-bar')).not.toBeVisible();
  await expect(day(page, '2026-11-02')).not.toHaveAttribute('aria-pressed', 'true');
  await day(page, '2026-11-02').click();
  await expect(page.locator('#day-editor')).toBeVisible();
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'light', periodStart: true }
  ]);
});

test('clearing observations without starts saves directly and can be undone', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'none');
  await edit(page, '2026-11-03', 'medium');
  const before = await storedRecords(page);
  await selectDays(page, ['2026-11-02', '2026-11-03', '2026-11-04']);
  await applyBulk(page, 'clear');
  expect(await storedRecords(page)).toEqual([]);
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Not recorded/);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await storedRecords(page)).toEqual(before);
});

test('a start added elsewhere is not silently removed by a direct action', async ({ page }) => {
  await start(page);
  await selectDays(page, ['2026-11-02']);
  await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const store = await openStorage();
    await store.replaceDay('2026-11-02',
      { date: '2026-11-02', bleeding: 'medium', periodStart: true }, null);
    store.db.close();
  });
  await page.locator('[data-bulk-action="spotting"]').click();
  await expect(page.locator('#selection-error-message')).toHaveText(/changed elsewhere/);
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  expect(await storedRecords(page)).toEqual([
    { date: '2026-11-02', bleeding: 'medium', periodStart: true }
  ]);
  await page.getByRole('button', { name: 'Refresh calendar records' }).click();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Medium, period start/);
  await previewBulk(page, 'spotting');
  await expect(page.getByRole('button', { name: 'Save batch' })).toBeDisabled();
});
