// Renders each product's favicon tile to PNG at 32, 180 and 512 pixels (transparent
// corners), with Playwright's Chromium:
//   npm i --no-save playwright-core && node docs/brand/render-png.mjs [chromium-path]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("playwright-core");
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch(process.argv[2] ? { executablePath: process.argv[2] } : {});
for (const key of ["peal", "tender", "auction", "bidder"]) {
  const svg = readFileSync(join(here, key, "favicon.svg"), "utf8");
  for (const size of [32, 180, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: join(here, key, `favicon-${size}.png`), omitBackground: true });
    await page.close();
  }
}
await browser.close();
console.log("rendered favicons");
