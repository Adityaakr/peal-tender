// capture-live.mjs - screenshot the hosted app at 2x, reading the live v2 vault on the testnet,
// for scene 07 (assets/shots/live-*.png). No wallet is opened and nothing is signed.
//
//   PLAYWRIGHT_CORE=<path to playwright-core/index.mjs> CHROME=<chromium binary> \
//   OUT=assets/shots SHOTS=signers,vault,tender2,tender3 node src/capture-live.mjs
//
// The two wallet shots of scene 07 come from a real guest-account run on the hosted app
// (21 November 2026), taken at 1x while it ran, because the panel's log exists only during
// an action: live-panel-claim.png is the wallet panel (x 1020-1440, y 0-740 of the page) after
// "Get test PEAL-T", live-offer-placed.png the tender page after the guest's offer. The
// panel shows public addresses and transaction hashes only; its "Back up" phrase was never
// opened.
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const BASE = process.env.BASE ?? "https://peal-tender.vercel.app/";
const OUT = process.env.OUT ?? "assets/shots";
const which = (process.env.SHOTS ?? "signers,vault,tender2,tender3").split(",");
const routes = { signers: "#/signers", vault: "#/vault", timelock: "#/timelock", tender2: "#/tenders/2", tender3: "#/tenders/3", tenders: "#/tenders" };

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const k of which) {
  await page.goto(BASE + routes[k], { waitUntil: "networkidle" });
  await page.waitForTimeout(10000); // live reads, the activity log, and the refresh fade settling
  await page.addStyleTag({ content: ".wallet,.wallet-scrim{display:none!important}" });
  await page.screenshot({ path: `${OUT}/live-${k}.png`, fullPage: true });
  console.log(k, 1440, await page.evaluate(() => document.documentElement.scrollHeight));
}
await browser.close();
