// capture.mjs - screenshot the real Peal Tender screens the film uses, at 2x, into assets/shots/.
//
//   npm run dashboard -- --port 5199            # the web app, in the repository
//   npm run demo:local                          # a local node with a v2 vault in every state;
//                                               # it prints the app URL with ?rpc=...&vault=...
//   PLAYWRIGHT_CORE=<path to playwright-core/index.mjs> CHROME=<chromium binary> \
//   APP_QUERY='?rpc=...&vault=0x...' node src/capture.mjs
//
// The landing page reads the testnet (the drill vault's real ledger and tender 1); the app
// pages read the local node, so their figures come from the end-to-end run, not the testnet.
// The page shows public addresses and hashes only; no key or recovery phrase ever enters it.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const BASE = process.env.BASE ?? "http://localhost:5199/";
const APP_QUERY = process.env.APP_QUERY;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "shots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

// Landing page sections, without the sticky header or the wallet panel.
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(4000); // the instrument's signing animation and live reads
await page.addStyleTag({ content: "header.t-nav{display:none!important} .wallet,.wallet-scrim{display:none!important}" });
const crops = {
  hero: "section.t-hero",
  flow: "figure.t-flow-fig",
  ledger: "#statement .t-ledger-scroll",
  rejected: ".t-rejected",
  buyback: ".t-buyback",
  req: ".t-req-scroll",
};
for (const [name, sel] of Object.entries(crops)) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await el.screenshot({ path: join(OUT, `${name}.png`) });
}

// App pages against the local node, full page.
if (APP_QUERY) {
  for (const [name, route] of Object.entries({ signers: "signers", timelock: "timelock", tender1: "tenders/1", sales: "sales" })) {
    await page.goto(`${BASE}${APP_QUERY}#/${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: join(OUT, `app-${name}.png`), fullPage: true });
  }
} else {
  console.log("APP_QUERY not set: skipped the app pages");
}
await browser.close();
console.log(`screens written to ${OUT}`);
