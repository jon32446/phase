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

test('Undo expires after 30 seconds; cancelled and unchanged edits do not replace it', async ({ page }) => {
  await start(page);
  await edit(page, '2026-11-02', 'medium');
  await day(page, '2026-11-03').click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor(page)).not.toBeVisible();
  await edit(page, '2026-11-02', 'medium');
  await expect(page.getByRole('status')).toHaveText('No changes to save.');
  await page.clock.fastForward(30001);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).not.toBeVisible();
  await expect(day(page, '2026-11-02')).toHaveAccessibleName(/Medium/);
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

test('runtime requests contain only static assets, no health data or external resources', async ({ page }) => {
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
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  violations.push(...await page.evaluate(() => window.cspViolations));
  expect(errors).toEqual([]);
  expect(violations).toEqual([]);
  for (const request of requests) {
    const url = new URL(request.url);
    expect(url.origin).toBe('http://127.0.0.1:4173');
    expect(url.pathname).toMatch(/^\/phase\/(?:index\.html|styles\.css|src\/(?:app|dates|records|storage)\.js)?$/);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(request.body).toBeNull();
  }
  expect(page.url()).toBe('http://127.0.0.1:4173/phase/');
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
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
