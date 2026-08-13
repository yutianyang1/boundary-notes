/**
 * 抓取 README 用的站点截图。
 *
 *   npx tsx scripts/capture-screenshots.ts [目标站点]
 *
 * 默认抓生产站。输出 WebP 到 docs/screenshots/，覆盖同名文件。
 * 以 2 倍像素密度截取再降采样，保证文字边缘干净；
 * 浏览量上报接口会被拦截，避免抓图污染统计。
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "@playwright/test";

const BASE = process.argv[2] ?? "https://xiudou.site";
const OUT = path.join(process.cwd(), "docs", "screenshots");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 414, height: 896 };

/** 语法高亮示例：这篇有 Python 代码块和行间公式。 */
const CODE_POST = "normalization-layers-batchnorm-layernorm-groupnorm";
/** 图表示例：这篇有 Mermaid 架构图。 */
const DIAGRAM_POST = "barge-in-realtime-voice-architecture";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function scrollTo(page: Page, selector: string, offset = -160) {
  const target = page.locator(selector).first();
  if (!await target.count()) {
    console.warn(`  ! 没找到 ${selector}，跳过`);
    return false;
  }
  await target.scrollIntoViewIfNeeded();
  await page.evaluate((value) => window.scrollBy(0, value), offset);
  await page.waitForTimeout(400);
  return true;
}

async function shoot(page: Page, name: string, targetWidth: number) {
  const buffer = await page.screenshot();
  await sharp(buffer)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(OUT, `${name}.webp`));
  console.log(`  ✓ ${name}.webp`);
}

async function withPage(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0],
  run: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext(options);
  // 别把抓图算进文章浏览量。
  await context.route("**/api/posts/*/view", (route) => route.abort());
  const page = await context.newPage();
  await run(page);
  await context.close();
}

async function captureDesktop(browser: Browser, colorScheme: "light" | "dark") {
  const suffix = colorScheme === "dark" ? "-dark" : "";
  console.log(`\n${colorScheme} @ ${DESKTOP.width}x${DESKTOP.height}`);

  await withPage(browser, { viewport: DESKTOP, colorScheme, deviceScaleFactor: 2, reducedMotion: "reduce" }, async (page) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await settle(page);
    await shoot(page, `home${suffix}`, 1440);

    await page.goto(`${BASE}/posts`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await shoot(page, `posts${suffix}`, 1440);

    await page.goto(`${BASE}/posts/${CODE_POST}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    // Shiki 双主题产出的是 --shiki-light/--shiki-dark 变量，不是 color 内联样式。
    if (await scrollTo(page, 'pre code span[style*="--shiki"]')) {
      await shoot(page, `article-code${suffix}`, 1440);
    }

    await page.goto(`${BASE}/posts/${DIAGRAM_POST}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    if (await scrollTo(page, ".mermaid-diagram", -220)) {
      await shoot(page, `article-diagram${suffix}`, 1440);
    }
  });
}

async function captureMobile(browser: Browser) {
  console.log(`\nmobile @ ${MOBILE.width}x${MOBILE.height}`);
  await withPage(browser, { viewport: MOBILE, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce" }, async (page) => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await settle(page);
    await shoot(page, "mobile-home", 414);
  });
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  console.log(`抓取 ${BASE} → docs/screenshots/`);

  const browser = await chromium.launch();
  try {
    await captureDesktop(browser, "light");
    await captureDesktop(browser, "dark");
    await captureMobile(browser);
  } finally {
    await browser.close();
  }
  console.log("\n完成。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
