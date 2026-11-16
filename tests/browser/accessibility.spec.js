import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.clock.install({ time: new Date('2026-11-08T12:00:00Z') });
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Local records ready.');
}

async function tabTo(page, target) {
  for (let count = 0; count < 80; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function recordStart(page) {
  await page.locator('#calendar [data-date="2026-11-02"]').click();
  await page.getByRole('radio', { name: 'Medium', exact: true }).check();
  await page.getByLabel('Period started this day').check();
  await page.locator('#save-day').click();
  await expect(page.locator('#day-editor')).not.toBeVisible();
}

async function unobscured(target) {
  await expect.poll(() => target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth &&
      [box.top + 2, box.bottom - 2].every((y) =>
        element.contains(document.elementFromPoint(box.x + box.width / 2, y)));
  })).toBe(true);
}

async function touchTargets(root) {
  for (const control of await root.locator('button:visible:enabled, summary:visible, input:visible:enabled').all()) {
    const target = await control.evaluate((element) => {
      const box = (element.closest('label') ?? element).getBoundingClientRect();
      return { name: element.id || element.textContent.trim() || element.type, width: box.width, height: box.height };
    });
    expect(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
  }
}

test('keyboard journeys preserve focus through logging, reviews, exports, restore and deletion', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const date = page.locator('#calendar [data-date="2026-11-02"]');
  await tabTo(page, date);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'No bleeding', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.locator('#save-day')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(date).toBeFocused();

  await tabTo(page, page.locator('nav [data-page="history"]'));
  await page.keyboard.press('Enter');
  const review = page.locator('#open-span button');
  await tabTo(page, review);
  await page.keyboard.press('Enter');
  await expect(page.locator('#review-answer input[value="complete"]')).toBeFocused();
  await page.keyboard.press('Space');
  await tabTo(page, page.locator('#save-review'));
  await page.keyboard.press('Enter');
  await expect(review).toBeFocused();
  await tabTo(page, page.locator('#undo'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toHaveText('Undid the history review edit.');
  await expect(page.locator('nav [data-page="history"]')).toBeFocused();

  await tabTo(page, page.locator('nav [data-page="settings"]'));
  await page.keyboard.press('Enter');
  await tabTo(page, page.locator('#export-json'));
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  await download;
  await expect(page.locator('#export-json')).toBeFocused();
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'phase-backup', version: 1, records: [], reviews: [], dismissals: [] }))
  });
  await tabTo(page, page.locator('#preview-import'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#data-approval')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#cancel-data')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#data-editor')).not.toBeVisible();
  await expect(page.locator('#preview-import')).toBeFocused();
  await tabTo(page, page.locator('#delete-data'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#data-approval')).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirm-data')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#status')).toHaveText(/All saved Phase data deleted/);
  await expect(page.locator('#delete-data')).toBeFocused();
});

test('keyboard focus stays above fixed save, selection and navigation overlays', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 640 });
  await ready(page);
  await recordStart(page);
  await page.locator('#calendar [data-date="2026-11-08"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#select-days')).toBeFocused();
  await unobscured(page.locator('#select-days'));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const guide = page.locator('.calendar-key summary');
  await expect(guide).toBeFocused();
  await unobscured(guide);
  await page.keyboard.press('Tab');
  await expect(page.locator('#view-checkins')).toBeFocused();
  await unobscured(page.locator('#view-checkins'));
});

test('200 percent text reflows at 320px without clipping navigation or dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page);
  await recordStart(page);
  await page.locator('#dismiss-save').click();
  await page.evaluate(() => {
    const sheet = document.styleSheets[0];
    sheet.insertRule(':root { font-size: 200%; }', sheet.cssRules.length);
  });
  for (const screen of ['calendar', 'history', 'settings']) {
    await page.locator(`nav [data-page="${screen}"]`).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const button of await page.locator('nav button').all()) {
      const box = await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    if (screen === 'calendar') await page.locator('#log-today').click();
    if (screen === 'history') await page.locator('#open-span button').click();
    if (screen === 'settings') await page.locator('#delete-data').click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const cancel = dialog.getByRole('button', { name: /^(Cancel|Close without saving)$/ });
    await tabTo(page, cancel);
    await unobscured(cancel);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  await page.locator('nav [data-page="calendar"]').click();
  for (const weekday of await page.locator('.weekdays span').all()) {
    expect(await weekday.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  await page.locator('#select-days').click();
  await page.locator('#calendar [data-date="2026-11-02"]').click();
  await expect.poll(async () => {
    const selection = await page.locator('#selection-bar').boundingBox();
    const navigation = await page.locator('nav').boundingBox();
    return selection.y + selection.height <= navigation.y;
  }).toBe(true);
  await page.locator('[data-bulk-action="heavy"]').click();
  await expect(page.locator('#selection-bar')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect.poll(async () => {
    const notice = await page.locator('#save-notice').boundingBox();
    const navigation = await page.locator('nav').boundingBox();
    return notice.y + notice.height <= navigation.y;
  }).toBe(true);
});

test('mobile controls have touch-sized targets and supporting text retains contrast', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ready(page);
  await recordStart(page);
  await page.locator('#dismiss-save').click();
  await touchTargets(page.locator('body'));
  await page.locator('#select-days').click();
  await page.locator('#calendar [data-date="2026-11-02"]').click();
  await touchTargets(page.locator('#selection-bar'));
  await page.locator('[data-bulk-action="none"]').click();
  await touchTargets(page.locator('#bulk-editor'));
  await page.keyboard.press('Escape');
  await expect(page.locator('#bulk-editor')).not.toBeVisible();
  await page.locator('#cancel-selection').click();

  const contrast = await page.locator('#estimate-note').evaluate((element) => {
    const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = (color) => rgb(color).map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(element.closest('.forecast-card')).backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.locator('nav [data-page="history"]').click();
  await touchTargets(page.locator('body'));
  await page.locator('#open-span button').click();
  await expect(page.locator('#review-editor')).toBeVisible();
  await touchTargets(page.locator('#review-editor'));
  await page.keyboard.press('Escape');
  await expect(page.locator('#review-editor')).not.toBeVisible();
  await page.locator('nav [data-page="settings"]').click();
  await touchTargets(page.locator('body'));
  await page.locator('#delete-data').click();
  await touchTargets(page.locator('#data-editor'));
});
