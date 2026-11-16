import { test, expect } from '@playwright/test';

const day = (page) => page.locator('#calendar button[data-date="2026-11-02"]');
const restart = (page) => page.getByRole('button', { name: 'Restart to update' });

async function ready(page, path = '/') {
  await page.clock.install({ time: new Date('2026-11-08T12:00:00Z') });
  await page.goto(path);
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect(page.locator('#update-notice')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function update(page, version = '2') {
  await page.context().addCookies([{ name: 'phase-test-version', value: version, url: page.url() }]);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect(page.locator('#update-notice')).toBeVisible();
}

for (const path of ['/', '/phase/']) {
  test(`offline reload, editing, export, deletion and static-only caches under ${path}`, async ({ page, context }) => {
    await ready(page, path);
    const manifest = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      return { url: link.href, value: await (await fetch(link.href)).json() };
    });
    expect(manifest.value.display).toBe('standalone');
    expect(new URL(manifest.value.scope, manifest.url).pathname).toBe(path);
    expect(new URL(manifest.value.start_url, manifest.url).pathname).toBe(path);
    expect(manifest.value.icons).toHaveLength(1);
    if (test.info().project.name === 'chromium') {
      const session = await context.newCDPSession(page);
      const { installabilityErrors } = await session.send('Page.getInstallabilityErrors');
      expect(installabilityErrors).toEqual([]);
      await session.detach();
    }
    if (path === '/phase/') {
      expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toContain('/phase/sw.js');
    }
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#status')).toHaveText('Local records ready.');
    await day(page).click();
    await page.getByLabel('Bleeding', { exact: true }).selectOption('medium');
    await page.getByLabel('Period started this day').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#day-editor')).not.toBeVisible();
    await page.reload();
    await expect(day(page)).toHaveAccessibleName(/Medium, period start/);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe('phase-backup.json');
    await page.locator('#import-file').setInputFiles({
      name: 'synthetic.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        format: 'phase-backup', version: 1,
        records: [{ date: '2026-11-02', bleeding: 'light', periodStart: true }],
        reviews: [], dismissals: []
      }))
    });
    await page.locator('#preview-import').click();
    await page.locator('#data-approval').check();
    await page.locator('#confirm-data').click();
    await expect(page.locator('#status')).toHaveText(/Backup restored/);
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await page.locator('#data-approval').check();
    await page.locator('#confirm-data').click();
    await expect(page.locator('#status')).toHaveText(/All saved Phase data deleted/);
    const cached = await page.evaluate(async () => {
      const cache = await caches.open((await caches.keys())[0]);
      return Promise.all((await cache.keys()).map(async (request) => ({
        url: request.url, text: await (await cache.match(request)).text()
      })));
    });
    expect(cached).toHaveLength(13);
    for (const entry of cached) {
      const url = new URL(entry.url);
      expect(url.pathname.startsWith(path)).toBe(true);
      expect(url.search).toBe('');
      expect(entry.text).not.toContain('2026-11-02');
      expect(entry.text).not.toContain('"bleeding":"medium"');
    }
    await page.reload();
    await expect(day(page)).toHaveAccessibleName(/Not recorded/);
  });

  test(`restart is explicit, guarded, and preserves another window under ${path}`, async ({ page, context }) => {
    await ready(page, path);
    await day(page).click();
    await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('#undo-bar')).toBeVisible();
    const other = await context.newPage();
    await other.goto(path);
    await expect(other.locator('#status')).toHaveText('Local records ready.');
    await day(other).click();
    await other.getByLabel('Bleeding', { exact: true }).selectOption('heavy');
    await other.evaluate(() => { window.survivedUpdate = true; });
    await page.evaluate(() => { window.beforeUpdate = true; });

    await update(page);
    expect(await page.evaluate(() => window.beforeUpdate)).toBe(true);
    await expect(page.locator('#undo-bar')).toBeVisible();
    await expect(restart(page)).toBeEnabled();
    await day(page).click();
    await expect(restart(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(restart(page)).toBeEnabled();
    await page.getByRole('button', { name: 'Select days', exact: true }).click();
    await expect(restart(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel selection' }).click();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    // Add a start so the history-review editor is available.
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await day(page).click();
    await page.getByLabel('Period started this day').check();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await page.locator('#open-span button').click();
    await expect(restart(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Close without saving' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Delete all data', exact: true }).click();
    await expect(restart(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(restart(page)).toBeEnabled();
    await page.keyboard.press('Tab');
    await restart(page).focus();
    const loaded = page.waitForEvent('load');
    await page.keyboard.press('Enter');
    await loaded;
    await expect(page.locator('#status')).toHaveText('Local records ready.');
    await expect(page.locator('#update-notice')).not.toBeVisible();
    await expect(page.locator('#undo-bar')).not.toBeVisible();
    expect(await page.evaluate(() => window.beforeUpdate)).toBeUndefined();
    await expect(day(page)).toHaveAccessibleName(/Light, period start/);
    expect(await other.evaluate(() => window.survivedUpdate)).toBe(true);
    await expect(other.getByLabel('Bleeding', { exact: true })).toHaveValue('heavy');
    expect(await page.evaluate(() => caches.keys())).toHaveLength(2);
    await context.setOffline(true);
    // The older window retains its draft. Its normal stale-write guard still applies.
    await other.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(other.locator('#editor-error')).toBeVisible();
    await other.getByRole('button', { name: 'Cancel', exact: true }).click();
    await day(other).click();
    await other.getByLabel('Bleeding', { exact: true }).selectOption('heavy');
    await other.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(day(other)).toHaveAccessibleName(/Heavy, period start/);
    await other.close();
    await page.reload();
    await expect(day(page)).toHaveAccessibleName(/Heavy, period start/);
    await expect.poll(() => page.evaluate(() => caches.keys())).toHaveLength(1);
  });
}

test('returning to Phase checks for an update without reloading or clearing Undo', async ({ page }) => {
  await ready(page);
  await day(page).click();
  await page.getByLabel('Bleeding', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#undo-bar')).toBeVisible();
  await page.evaluate(() => {
    window.updateChecks = 0;
    ServiceWorkerRegistration.prototype.update = async () => { window.updateChecks++; };
    window.stillHere = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.updateChecks)).toBe(1);
  expect(await page.evaluate(() => window.stillHere)).toBe(true);
  await expect(page.locator('#undo-bar')).toBeVisible();
});

test('restart also works on the first, not-yet-controlled visit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await update(page);
  await page.evaluate(() => { window.beforeUpdate = true; });
  const loaded = page.waitForEvent('load');
  await restart(page).click();
  await loaded;
  expect(await page.evaluate(() => window.beforeUpdate)).toBeUndefined();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
});

test('a waiting update survives reloading the current version and can restart offline', async ({ page, context }) => {
  await ready(page);
  await update(page);
  await page.reload();
  await expect(page.locator('#update-notice')).toBeVisible();
  expect(await page.evaluate(() => caches.keys())).toHaveLength(2);
  await context.setOffline(true);
  await page.evaluate(() => { window.beforeUpdate = true; });
  const loaded = page.waitForEvent('load');
  await restart(page).click();
  await loaded;
  expect(await page.evaluate(() => window.beforeUpdate)).toBeUndefined();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await expect(page.locator('#update-notice')).not.toBeVisible();
});

test('failed update installation preserves the current offline shell', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('./sw.js?test-version=failed', {
      scope: './', updateViaCache: 'none'
    });
    const worker = registration.installing;
    if (worker && worker.state !== 'redundant') {
      await new Promise((resolve) => worker.addEventListener('statechange', () => {
        if (worker.state === 'redundant') resolve();
      }));
    }
  });
  await expect(page.locator('#offline-status')).toContainText('saved offline version is still available');
  await expect(page.locator('#update-notice')).not.toBeVisible();
  expect(await page.evaluate(() => caches.keys())).toHaveLength(1);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
});

test('failed first-time caching leaves the diary usable and retries when returning', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'phase-test-version', value: 'failed', url: baseURL }]);
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await expect(page.locator('#offline-status')).toContainText('Offline setup did not finish');
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  await context.addCookies([{ name: 'phase-test-version', value: '2', url: baseURL }]);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#offline-status')).toContainText('Available offline');
  await expect(page.locator('#update-notice')).not.toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Local records ready.');
});

test('unsupported service workers leave the online diary usable with an explanation', async ({ page }) => {
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
  });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Local records ready.');
  await expect(page.locator('#offline-status')).toContainText('unavailable in this browser');
});
