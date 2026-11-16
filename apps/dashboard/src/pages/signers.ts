import { type Ctx } from "../main.ts";
import { ago, chip, h, hash } from "../ui.ts";
import { fingerprint } from "../ui.ts";
import { header, signerName } from "./common.ts";

export async function signers(ctx: Ctx): Promise<HTMLElement> {
  const s = ctx.snap;
  const lastSigned = new Map<string, { count: number; last?: bigint }>();
  const cards = s.members.map((m) => {
    const last = h("dd", h("span.muted", "…"));
    lastSigned.set(m.address.toLowerCase(), { count: 0 });
    const card = h(
      "section.card.signer-card",
      h("div.card-head", h("h3", signerName(s, m.address)), m.usable ? chip("Can sign", "ok") : chip("Cannot sign", "bad")),
      hash(m.address, { full: true, label: "signer address" }),
      fingerprint(m.keyHash),
      h(
        "dl.kv",
        h("dt", "Key"),
        h("dd", m.registered ? chip("Registered", "ok") : chip("Not registered", "bad")),
        h("dt", "Algorithm"),
        h("dd", m.algorithm === 1 ? "ML-DSA-87" : m.registered ? chip(`algorithm ${m.algorithm}`, "bad") : "none"),
        h("dt", "Possession"),
        h("dd", m.possession ? chip("Proven", "ok") : chip("Not proven", "bad")),
        h("dt", "Public key"),
        h("dd", `${m.keyLength.toLocaleString("en-US")} bytes`),
        h("dt", "Key hash"),
        h("dd", hash(m.keyHash, { label: "key hash" })),
        h("dt", "Signed"),
        last,
      ),
    );
    return { card, last, m };
  });

  void ctx.activity().then((list) => {
    for (const a of list) {
      if (!a.signers) continue;
      for (const sg of a.signers) {
        const e = lastSigned.get(sg.toLowerCase());
        if (!e) continue;
        e.count++;
        if (a.timestamp && (!e.last || a.timestamp > e.last)) e.last = a.timestamp;
      }
    }
    for (const { last, m } of cards) {
      const e = lastSigned.get(m.address.toLowerCase())!;
      last.replaceChildren(e.count ? `${e.count} action${e.count > 1 ? "s" : ""}${e.last ? `, last ${ago(e.last, s.block.timestamp)}` : ""}` : "Nothing yet");
    }
  });

  return h(
    "div",
    header(
      "Signers",
      `Any ${s.threshold} of these ${s.members.length} accounts can act for the treasury, each with its own ML-DSA-87 key. The keys below are read live from the chain's registry (pqcKeyStatus at 0x…0a02), the same read the vault makes before every check, so a key rotated on chain shows here at once.`,
    ),
    h(
      "div.card",
      { style: "display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-bottom:16px" },
      h("span.quorum-dots", ...s.members.map((_, i) => h(`i${i < s.threshold ? ".on" : ""}`))),
      h(
        "div",
        h("div", { style: "font-weight:600" }, `${s.threshold} of ${s.members.length} to act, 1 to veto`),
        h("div.small.muted", `Set epoch ${s.epoch}, nonce ${s.nonce}. Every action and every veto uses the next nonce, so no signature works twice.`),
      ),
    ),
    h("div.grid.grid-3", ...cards.map((c) => c.card)),
    h(
      "p.note",
      { style: "margin-top:16px" },
      "Changing the signers always goes through the timelock. Executing a new set voids every other queued change, and a signer removed from the set cannot sign again.",
    ),
  );
}
