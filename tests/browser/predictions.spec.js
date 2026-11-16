import { test, expect } from '@playwright/test';

const NOW = new Date('2026-11-08T12:00:00Z');
const REGULAR = ['2026-07-01', '2026-07-29', '2026-08-26', '2026-09-23', '2026-10-21'];
const LONG = ['2026-06-11', '2026-07-09', '2026-08-06', '2026-09-03', '2026-10-21'];
const gap = 'span:2026-09-03/2026-10-21';
const card = (page, id = gap) => page.locator(`.checkin-card[data-checkin-id="${id}"]`);

async function state(page) {
  return page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      return await storage.readState();
    } finally {
      storage.db.close();
    }
  });
}

async function ready(page, dates = REGULAR, path = '/') {
  await page.clock.install({ time: NOW });
  await page.goto(path);
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await page.evaluate(async (dates) => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      await storage.replaceDays(dates.map((date) => ({
        date, next: { date, bleeding: 'medium', periodStart: true }, expected: null
      })));
    } finally {
      storage.db.close();
    }
  }, dates);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
}

async function history(page) {
  await page.getByRole('button', { name: 'History', exact: true }).click();
}

async function answer(page, value) {
  await page.locator(`#review-answer input[value="${value}"]`).check();
  if (await page.locator('#review-replacement').isVisible()) await page.locator('#review-replace').check();
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.locator('#review-editor')).not.toBeVisible();
}

for (const path of ['/', '/phase/']) {
  test(`provisional sparse history produces an honest range without network health data under ${path}`, async ({ page, baseURL }) => {
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push({ url: request.url(), data: request.postData() }));
    page.on('pageerror', (error) => errors.push(error.message));
    await ready(page, REGULAR, path);
    await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'available');
    await expect(page.locator('#estimate-text')).toHaveText('16 – 20 Nov 2026');
    await expect(page.locator('#estimate-method')).toContainText('4 usable intervals among the latest six, including 4 provisional');
    await expect(page.locator('#estimate-method')).toContainText("We haven't established how reliably this range predicts a period start");
    await expect(page.locator('#estimate-method')).toContainText('Do not use it for contraception');
    expect((await state(page)).records).toHaveLength(5);
    expect((await state(page)).reviews).toEqual([]);
    await page.clock.fastForward(13 * 86400000);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'passed');
    await expect(page.locator('#estimate-text')).toHaveText('16 – 20 Nov 2026');
    await expect(page.locator('#estimate-note')).toContainText('window has passed');
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('Local records ready.');
    await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'passed');
    expect((await state(page)).records).toHaveLength(5);
    expect(errors).toEqual([]);
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.origin).toBe(new URL(baseURL).origin);
      expect(url.pathname).toMatch(/^\/(?:phase\/)?(?:index\.html|styles\.css|sw\.js|manifest\.webmanifest|icon\.svg|src\/(?:app|offline|dates|records|storage|history|predictions|backup)\.js)?$/);
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
      expect(request.data).toBeNull();
    }
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const cachedURLs = await page.evaluate(async () => {
      const entries = await Promise.all((await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).map((request) => request.url)));
      return entries.flat();
    });
    expect(cachedURLs).toHaveLength(13);
    for (const url of cachedURLs) {
      expect(url).toMatch(/\/(?:phase\/)?(?:index\.html|styles\.css|manifest\.webmanifest|icon\.svg|src\/(?:app|offline|dates|records|storage|history|predictions|backup)\.js)?$/);
    }
  });
}

test('a detected historical gap blocks forecasts; confirmation keeps its actual long length and is undoable', async ({ page }) => {
  await ready(page, LONG);
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
  await page.getByRole('button', { name: 'View history', exact: true }).click();
  await expect(page.locator('#checkins-heading')).toBeFocused();
  await expect(card(page)).toHaveAttribute('data-reason', 'long');
  await expect(card(page)).toContainText('48 days');
  await card(page).getByText('Why this question?', { exact: true }).click();
  await expect(card(page)).toContainText('over 42 days');
  await expect(card(page)).toContainText('It cannot establish whether another period occurred or assess your health');
  await expect(page.locator('#intervals li[data-status="unresolved"]')).toHaveCount(1);
  const before = await state(page);
  await card(page).getByRole('button', { name: /^Check history:/ }).click();
  await answer(page, 'complete');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#intervals li[data-status="complete"]')).toHaveCount(1);
  await expect(page.locator('#cycle-summary')).toContainText('28-48 days');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#estimate-text')).toHaveText('16 Nov – 10 Dec 2026');
  expect((await state(page)).records).toEqual(before.records);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
  expect(await state(page)).toEqual(before);
});

test('known-missing completed gaps are excluded; Unsure stays blocking without renewed automatic prompts', async ({ page }) => {
  await ready(page, LONG);
  await history(page);
  await card(page).getByRole('button', { name: /^Check history:/ }).click();
  await answer(page, 'missing');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#estimate-method')).toContainText('3 usable intervals');
  await expect(page.locator('#estimate-text')).toHaveText('16 – 20 Nov 2026');
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await history(page);
  await card(page).getByRole('button', { name: /^Check history:/ }).click();
  await answer(page, 'unsure');
  await expect(card(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
  await history(page);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#history-reviews')).toContainText('Unsure');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('dismissal persists without resolving history or replacing the previous ordinary Undo', async ({ page }) => {
  await ready(page, LONG);
  await page.locator('#calendar button[data-date="2026-11-02"]').click();
  await page.getByRole('radio', { name: 'No bleeding', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  const description = await page.locator('#undo-description').textContent();
  await history(page);
  await card(page).getByRole('button', { name: 'Dismiss check-in', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#undo-description')).toHaveText(description);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect((await state(page)).records).toHaveLength(5);
  expect((await state(page)).reviews).toEqual([]);
  expect((await state(page)).dismissals).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
  await history(page);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#intervals li[data-status="unresolved"]')).toHaveCount(1);
});

test('open-span check-ins do not regenerate daily after dismissal; complete answers have a seven-day cooldown', async ({ page }) => {
  await ready(page);
  await page.clock.setSystemTime(new Date('2026-12-03T12:00:00Z'));
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
  await history(page);
  const id = 'open:2026-10-21';
  await expect(card(page, id)).toHaveAttribute('data-reason', 'long');
  await card(page, id).getByRole('button', { name: 'Dismiss check-in', exact: true }).click();
  await expect(card(page, id)).toHaveCount(0);
  await page.clock.fastForward(86400000);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await history(page);
  await expect(card(page, id)).toHaveCount(0);
  await page.locator('#open-span button').click();
  await answer(page, 'complete');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'passed');
  await page.clock.fastForward(6 * 86400000);
  await history(page);
  await expect(card(page, id)).toHaveCount(0);
  await page.clock.fastForward(86400000);
  await history(page);
  await expect(card(page, id)).toHaveAttribute('data-reason', 'long');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
});

test('start corrections clear obsolete dismissal context and Undo restores it atomically', async ({ page }) => {
  await ready(page, LONG);
  await history(page);
  await card(page).getByRole('button', { name: 'Dismiss check-in', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
  const original = await state(page);
  await page.locator('#intervals button[data-span="2026-09-03/2026-10-21"]').click();
  await page.getByText('Remember a missing start date?', { exact: true }).click();
  await page.getByLabel('Remembered start date').fill('2026-10-01');
  await page.getByRole('button', { name: 'Add a remembered start', exact: true }).click();
  await expect(page.locator('#day-editor')).toBeVisible();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete;
    window.restoreDelete = () => { IDBObjectStore.prototype.delete = remove; };
    IDBObjectStore.prototype.delete = function (...args) {
      const request = remove.apply(this, args);
      if (this.name === 'dismissals') this.transaction.abort();
      return request;
    };
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('not saved');
  expect(await state(page)).toEqual(original);
  await page.evaluate(() => window.restoreDelete());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  expect((await state(page)).dismissals).toEqual([]);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await state(page)).toEqual(original);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'blocked');
});

test('a stale check-in dismissal cannot save against newly corrected start history', async ({ page }) => {
  await ready(page, LONG);
  await history(page);
  await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      await storage.replaceDay('2026-10-01',
        { date: '2026-10-01', bleeding: 'light', periodStart: true }, null);
    } finally {
      storage.db.close();
    }
  });
  const updated = await state(page);
  await card(page).getByRole('button', { name: 'Dismiss check-in', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('changed elsewhere');
  expect(await state(page)).toEqual(updated);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'available');
});

test('limited-history fallback and dismissal errors remain non-blocking and fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page, REGULAR.slice(-2));
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'insufficient');
  await history(page);
  await expect(page.locator('.checkin-card[data-reason="limited"]')).toHaveCount(2);
  await expect(page.locator('#history-checkins')).toContainText('No general cycle-length cutoff has been applied');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const before = await state(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'dismissals') this.transaction.abort();
      return request;
    };
  });
  const dismiss = page.locator('.checkin-card').first().getByRole('button', { name: 'Dismiss check-in', exact: true });
  await dismiss.click();
  await expect(page.getByRole('status')).toContainText('not saved');
  expect(await state(page)).toEqual(before);
  await expect(page.locator('.checkin-card')).toHaveCount(2);
  await page.evaluate(() => window.restorePut());
  await dismiss.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.checkin-card')).toHaveCount(1);
  await expect(page.locator('#history-checkins button').first()).toBeFocused();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.locator('#calendar button[data-date="2026-11-02"]').click();
  await expect(page.locator('#day-editor')).toBeVisible();
});

test('version-two migration preserves review answers as well as daily records', async ({ page }) => {
  await page.addInitScript((dates) => {
    const request = indexedDB.open('phase-diary', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const days = db.createObjectStore('days', { keyPath: 'date' });
      for (const date of dates) days.put({ date, bleeding: 'medium', periodStart: true });
      db.createObjectStore('metadata', { keyPath: 'key' }).put({ key: 'schemaVersion', value: 2 });
      db.createObjectStore('reviews', { keyPath: 'id' }).put({
        id: `${dates[0]}/${dates[1]}`, start: dates[0], end: dates[1],
        answer: 'complete', starts: dates.slice(0, 2), needsReview: false, missingUnresolved: false
      });
    };
    request.onsuccess = () => request.result.close();
  }, REGULAR);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  const saved = await state(page);
  expect(saved.records).toHaveLength(5);
  expect(saved.reviews).toHaveLength(1);
  expect(saved.reviews[0]).toMatchObject({ answer: 'complete', needsReview: false });
  expect(saved.dismissals).toEqual([]);
  await expect(page.locator('#forecast')).toHaveAttribute('data-state', 'available');
  await expect(page.locator('#estimate-method')).toContainText('including 3 provisional');
});
