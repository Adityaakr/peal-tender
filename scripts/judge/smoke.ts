/**
 * smoke.ts - the judge page's calls, run from Node against the live testnet.
 *
 *   npm run judge:smoke
 *
 * Read-only: the same eth_calls the page makes, with the same code
 * (apps/dashboard/src/judge/). No account, no key, nothing sent. Exits 1 if any row did
 * not do exactly what it says, so a refusal by the wrong check fails too.
 */
import { GROUPS, held, loadFacts, PROBES, runProbe } from "../../apps/dashboard/src/judge/probes.ts";
import { Rpc } from "../../apps/dashboard/src/judge/rpc.ts";

const rpc = new Rpc(process.env.JUDGE_RPC ? { url: process.env.JUDGE_RPC } : {});
const facts = await loadFacts(rpc);
console.log(`vault order ${facts.order.tx} in block ${facts.order.block}; latest block ${facts.latest.number}\n`);

let bad = 0;
let skipped = 0;
for (const g of GROUPS) {
  console.log(g.title);
  for (const p of PROBES.filter((x) => x.group === g.id)) {
    const r = await runProbe(p, facts, rpc);
    if (r.verdict === "not-now") skipped++;
    else if (!held(r)) bad++;
    console.log(`  ${held(r) ? "ok  " : r.verdict === "not-now" ? "skip" : "FAIL"}  ${r.verdict.padEnd(15)} ${p.title}\n        ${r.said}${r.ms === undefined ? "" : `  (${r.ms} ms)`}`);
  }
}
console.log(`\n${PROBES.length - bad - skipped} of ${PROBES.length} rows did what they say${skipped ? `, ${skipped} had nothing to act on` : ""}${bad ? `, ${bad} FAILED` : ""}`);
process.exit(bad ? 1 : 0);
