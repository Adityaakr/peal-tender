// Renders docs/brand/cover/cover.html to a 1920 x 1080 PNG and JPG (plus a 400 px
// preview and a safe-area check), with Playwright's Chromium:
//   npm i --no-save playwright-core && node docs/brand/cover/render.mjs <out-dir> [chromium-path]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("playwright-core");
const here = dirname(fileURLToPath(import.meta.url));
const [out, exe] = process.argv.slice(2);
if (!out) throw new Error("usage: render.mjs <out-dir> [chromium-path]");
const url = pathToFileURL(join(here, "cover.html")).href;

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, "peal-tender-cover.png") });
await page.screenshot({ path: join(out, "peal-tender-cover.jpg"), type: "jpeg", quality: 92 });
await page.goto(`${url}#safe`);
await page.reload();
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: join(out, "cover-safe-area.png") });
// a 400 px wide preview, as a project grid shows it
const small = await browser.newPage({ viewport: { width: 400, height: 225 }, deviceScaleFactor: 1 });
await small.goto(url);
await small.evaluate(() => document.fonts.ready);
await small.addStyleTag({ content: "body{transform:scale(0.208333);transform-origin:0 0}" });
await small.waitForTimeout(400);
await small.screenshot({ path: join(out, "cover-400.png") });
await browser.close();
console.log("rendered cover");
