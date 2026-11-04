import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../package.json', import.meta.url));
const base = process.env.BASE_URL ?? 'http://localhost:3002';
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
try {
  for (const locale of ['zh', 'en']) {
    for (const width of [360, 390, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: width === 390 ? 'dark' : 'light', acceptDownloads: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const path = locale === 'en' ? '/en/downloads' : '/downloads';
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
      assert((await page.locator('link[rel="canonical"]').getAttribute('href')).endsWith(path));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${locale}/${width}: overflow`);
      const label = locale === 'zh' ? '下载 App' : 'Download App';
      if (width < 1024) {
        const trigger = page.getByRole('button', { name: locale === 'zh' ? '打开菜单' : 'Open menu', exact: true });
        await trigger.click();
        const link = page.getByRole('dialog').getByRole('link', { name: label, exact: true });
        await link.waitFor({ state: 'visible' });
        assert.equal(await link.getAttribute('href'), path);
        await link.click();
        await page.waitForFunction(() => document.querySelector('button[aria-controls="mobile-site-navigation"]')?.getAttribute('aria-expanded') === 'false');
      } else {
        const link = page.locator('header').getByRole('link', { name: label, exact: true });
        assert(await link.isVisible());
        assert.equal(await link.getAttribute('href'), path);
      }
      const button = page.getByRole('link', { name: locale === 'zh' ? '下载 Android APK' : 'Download Android APK', exact: true });
      assert.equal(await button.getAttribute('href'), '/downloads/boundary-notes-0.1.0.apk');
      if (locale === 'zh' && width === 360) {
        const event = page.waitForEvent('download');
        await button.click();
        const download = await event;
        assert.equal(await download.failure(), null);
        assert.equal(download.suggestedFilename(), 'boundary-notes-0.1.0.apk');
      }
      assert.equal(await page.locator('details').count(), 0);
      assert.equal(await page.getByText(/首版暂未接入|This first release does not include|SHA-256/).count(), 0);
      assert.deepEqual(errors, []);
      if (locale === 'zh' && (width === 390 || width === 1440)) {
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: `/tmp/downloads-${width}.png`, fullPage: true });
      }
      console.log(`PASS downloads ${locale} ${width}px: layout, navigation, package links, simplified content`);
      await context.close();
    }
  }
} finally { await browser.close(); }
