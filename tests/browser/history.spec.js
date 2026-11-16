import { test, expect } from '@playwright/test';

const NOW = new Date('2026-11-08T12:00:00Z');
const span = (start = '2026-11-01', end = '2026-11-05') => `${start}/${end}`;
const startRecord = (date) => ({ date, bleeding: 'medium', periodStart: true });

async function state(page) {
  return page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      const { records, reviews } = await storage.readState();
      return { records, reviews };
    } finally {
      storage.db.close();
    }
  });
}

async function ready(page, path = '/', dates = ['2026-11-01', '2026-11-05']) {
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
  await page.getByRole('button', { name: 'History', exact: true }).click();
}

async function openReview(page, id = span(), list = 'intervals') {
  await page.locator(`#${list} button[data-span="${id}"]`).click();
  await expect(page.locator('#review-editor')).toBeVisible();
}

async function answer(page, value) {
  await page.locator(`#review-answer input[value="${value}"]`).check();
  if (await page.locator('#review-replacement').isVisible()) await page.locator('#review-replace').check();
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.locator('#review-editor')).not.toBeVisible();
}

async function externalStart(page, date, periodStart = true) {
  await page.evaluate(async ({ date, periodStart }) => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      await storage.replaceDay(date, { date, bleeding: 'medium', periodStart }, await storage.read(date));
    } finally {
      storage.db.close();
    }
  }, { date, periodStart });
}

async function editStart(page, date, periodStart) {
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.locator(`#calendar button[data-date="${date}"]`).click();
  await page.getByRole('radio', { name: 'Medium', exact: true }).check();
  await page.getByLabel('Period started this day').setChecked(periodStart);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'History', exact: true }).click();
}

for (const path of ['/', '/phase/']) {
  test(`manual reviews preserve sparse observations, persist, and stop at the reviewed date under ${path}`, async ({ page }) => {
    await ready(page, path);
    await expect(page.locator('#cycle-summary')).toHaveText(/4 days between starts.*1 usable.*0 confirmed complete, 1 provisional/);
    const before = (await state(page)).records;
    await openReview(page);
    await expect(page.locator('#review-answer input[value="complete"]')).toBeFocused();
    await answer(page, 'complete');
    await expect(page.locator('#intervals li')).toHaveAttribute('data-status', 'complete');
    expect((await state(page)).records).toEqual(before);
    await openReview(page, span('2026-11-05', '2026-11-08'), 'open-span');
    await answer(page, 'complete');
    await page.clock.fastForward(86400000);
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('Local records ready.');
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('#open-span')).toContainText('5 – 9 Nov 2026');
    const saved = (await state(page)).reviews;
    expect(saved.map((review) => review.end)).toEqual(['2026-11-05', '2026-11-08']);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo last edit' })).not.toBeVisible();
  });
}

test('adding a remembered start does not resolve a missing report; unsure retains it until explicitly confirmed', async ({ page }) => {
  await ready(page);
  await openReview(page);
  await answer(page, 'missing');
  await expect(page.locator('#cycle-summary')).toContainText('No usable completed intervals');
  await openReview(page);
  await page.getByText('Remember a missing start date?', { exact: true }).click();
  await page.getByLabel('Remembered start date').fill('2026-11-03');
  await page.getByRole('button', { name: 'Add a remembered start', exact: true }).click();
  await expect(page.locator('#day-editor')).toBeVisible();
  await expect(page.getByLabel('Period started this day')).toBeChecked();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  await expect(page.locator('#intervals li[data-status="missing"]')).toHaveCount(2);
  await expect(page.locator('#history-reviews')).toContainText('recorded starts have changed since this answer');
  expect((await state(page)).records).toEqual([
    startRecord('2026-11-01'),
    { date: '2026-11-03', bleeding: 'light', periodStart: true },
    startRecord('2026-11-05')
  ]);
  await openReview(page, span('2026-11-01', '2026-11-03'));
  await expect(page.locator('#review-heading')).toHaveText('1 – 5 Nov 2026');
  await expect(page.locator('#review-boundaries')).toContainText('full span');
  await answer(page, 'unsure');
  const unsure = (await state(page)).reviews[0];
  expect(unsure).toMatchObject({ answer: 'unsure', missingUnresolved: true, needsReview: false });
  await expect(page.locator('#intervals li[data-status="missing"]')).toHaveCount(2);
  const before = (await state(page)).records;
  await openReview(page, span('2026-11-03', '2026-11-05'));
  await answer(page, 'complete');
  await expect(page.locator('#intervals li[data-status="complete"]')).toHaveCount(2);
  await expect(page.locator('#cycle-summary')).toContainText('2 confirmed complete');
  expect((await state(page)).records).toEqual(before);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect((await state(page)).reviews[0]).toEqual(unsure);
});

test('review corrections and removals are undoable and require explicit replacement approval', async ({ page }) => {
  await ready(page);
  await openReview(page);
  await page.keyboard.press('Escape');
  expect((await state(page)).reviews).toEqual([]);
  await expect(page.locator(`#intervals button[data-span="${span()}"]`)).toBeFocused();
  await openReview(page);
  await answer(page, 'unsure');
  const original = await state(page);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('#intervals li')).toHaveAttribute('data-status', 'unresolved');
  await openReview(page, span(), 'history-reviews');
  await page.locator('#review-answer input[value="complete"]').check();
  await expect(page.getByRole('button', { name: 'Save review', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove listed answers', exact: true })).toBeDisabled();
  await page.locator('#review-replace').check();
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.locator('#review-editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await state(page)).toEqual(original);
  await openReview(page, span(), 'history-reviews');
  await page.locator('#review-replace').check();
  await page.getByRole('button', { name: 'Remove listed answers', exact: true }).click();
  await expect(page.locator('#review-editor')).not.toBeVisible();
  expect((await state(page)).reviews).toEqual([]);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await state(page)).toEqual(original);
});

test('start corrections invalidate both adjacent reviews and replacing them covers their whole spans', async ({ page }) => {
  await ready(page, '/', ['2026-11-01', '2026-11-03', '2026-11-05']);
  await openReview(page, span('2026-11-01', '2026-11-03'));
  await answer(page, 'complete');
  await openReview(page, span('2026-11-03', '2026-11-05'));
  await answer(page, 'missing');
  const original = await state(page);
  await editStart(page, '2026-11-03', false);
  let current = await state(page);
  expect(current.reviews).toHaveLength(2);
  expect(current.reviews.every((review) => review.needsReview)).toBe(true);
  expect(current.reviews.every((review) => !review.starts.includes('2026-11-03'))).toBe(true);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await state(page)).toEqual(original);
  await editStart(page, '2026-11-03', false);
  await openReview(page);
  await expect(page.locator('#review-existing li')).toHaveCount(2);
  await answer(page, 'missing');
  current = await state(page);
  expect(current.reviews).toHaveLength(1);
  expect(current.reviews[0]).toMatchObject({ start: '2026-11-01', end: '2026-11-05', answer: 'missing' });
  await editStart(page, '2026-11-03', true);
  await openReview(page, span('2026-11-03', '2026-11-05'));
  await expect(page.locator('#review-heading')).toHaveText('1 – 5 Nov 2026');
  await expect(page.locator('#review-existing li')).toHaveCount(1);
});

test('bleeding-only edits and outside start changes leave review answers valid', async ({ page }) => {
  await ready(page);
  await openReview(page);
  await answer(page, 'complete');
  const original = (await state(page)).reviews;
  await page.locator('#history button[data-date="2026-11-01"]').click();
  await page.getByRole('radio', { name: 'Heavy', exact: true }).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  expect((await state(page)).reviews).toEqual(original);
  await editStart(page, '2026-11-07', true);
  expect((await state(page)).reviews).toEqual(original);
  await expect(page.locator('#intervals li[data-status="complete"]')).toHaveCount(1);
});

test('failed review writes and failed start invalidation leave all committed health data and Undo intact', async ({ page }) => {
  await ready(page);
  await openReview(page);
  await answer(page, 'complete');
  const original = await state(page);
  const undoDescription = await page.locator('#undo-description').textContent();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'reviews') this.transaction.abort();
      return request;
    };
  });
  await openReview(page);
  await page.locator('#review-answer input[value="missing"]').check();
  await page.locator('#review-replace').check();
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.locator('#review-error')).toContainText('not saved');
  expect(await state(page)).toEqual(original);
  await page.getByRole('button', { name: 'Close without saving' }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.locator('#calendar button[data-date="2026-11-03"]').click();
  await page.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.getByLabel('Period started this day').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('not saved');
  expect(await state(page)).toEqual(original);
  await expect(page.locator('#undo-description')).toHaveText(undoDescription);
  await page.evaluate(() => window.restorePut());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  expect((await state(page)).reviews[0].needsReview).toBe(true);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect(await state(page)).toEqual(original);
});

test('stale reviews and stale review Undo cannot overwrite intervening start or answer changes', async ({ page }) => {
  await ready(page);
  await openReview(page);
  await externalStart(page, '2026-11-03');
  await page.locator('#review-answer input[value="complete"]').check();
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect(page.locator('#review-error')).toContainText('changed elsewhere');
  expect((await state(page)).reviews).toEqual([]);
  await page.getByRole('button', { name: 'Close without saving' }).click();
  await openReview(page);
  await answer(page, 'complete');
  await externalStart(page, '2026-11-04');
  const current = await state(page);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toContainText('changed elsewhere');
  expect(await state(page)).toEqual(current);
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await openReview(page, span(), 'history-reviews');
  await answer(page, 'complete');
  await editStart(page, '2026-11-02', true);
  await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try {
      const expected = await storage.readState();
      await storage.saveReview({ start: '2026-11-01', end: '2026-11-05' }, 'missing', expected);
    } finally {
      storage.db.close();
    }
  });
  const latest = await state(page);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toContainText('changed elsewhere');
  expect(await state(page)).toEqual(latest);
});

test('Undo restores days and reviews atomically, survives failure, and ignores unrelated changes', async ({ page }) => {
  await ready(page);
  await openReview(page);
  await answer(page, 'complete');
  const original = await state(page);
  await editStart(page, '2026-11-03', true);
  const edited = await state(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'reviews') this.transaction.abort();
      return request;
    };
  });
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toContainText('not saved');
  expect(await state(page)).toEqual(edited);
  await expect(page.getByRole('button', { name: 'Undo last edit' })).toBeVisible();
  await page.evaluate(() => window.restorePut());
  await externalStart(page, '2026-11-07');
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByRole('status')).toContainText('Undid');
  expect(await state(page)).toEqual({
    records: [...original.records, startRecord('2026-11-07')], reviews: original.reviews
  });
});

test('version-one storage migrates without losing observations or period starts', async ({ page }) => {
  await page.addInitScript(() => {
    const request = indexedDB.open('phase-diary', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('days', { keyPath: 'date' })
        .put({ date: '2026-11-01', bleeding: 'heavy', periodStart: true });
      request.result.createObjectStore('metadata', { keyPath: 'key' })
        .put({ key: 'schemaVersion', value: 1 });
    };
    request.onsuccess = () => request.result.close();
  });
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Local records ready.');
  expect(await state(page)).toEqual({
    records: [{ date: '2026-11-01', bleeding: 'heavy', periodStart: true }], reviews: []
  });
  expect(await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    const version = storage.db.version;
    storage.db.close();
    return version;
  })).toBe(3);
});

test('review dialog supports keyboard focus, touch-sized layout, and no-change saves preserve Undo', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page);
  await openReview(page);
  await page.getByRole('button', { name: 'Close without saving' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#review-answer input[value="complete"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Close without saving' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('#review-editor').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await answer(page, 'complete');
  const description = await page.locator('#undo-description').textContent();
  await openReview(page);
  await answer(page, 'complete');
  await expect(page.getByRole('status')).toHaveText('No changes to save.');
  await expect(page.locator('#undo-description')).toHaveText(description);
  await page.clock.fastForward(3600000);
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  expect((await state(page)).reviews).toEqual([]);
});
