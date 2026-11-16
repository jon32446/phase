import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const NOW = new Date('2026-11-08T12:00:00Z');
const empty = { records: [], reviews: [], dismissals: [] };
const sample = {
  records: ['2026-10-01', '2026-10-28', '2026-11-01', '2026-11-05'].map((date) =>
    ({ date, bleeding: 'medium', periodStart: true })),
  reviews: [
    {
      id: '2026-10-01/2026-10-28', start: '2026-10-01', end: '2026-10-28',
      answer: 'unsure', starts: ['2026-10-01', '2026-10-28'], needsReview: true, missingUnresolved: true
    },
    {
      id: '2026-11-01/2026-11-05', start: '2026-11-01', end: '2026-11-05',
      answer: 'complete', starts: ['2026-11-01', '2026-11-05'], needsReview: false, missingUnresolved: false
    }
  ],
  dismissals: [{
    id: 'open:2026-11-05', start: '2026-11-05', end: '2026-11-08',
    anchor: '2026-11-05', starts: ['2026-11-05']
  }]
};
const backup = (state = sample) => JSON.stringify({ format: 'phase-backup', version: 1, ...state });

async function state(page) {
  return page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    try { return await storage.readState(); } finally { storage.db.close(); }
  });
}

async function ready(page, path = '/') {
  await page.clock.install({ time: NOW });
  await page.goto(path);
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await page.evaluate(async (sample) => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    await new Promise((resolve, reject) => {
      const tx = storage.db.transaction(['days', 'reviews', 'dismissals'], 'readwrite');
      for (const [store, values] of [['days', sample.records], ['reviews', sample.reviews], ['dismissals', sample.dismissals]]) {
        for (const value of values) tx.objectStore(store).put(value);
      }
      tx.oncomplete = resolve;
      tx.onabort = reject;
    });
    storage.db.close();
  }, sample);
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await page.locator('#calendar button[data-date="2026-11-07"]').click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

async function preview(page, text = backup()) {
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(text)
  });
  await page.locator('#preview-import').click();
}

async function confirm(page) {
  await page.locator('#data-approval').check();
  await page.locator('#confirm-data').click();
}

async function externalChange(page) {
  await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    await storage.replaceDay('2026-11-06',
      { date: '2026-11-06', bleeding: 'heavy', periodStart: false }, null);
    storage.db.close();
  });
}

for (const path of ['/', '/phase/']) {
  test(`exports and complete JSON restore round-trip all user data under ${path}`, async ({ page }) => {
    await ready(page, path);
    const expected = await state(page);
    const jsonEvent = page.waitForEvent('download');
    await page.locator('#export-json').click();
    const json = await jsonEvent;
    expect(json.suggestedFilename()).toBe('phase-backup.json');
    const text = await readFile(await json.path(), 'utf8');
    expect(JSON.parse(text)).toEqual({ format: 'phase-backup', version: 1, ...expected });
    const csvEvent = page.waitForEvent('download');
    await page.locator('#export-csv').click();
    const csv = await csvEvent;
    expect(csv.suggestedFilename()).toBe('phase-observations.csv');
    expect(await readFile(await csv.path(), 'utf8')).toBe(
      'date,bleeding,periodStart\r\n2026-10-01,medium,true\r\n2026-10-28,medium,true\r\n' +
      '2026-11-01,medium,true\r\n2026-11-05,medium,true\r\n2026-11-07,light,false\r\n');
    await preview(page, text);
    await expect(page.locator('#data-current')).toHaveText(/5 daily observations.*2 history reviews, 1 check-in/);
    await expect(page.locator('#confirm-data')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#preview-import')).toBeFocused();
    expect(await state(page)).toEqual(expected);
    await expect(page.locator('#undo-bar')).toBeVisible();
    await page.locator('#delete-data').click();
    await expect(page.locator('#confirm-data')).toBeDisabled();
    await confirm(page);
    await expect(page.locator('#data-editor')).not.toBeVisible();
    await expect(page.locator('#status')).toHaveText(/All saved Phase data deleted/);
    expect(await state(page)).toEqual(empty);
    await expect(page.locator('#undo-bar')).not.toBeVisible();
    await expect(page.locator('#undo-description')).toHaveText('');
    await expect(page.locator('#editor-current')).toHaveText('');
    await expect(page.locator('#data-current')).toHaveText('');
    await page.reload();
    await expect(page.locator('#status')).toHaveText('Local records ready.');
    expect(await state(page)).toEqual(empty);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await preview(page, text);
    await confirm(page);
    await expect(page.locator('#status')).toHaveText(/Backup restored/);
    await expect(page.locator('#undo-bar')).not.toBeVisible();
    expect(await state(page)).toEqual(expected);
    await page.reload();
    await expect(page.locator('#status')).toHaveText('Local records ready.');
    expect(await state(page)).toEqual(expected);
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.locator('#history-reviews')).toContainText('missing starts remain unresolved');
    await expect(page.locator('#history-reviews')).toContainText('needs review');
    await expect(page.locator('#history-checkins [data-checkin-id="open:2026-11-05"]')).toHaveCount(0);
  });
}

test('invalid imports never open a confirmation, alter records, or replace Undo', async ({ page }) => {
  await ready(page);
  const expected = await state(page);
  const invalid = [
    ['{"records":', /not valid JSON/],
    ['{"format":"phase-backup","version":2}', /Unsupported/],
    [backup({ ...sample, records: [...sample.records, sample.records[0]] }), /Duplicate/],
    [backup({ ...sample, reviews: [{ ...sample.reviews[0], starts: [] }] }), /context/],
    [backup({ ...sample, records: [...sample.records, { date: '2026-11-09', bleeding: 'none', periodStart: false }] }), /future/]
  ];
  for (const [text, message] of invalid) {
    await preview(page, text);
    await expect(page.locator('#settings-error')).toHaveText(message);
    await expect(page.locator('#data-editor')).not.toBeVisible();
    expect(await state(page)).toEqual(expected);
    await expect(page.locator('#undo-bar')).toBeVisible();
  }
  await page.locator('#undo').click();
  expect((await state(page)).records).toEqual(sample.records);
});

test('restore previews also guard review-only and dismissal-only changes', async ({ page }) => {
  await ready(page);
  for (const store of ['reviews', 'dismissals']) {
    await preview(page);
    await page.evaluate(async (store) => {
      const { openStorage } = await import(new URL('src/storage.js', location.href));
      const storage = await openStorage();
      const current = await storage.readState();
      if (store === 'reviews') {
        await storage.saveReview({ start: '2026-11-01', end: '2026-11-05' }, 'unsure', current);
      } else {
        await new Promise((resolve) => {
          const tx = storage.db.transaction('dismissals', 'readwrite');
          tx.objectStore('dismissals').clear();
          tx.oncomplete = resolve;
        });
      }
      storage.db.close();
    }, store);
    const expected = await state(page);
    await confirm(page);
    await expect(page.locator('#data-error')).toHaveText(/changed elsewhere/);
    expect(await state(page)).toEqual(expected);
    await page.locator('#cancel-data').click();
  }
});

for (const deleting of [false, true]) {
  test(`${deleting ? 'deletion' : 'restore'} rejects stale previews and preserves Undo`, async ({ page }) => {
    await ready(page);
    if (deleting) await page.locator('#delete-data').click();
    else await preview(page, backup(empty));
    await externalChange(page);
    const expected = await state(page);
    await confirm(page);
    await expect(page.locator('#data-error')).toHaveText(/changed elsewhere.*fresh preview/);
    await expect(page.locator('#confirm-data')).toBeDisabled();
    expect(await state(page)).toEqual(expected);
    await expect(page.locator('#undo-bar')).toBeVisible();
    await page.locator('#cancel-data').click();
    if (deleting) await page.locator('#delete-data').click();
    else await preview(page, backup(empty));
    await expect(page.locator('#data-approval')).not.toBeChecked();
    await confirm(page);
    await expect(page.locator('#data-editor')).not.toBeVisible();
    expect(await state(page)).toEqual(empty);
    await expect(page.locator('#undo-bar')).not.toBeVisible();
  });

  test(`failed ${deleting ? 'deletion' : 'restore'} rolls back every store and retains Undo`, async ({ page }) => {
    await ready(page);
    const expected = await state(page);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      window.restorePut = () => { IDBObjectStore.prototype.put = put; };
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        if (this.name === 'metadata' || this.name === 'reviews') this.transaction.abort();
        return request;
      };
    });
    if (deleting) await page.locator('#delete-data').click();
    else await preview(page);
    await confirm(page);
    await expect(page.locator('#data-error')).toHaveText(/No data was replaced or deleted/);
    expect(await state(page)).toEqual(expected);
    await expect(page.locator('#undo-bar')).toBeVisible();
    await page.evaluate(() => window.restorePut());
    await page.locator('#cancel-data').click();
    await page.locator('#undo').click();
    expect(await state(page)).toEqual(sample);
  });
}

test('deletion works without a network and clears all stores without touching unrelated origin storage', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(async () => {
    localStorage.setItem('unrelated-app', 'leave alone');
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    await new Promise((resolve) => {
      const tx = storage.db.transaction('metadata', 'readwrite');
      tx.objectStore('metadata').put({ key: 'synthetic-private-metadata', value: 'remove' });
      tx.oncomplete = resolve;
    });
    storage.db.close();
  });
  await context.setOffline(true);
  await page.locator('#delete-data').click();
  await expect(page.locator('#data-editor')).toBeVisible();
  await expect(page.locator('#data-approval')).toBeEnabled();
  await page.locator('#data-approval').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirm-data')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toHaveText(/All saved Phase data deleted/);
  await expect(page.locator('#delete-data')).toBeFocused();
  expect(await state(page)).toEqual(empty);
  expect(await page.evaluate(async () => {
    const { openStorage } = await import(new URL('src/storage.js', location.href));
    const storage = await openStorage();
    const values = await new Promise((resolve) => {
      const tx = storage.db.transaction('metadata', 'readonly');
      const request = tx.objectStore('metadata').getAll();
      tx.oncomplete = () => resolve(request.result);
    });
    storage.db.close();
    return { values, unrelated: localStorage.getItem('unrelated-app') };
  })).toEqual({
    values: [{ key: 'resetToken', value: expect.any(String) }, { key: 'schemaVersion', value: 3 }],
    unrelated: 'leave alone'
  });
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  expect(await state(page)).toEqual(empty);
});

for (const broadcasts of [true, false]) {
  test(`another tab cannot Undo deleted records back after reset (broadcasts ${broadcasts})`, async ({ page, context }) => {
    await ready(page);
    const other = await context.newPage();
    if (!broadcasts) {
      await other.addInitScript(() => { window.BroadcastChannel = undefined; });
    }
    await other.clock.install({ time: NOW });
    await other.goto('/');
    await expect(other.locator('#status')).toHaveText('Local records ready.');
    await other.locator('#calendar button[data-date="2026-11-07"]').click();
    await other.locator('#clear-day').click();
    await expect(other.locator('#day-editor')).not.toBeVisible();
    await expect(other.locator('#undo-bar')).toBeVisible();
    await page.locator('#delete-data').click();
    await confirm(page);
    await expect(page.locator('#status')).toHaveText(/All saved Phase data deleted/);
    if (broadcasts) {
      await expect(other.locator('#undo-bar')).not.toBeVisible();
      await expect(other.locator('#status')).toHaveText('Local records ready.');
    } else {
      await other.locator('#undo').click();
      await expect(other.locator('#status')).toHaveText(/replaced or deleted in another tab/);
      await expect(other.locator('#undo-bar')).not.toBeVisible();
    }
    expect(await state(other)).toEqual(empty);
    await other.close();
  });
}
