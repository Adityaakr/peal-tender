/**
 * Build a quorum proposal in the browser, or check one before relaying it.
 *
 * Building writes exactly the file `npm run v2 -- propose` writes (both use
 * scripts/v2/proposal.ts); the signers then add their ML-DSA-87 shares with
 * `npm run sign-action`, on their own machines. No key is ever asked for here.
 *
 * Checking reads a proposal file someone sent, recomputes what it does from its
 * arguments (never trusting its "summary"), verifies who proposed it (the
 * proposer's QoreSign signature, if any) and every share against the signer's key
 * as the chain's registry holds it. A sealed file (QoreSeal) is only described:
 * opening it needs a signer's key, which never enters this page.
 *
 * Every address typed into the builder goes through the QoreChain custody kit's
 * validateAddress (vendored), so a hex address with a broken EIP-55 checksum is
 * refused and a qor1 address is accepted.
 */
import { mldsa87 } from "@qorechain/pqc";
import { parseUnits, toBytes, type Address, type Hex } from "viem";
import { vaultAbi } from "../../../../scripts/v2/abi.ts";
import { OP_KINDS, actionIdOf, metadataHash, opData, type ACTIONS, type OpenParams, type SaleConfig } from "../../../../scripts/v2/encode.ts";
import {
  PROPOSAL_FORMAT,
  argsHashFor,
  decodeArgs,
  encodeArgs,
  parseProposal,
  shareMessage,
  type Proposal,
} from "../../../../scripts/v2/proposal.ts";
import { checkProposer, isSealed, type SignedProposal } from "../../../../scripts/v2/envelope.ts";
import { validateAddress } from "../../../../vendor/qorechain-custody-kit/address.ts";
import { CHAIN_ID } from "../config.ts";
import { ZERO, client, describeOp, member, type Snapshot, type Token } from "../data.ts";
import { type Ctx } from "../main.ts";
import { chip, dateTime, duration, h, hash, icon } from "../ui.ts";
import { fmt, header, signerName } from "./common.ts";

type ActionKey = "sweep" | "openTender" | "cancelTender" | "queue" | "startSealedSale" | "cancelSealedSale" | "deposit";

const ACTIONS_UI: { key: ActionKey; label: string; hint: string }[] = [
  { key: "sweep", label: "Send funds", hint: "Up to today's allowance, at once." },
  { key: "openTender", label: "Open a tender", hint: "A buyback at one clearing price." },
  { key: "startSealedSale", label: "Sealed buyback", hint: "Sell fUSD for PEAL-T on Peal Sealed Auction." },
  { key: "queue", label: "Queue a change", hint: "Large sends and rule changes wait the delay." },
  { key: "cancelTender", label: "Cancel the tender", hint: "Before it ends; sellers take their tokens back." },
  { key: "cancelSealedSale", label: "Cancel a sale", hint: "Only before the first bid." },
  { key: "deposit", label: "Pull a deposit", hint: "From an address that approved the vault." },
];

let chosen: ActionKey = "sweep";

// ---------------------------------------------------------------- form helpers

function field(label: string, control: HTMLElement, hint?: string, wide = false): HTMLElement {
  return h(`label.field${wide ? ".wide" : ""}`, h("span", label), control, hint ? h("small", hint) : null);
}

function input(name: string, placeholder = "", value = "", mono = false): HTMLInputElement {
  return h(`input.input${mono ? ".mono" : ""}`, { name, placeholder, value, spellcheck: "false", autocomplete: "off" }) as HTMLInputElement;
}

function select(name: string, options: [string, string][], value?: string): HTMLSelectElement {
  const sel = h("select.input", { name }) as HTMLSelectElement;
  for (const [v, l] of options) {
    const o = h("option", { value: v }, l) as HTMLOptionElement;
    if (v === value) o.selected = true;
    sel.append(o);
  }
  return sel;
}

function tokenOptions(s: Snapshot): [string, string][] {
  return [
    [s.pay.address, s.pay.symbol],
    [s.buy.address, s.buy.symbol],
    [ZERO, "QOR (native)"],
  ];
}

function tokenByAddr(s: Snapshot, a: string): Token {
  return [s.pay, s.buy, s.native].find((t) => t.address.toLowerCase() === a.toLowerCase()) ?? s.pay;
}

function addr(v: string, what: string): Address {
  const r = validateAddress(v.trim());
  if (!r.valid) throw new Error(`${what}: ${r.detail}`);
  return r.hex as Address;
}

function units(v: string, t: Token, what: string): bigint {
  const x = v.trim();
  if (!/^\d+(\.\d+)?$/.test(x)) throw new Error(`${what}: enter a number like 0.25`);
  const n = parseUnits(x, t.decimals);
  if (n <= 0n) throw new Error(`${what}: must be more than zero`);
  return n;
}

// ---------------------------------------------------------------- the page

export async function propose(ctx: Ctx): Promise<HTMLElement> {
  return h(
    "div",
    header(
      "Propose",
      "Build a treasury action here, then each signer signs it with their own key in the CLI. Or drop in a proposal someone sent you to see exactly what it does and whether its signatures are good.",
    ),
    builder(ctx),
    h("h2.section-title", "Check a proposal file", h("span.aside", "nothing leaves this page")),
    checker(ctx),
  );
}

function builder(ctx: Ctx): HTMLElement {
  const s = ctx.snap;
  const picker = h("div.segmented", { role: "group", "aria-label": "Action" });
  const hintEl = h("p.small.muted", { style: "margin:10px 0 16px" });
  const formHost = h("div");
  const result = h("div");
  const ttl = select(
    "ttl",
    [
      ["30", "30 minutes"],
      ["120", "2 hours"],
      ["720", "12 hours"],
      ["1380", "23 hours"],
    ],
    "120",
  );

  let read: () => { fn: string; args: unknown[]; summary: string; warn?: string } = () => {
    throw new Error("pick an action");
  };

  const draw = () => {
    picker.replaceChildren(
      ...ACTIONS_UI.map((a) => {
        const b = h("button", { type: "button", "aria-pressed": a.key === chosen ? "true" : "false" }, a.label);
        b.addEventListener("click", () => {
          chosen = a.key;
          result.replaceChildren();
          draw();
        });
        return b;
      }),
    );
    hintEl.textContent = ACTIONS_UI.find((a) => a.key === chosen)!.hint;
    const { form, reader } = forms[chosen](s);
    read = reader;
    formHost.replaceChildren(form);
  };

  const go = h("button.btn.btn-primary", { type: "button" }, icon("doc"), "Create the proposal");
  go.addEventListener("click", async () => {
    result.replaceChildren(h("p.small.muted", "Reading the vault's nonce and building the file…"));
    try {
      const r = read();
      const [block, nonce, factory, openTenderId] = await Promise.all([
        client.getBlock(),
        client.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "nonce" }) as Promise<bigint>,
        client.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "auctionFactory" }) as Promise<Address>,
        client.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "openTenderId" }) as Promise<bigint>,
      ]);
      const deadline = block.timestamp + BigInt(Number(ttl.value) * 60);
      const p: Proposal = {
        format: PROPOSAL_FORMAT,
        chainId: "9800",
        vault: ctx.vault,
        fn: r.fn,
        summary: r.summary,
        args: encodeArgs(r.fn, r.args),
        argsHash: argsHashFor(r.fn, r.args, { factory, openTenderId }),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        createdAt: new Date().toISOString(),
        shares: [],
      };
      // The exact bytes a signer will sign, cross-checked with the vault's own view.
      const m0 = s.members[0]!.address;
      const onChain = (await client.readContract({
        address: ctx.vault,
        abi: vaultAbi,
        functionName: "quorumMessage",
        args: [m0, actionIdOf(r.fn as keyof typeof ACTIONS), p.argsHash, deadline],
      })) as Hex;
      const same = onChain.toLowerCase() === shareMessage(p, m0).toLowerCase();
      result.replaceChildren(made(p, s, same, r.warn));
    } catch (e) {
      result.replaceChildren(h("div.note.bad", e instanceof Error ? e.message.split("\n")[0]! : String(e)));
    }
  });

  draw();
  return h(
    "section.card",
    h("div.card-head", h("h3", "Build a proposal"), h("span.small.muted", `the vault is at nonce ${s.nonce}`)),
    picker,
    hintEl,
    formHost,
    h("div.form-grid", { style: "margin-top:14px" }, field("Signatures must arrive within", ttl, "The vault refuses anything signed for more than a day ahead.")),
    h("div", { style: "margin-top:16px;display:flex;gap:10px;flex-wrap:wrap" }, go),
    result,
  );
}

function made(p: Proposal, s: Snapshot, sameAsVault: boolean, warn?: string): HTMLElement {
  const file = `${p.fn}-${p.nonce}.json`;
  const download = h("button.btn", { type: "button" }, icon("doc"), `Download ${file}`);
  download.addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2) + "\n"], { type: "application/json" }));
    const a = h("a", { href: url, download: file }) as HTMLAnchorElement;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const code = h("pre.code");
  const line = (c: string, comment = false) => code.append(h(comment ? "span.c" : "span", `${c}\n`));
  line("# each signer, on their own machine, with their own key:", true);
  line(`npm run sign-action -- ~/Downloads/${file} --as v2-signer-a`);
  line(`npm run sign-action -- ~/Downloads/${file} --as v2-signer-b`);
  line(`# then anyone, once ${s.threshold} shares are in (pass the file along between signers):`, true);
  line(`npm run v2 -- relay ~/Downloads/${file}`);
  return h(
    "div",
    { style: "margin-top:18px;border-top:1px solid var(--border);padding-top:18px" },
    warn ? h("div.note.warn", { style: "margin-bottom:14px" }, warn) : null,
    h("h3", p.summary),
    h(
      "dl.kv",
      { style: "margin:10px 0 14px" },
      h("dt", "Nonce"),
      h("dd", p.nonce),
      h("dt", "Deadline"),
      h("dd", dateTime(BigInt(p.deadline))),
      h("dt", "Argument hash"),
      h("dd", hash(p.argsHash, { label: "argument hash" })),
      h("dt", "Message check"),
      h(
        "dd",
        sameAsVault ? chip("Matches the vault's own quorumMessage", "ok") : chip("Does NOT match the vault's message: do not sign", "bad"),
      ),
    ),
    h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px" }, download),
    code,
    h(
      "p.small.muted",
      { style: "margin:10px 0 0" },
      "The file holds no secret. sign-action recomputes everything from the arguments and checks the vault's own message before it signs; the proposal goes stale as soon as the vault's nonce moves on.",
    ),
  );
}

// ---------------------------------------------------------------- one form per action

type Form = (s: Snapshot) => { form: HTMLElement; reader: () => { fn: string; args: unknown[]; summary: string; warn?: string } };

const forms: Record<ActionKey, Form> = {
  sweep: (s) => {
    const token = select("token", tokenOptions(s), s.pay.address);
    const to = input("to", "0x… recipient", "", true);
    const amt = input("amount", "0.10");
    return {
      form: h("div.form-grid", field("Token", token), field("Amount", amt), field("Recipient", to, undefined, true)),
      reader: () => {
        const t = tokenByAddr(s, token.value);
        const a = units(amt.value, t, "Amount");
        const recipient = addr(to.value, "Recipient");
        let warn: string | undefined;
        if (a > t.free) warn = `Only ${fmt(t.free, t)} ${t.symbol} is free: the vault will refuse this.`;
        else if (a > t.left) warn = `Above today's allowance (${fmt(t.left, t)} ${t.symbol} left): the vault will refuse it. Queue a large sweep instead.`;
        return { fn: "sweep", args: [t.address, recipient, a], summary: `Send ${fmt(a, t)} ${t.symbol} to ${recipient} now`, warn };
      },
    };
  },

  deposit: (s) => {
    const from = input("from", "0x… address that approved the vault", "", true);
    const amt = input("amount", "1.00");
    return {
      form: h("div.form-grid", field("From", from, undefined, true), field(`Amount (${s.pay.symbol})`, amt)),
      reader: () => {
        const a = units(amt.value, s.pay, "Amount");
        const f = addr(from.value, "From");
        return { fn: "deposit", args: [f, a], summary: `Pull ${fmt(a, s.pay)} ${s.pay.symbol} from ${f}` };
      },
    };
  },

  openTender: (s) => {
    const budget = input("budget", "0.05");
    const floor = input("floor", "0.001", "0.001");
    const step = input("step", "0.0001", "0.0001");
    const ticks = input("ticks", "10", "10");
    const hours = input("hours", "1", "1");
    const maxOffers = input("maxOffers", "20", "20");
    const minQty = input("minQty", "1", "1");
    return {
      form: h(
        "div.form-grid",
        field(`Budget (${s.pay.symbol})`, budget, `Draws on today's allowance (${fmt(s.pay.left, s.pay)} left).`),
        field("Runs for (hours)", hours),
        field(`Lowest price (${s.pay.symbol} per ${s.buy.symbol})`, floor),
        field(`Price step (${s.pay.symbol})`, step),
        field("Price ticks", ticks, "1 to 256"),
        field("Most offers", maxOffers, "1 to 200"),
        field(`Smallest offer (${s.buy.symbol})`, minQty),
      ),
      reader: () => {
        const p: OpenParams = {
          budget: units(budget.value, s.pay, "Budget"),
          floorPrice: units(floor.value, s.pay, "Lowest price"),
          tickSize: parseUnits(step.value.trim() || "0", s.pay.decimals),
          numTicks: Number(ticks.value),
          endTime: BigInt(Math.floor(Date.now() / 1000) + Math.round(Number(hours.value) * 3600)),
          maxOffers: Number(maxOffers.value),
          minQuantity: units(minQty.value, s.buy, "Smallest offer"),
        };
        if (!(p.numTicks >= 1 && p.numTicks <= 256)) throw new Error("Price ticks: 1 to 256");
        if (!(p.maxOffers >= 1 && p.maxOffers <= 200)) throw new Error("Most offers: 1 to 200");
        let warn: string | undefined;
        if (s.openTenderId !== 0n) warn = `Tender #${s.openTenderId} is still open: the vault allows one at a time.`;
        else if (p.budget > s.pay.left) warn = "The budget is above today's allowance: the vault will refuse it.";
        return {
          fn: "openTender",
          args: [p],
          summary: `Open a tender: budget ${fmt(p.budget, s.pay)} ${s.pay.symbol}, ${p.numTicks} prices from ${fmt(p.floorPrice, s.pay)}, for ${hours.value} h`,
          warn,
        };
      },
    };
  },

  cancelTender: (s) => ({
    form: h("p.small", s.openTenderId === 0n ? "There is no open tender." : `Cancels tender #${s.openTenderId}. Sellers then claim their tokens back.`),
    reader: () => {
      if (s.openTenderId === 0n) throw new Error("There is no open tender to cancel.");
      return { fn: "cancelTender", args: [], summary: `Cancel tender #${s.openTenderId}` };
    },
  }),

  queue: (s) => {
    const kind = select("kind", [
      ["Sweep", "Large sweep"],
      ["SetSigners", "New signer set"],
      ["SetDelay", "Timelock delay"],
      ["SetDailyCap", "Daily allowance"],
      ["SetAuctionFactory", "Auction factory"],
    ]);
    const host = h("div");
    let inner: () => { data: Hex; text: string } = () => ({ data: "0x", text: "" });
    const drawKind = () => {
      const k = kind.value;
      if (k === "Sweep") {
        const token = select("token", tokenOptions(s), s.pay.address);
        const to = input("to", "0x… recipient", "", true);
        const amt = input("amount", "10");
        host.replaceChildren(h("div.form-grid", field("Token", token), field("Amount", amt), field("Recipient", to, undefined, true)));
        inner = () => {
          const t = tokenByAddr(s, token.value);
          const a = units(amt.value, t, "Amount");
          const r = addr(to.value, "Recipient");
          return { data: opData.Sweep(t.address, r, a), text: `send ${fmt(a, t)} ${t.symbol} to ${r}` };
        };
      } else if (k === "SetSigners") {
        const members = h("textarea.input", { rows: 3, placeholder: "one address per line" }) as HTMLTextAreaElement;
        members.value = s.members.map((m) => m.address).join("\n");
        members.style.minHeight = "96px";
        const th = input("threshold", "2", String(s.threshold));
        host.replaceChildren(h("div.form-grid", field("Members", members, "Sorted for you. Every member needs a registered ML-DSA-87 key.", true), field("Threshold", th)));
        inner = () => {
          const m = members.value
            .split(/[\s,]+/)
            .filter(Boolean)
            .map((x) => addr(x, "Member"))
            .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
          const t = BigInt(th.value);
          if (t < 1n || t > BigInt(m.length)) throw new Error("Threshold: 1 to the number of members");
          return { data: opData.SetSigners(m, t), text: `a ${t} of ${m.length} signer set` };
        };
      } else if (k === "SetDelay") {
        const mins = input("minutes", "15", String(Number(s.delay) / 60));
        host.replaceChildren(h("div.form-grid", field("Delay (minutes)", mins, "5 minutes to 30 days")));
        inner = () => {
          const d = BigInt(Math.round(Number(mins.value) * 60));
          if (d < 300n || d > 2_592_000n) throw new Error("Delay: 5 minutes to 30 days");
          return { data: opData.SetDelay(d), text: `a delay of ${duration(d)}` };
        };
      } else if (k === "SetDailyCap") {
        const token = select("token", tokenOptions(s), s.pay.address);
        const cap = input("cap", "1");
        host.replaceChildren(h("div.form-grid", field("Token", token), field("Daily allowance", cap)));
        inner = () => {
          const t = tokenByAddr(s, token.value);
          const c = parseUnits(cap.value.trim() || "0", t.decimals);
          return { data: opData.SetDailyCap(t.address, c), text: `a ${t.symbol} allowance of ${fmt(c, t)} a day` };
        };
      } else {
        const f = input("factory", "0x… SealedAuctionFactory (or 0x000…0 to turn sales off)", s.factory, true);
        host.replaceChildren(h("div.form-grid", field("Auction factory", f, undefined, true)));
        inner = () => {
          const a = addr(f.value, "Factory");
          return { data: opData.SetAuctionFactory(a), text: a === ZERO ? "sealed sales off" : `the factory ${a}` };
        };
      }
    };
    kind.addEventListener("change", drawKind);
    drawKind();
    return {
      form: h("div", h("div.form-grid", field("Change", kind)), h("div", { style: "margin-top:14px" }, host)),
      reader: () => {
        const r = inner();
        return {
          fn: "queue",
          args: [OP_KINDS.indexOf(kind.value as (typeof OP_KINDS)[number]), r.data],
          summary: `Queue ${r.text} (runs after ${duration(s.delay)}; any one signer can veto)`,
        };
      },
    };
  },

  startSealedSale: (s) => {
    const name = input("name", "Buyback 1", "Buyback 1");
    const details = input("details", "Peal Tender sells fUSD for PEAL-T", "Peal Tender sells fUSD for PEAL-T");
    const supply = input("supply", "0.05", "0.05");
    const reserve = input("reserve", "5", "5");
    const step = input("step", "0.1", "0.1");
    const ticks = input("ticks", "20", "20");
    const hours = input("hours", "1", "1");
    const release = input("release", "1", "1");
    const minBid = input("minBid", "0.01", "0.01");
    const bond = input("bond", "1", "1");
    const maxBids = input("maxBids", "16", "16");
    const committee = input("committee", "0x… committee set id", "", true);
    return {
      form: h(
        "div.form-grid",
        field("Name", name),
        field("Details", details),
        field(`Selling (${s.pay.symbol})`, supply, `Draws on today's allowance (${fmt(s.pay.left, s.pay)} left).`),
        field(`Reserve (${s.buy.symbol} per ${s.pay.symbol})`, reserve, "The least the vault accepts."),
        field(`Price step (${s.buy.symbol})`, step),
        field("Price ticks", ticks),
        field("Bids open for (hours)", hours),
        field("Then releases for (hours)", release),
        field(`Smallest bid (${s.pay.symbol})`, minBid),
        field(`Bid bond (${s.buy.symbol})`, bond),
        field("Most bids", maxBids),
        field("Committee set id", committee, "From the auction's deployment record (committeeSetId).", true),
      ),
      reader: () => {
        if (s.factory === ZERO) throw new Error("Sealed sales are off: no auction factory is set.");
        const now = BigInt(Math.floor(Date.now() / 1000));
        const end = now + BigInt(Math.round(Number(hours.value) * 3600));
        const n = name.value.trim();
        const d = details.value.trim();
        if (!/^0x[0-9a-fA-F]{64}$/.test(committee.value.trim())) throw new Error("Committee set id: 0x and 64 hex characters");
        const cfg: SaleConfig = {
          issuer: s.vault,
          saleToken: s.pay.address,
          quoteToken: s.buy.address,
          totalSupply: units(supply.value, s.pay, "Selling"),
          saleDecimals: s.pay.decimals,
          reservePrice: units(reserve.value, s.buy, "Reserve"),
          tickSize: parseUnits(step.value.trim() || "0", s.buy.decimals),
          numTicks: Number(ticks.value),
          startTime: now,
          endTime: end,
          releaseDeadline: end + BigInt(Math.round(Number(release.value) * 3600)),
          minBidQuantity: units(minBid.value, s.pay, "Smallest bid"),
          maxQuantityPerAddress: 0n,
          maxBids: Number(maxBids.value),
          bidBond: parseUnits(bond.value.trim() || "0", s.buy.decimals),
          protocolFeeBps: 0,
          feeRecipient: ZERO,
          committeeSetId: committee.value.trim() as Hex,
          metadataHash: metadataHash(n, d),
        };
        const warn = cfg.totalSupply > s.pay.left ? "Above today's allowance: the vault will refuse it." : undefined;
        return {
          fn: "startSealedSale",
          args: [cfg, n, d],
          summary: `Sealed sale "${n}": sell ${fmt(cfg.totalSupply, s.pay)} ${s.pay.symbol} for at least ${reserve.value} ${s.buy.symbol} each`,
          warn,
        };
      },
    };
  },

  cancelSealedSale: (s) => {
    const live = s.sales.filter((x) => x.state === "Active");
    const pick = select(
      "auction",
      live.length ? live.map((x) => [x.auction, `${x.auction} (${fmt(x.supply, s.pay)} ${s.pay.symbol})`]) : [["", "No running sale"]],
    );
    return {
      form: h("div.form-grid", field("Sale", pick, "The auction refuses a cancel once a bid is in.", true)),
      reader: () => {
        const a = addr(pick.value, "Sale");
        return { fn: "cancelSealedSale", args: [a], summary: `Cancel the sealed sale ${a}` };
      },
    };
  },
};

// ---------------------------------------------------------------- checking a file

function checker(ctx: Ctx): HTMLElement {
  const s = ctx.snap;
  const out = h("div");
  const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "sr-only" }) as HTMLInputElement;
  const zone = h(
    "label.dropzone",
    fileInput,
    h("div", { style: "display:flex;justify-content:center;margin-bottom:6px;color:var(--accent)" }, icon("upload")),
    h("div", { style: "color:var(--text);font-weight:500" }, "Drop a proposal file here, or choose one"),
    h("div.small", "It is read in this page only."),
  );
  const run = async (text: string) => {
    out.replaceChildren(h("p.small.muted", "Checking…"));
    try {
      out.replaceChildren(await check(text, ctx, s));
    } catch (e) {
      out.replaceChildren(h("div.note.bad", { style: "margin-top:14px" }, e instanceof Error ? e.message : String(e)));
    }
  };
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) void f.text().then(run);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) void f.text().then(run);
  });
  return h("section.card", zone, out);
}

async function check(text: string, ctx: Ctx, s: Snapshot): Promise<HTMLElement> {
  const raw = JSON.parse(text) as unknown;
  if (isSealed(raw)) {
    const to = raw.envelopes.map((e) => e.to);
    return h(
      "div",
      { style: "margin-top:16px" },
      h("h3", { style: "margin:4px 0 4px" }, "A sealed proposal"),
      h(
        "p.small.muted",
        `Sealed by ${raw.from} with ML-KEM-1024 (QoreSeal) to ${to.length} signer${to.length === 1 ? "" : "s"}' keys in QoreChain's encryption key registry. ` +
          "Only they can read it, so this page cannot. Each opens it with npm run sign-action -- <file> --as <name>, which also checks the sender's signature against its key on chain.",
      ),
      h("ul.checks", ...to.map((q) => h("li", h("span", { style: "color:var(--green)" }, icon("check")), h("div", q)))),
    );
  }
  const p = parseProposal(text) as SignedProposal;
  const [block, nonce, factory, openTenderId] = await Promise.all([
    client.getBlock(),
    client.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "nonce" }) as Promise<bigint>,
    client.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "auctionFactory" }) as Promise<Address>,
    client.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "openTenderId" }) as Promise<bigint>,
  ]);
  const items: HTMLElement[] = [];
  const line = (ok: boolean | "warn", text: string, extra?: Node | string) =>
    items.push(
      h(
        "li",
        h("span", { style: `color:${ok === true ? "var(--green)" : ok === "warn" ? "var(--amber-text)" : "var(--red)"}` }, icon(ok === true ? "check" : ok === "warn" ? "pause" : "cross")),
        h("div", text, extra ? h("div.small.muted", extra) : null),
      ),
    );

  const args = decodeArgs(p);
  const forVault = p.vault.toLowerCase() === ctx.vault.toLowerCase() && p.chainId === "9800";
  line(forVault, forVault ? "For this vault on chain 9800" : `For another vault (${p.vault}) or chain (${p.chainId})`);

  // Who proposed it: the proposer's secp256k1 + ML-DSA-87 signature, against its key on chain.
  let proposerOk = true;
  try {
    const pc = await checkProposer(p, client, CHAIN_ID, new Date(Number(block.timestamp) * 1000));
    if (pc.status === "unsigned") line("warn", "Unsigned: nothing says who proposed it, so read what it does below");
    else {
      proposerOk = s.members.some((m) => m.address.toLowerCase() === pc.evm.toLowerCase());
      line(
        proposerOk,
        proposerOk
          ? `Proposed by ${signerName(s, pc.evm)}: its secp256k1 + ML-DSA-87 signature verifies against its key on chain`
          : `Signed by ${pc.from}, who is not a member of the signer set`,
        pc.from,
      );
    }
  } catch (e) {
    proposerOk = false;
    line(false, `The proposer's signature does NOT check out: ${e instanceof Error ? e.message : String(e)}`);
  }
  const h2 = argsHashFor(p.fn, args, { factory, openTenderId });
  line(h2 === p.argsHash, h2 === p.argsHash ? "Its arguments match its argument hash" : "Its arguments do NOT match its argument hash: do not sign or relay");
  line(BigInt(p.nonce) === nonce, BigInt(p.nonce) === nonce ? `Made at the vault's current nonce (${nonce})` : `Stale: made at nonce ${p.nonce}, the vault is at ${nonce}`);
  const left = BigInt(p.deadline) - block.timestamp;
  line(left > 0n ? true : false, left > 0n ? `Signatures valid for ${duration(left)} more` : `Expired at ${dateTime(BigInt(p.deadline))}`);

  let good = 0;
  for (const sh of p.shares) {
    const isMember = s.members.some((m) => m.address.toLowerCase() === sh.signer.toLowerCase());
    if (!isMember) {
      line(false, `Share from ${sh.signer}: not a member of the signer set`);
      continue;
    }
    const key = await member(sh.signer);
    const ok = key.usable && mldsa87.verify(toBytes(key.publicKey), toBytes(shareMessage(p, sh.signer)), toBytes(sh.signature));
    if (ok) good++;
    line(ok, `${signerName(s, sh.signer)}: ${ok ? "valid ML-DSA-87 signature for its key on chain" : "signature does NOT verify against its key on chain"}`, sh.signer);
  }
  if (p.shares.length === 0) line("warn", "No signatures yet");
  const dupes = new Set(p.shares.map((x) => x.signer.toLowerCase())).size !== p.shares.length;
  if (dupes) line(false, "The same signer appears twice");

  const ready = forVault && proposerOk && h2 === p.argsHash && BigInt(p.nonce) === nonce && left > 0n && good >= s.threshold && !dupes;
  return h(
    "div",
    { style: "margin-top:16px" },
    h("div.small.muted", "What it does (decoded from its arguments, not from its own description):"),
    h("h3", { style: "margin:4px 0 4px" }, whatItDoes(p.fn, args, s)),
    p.summary ? h("div.small.muted", { style: "margin-bottom:12px" }, `The file describes itself as: "${p.summary}"`) : null,
    h("ul.checks", ...items),
    h(
      "div",
      { style: "margin-top:14px" },
      ready
        ? h("div.note", `Ready: ${good} of ${s.threshold} needed signatures are valid. Relay it with npm run v2 -- relay <file>.`)
        : h("div.note.warn", `Not ready to relay: ${good} of ${s.threshold} needed signatures are valid${good >= s.threshold ? ", but a check above failed" : ""}.`),
    ),
  );
}

function whatItDoes(fn: string, args: readonly unknown[], s: Snapshot): string {
  const tok = (a: unknown) => [s.pay, s.buy, s.native].find((t) => t.address.toLowerCase() === String(a).toLowerCase());
  const money = (v: unknown, t: unknown) => {
    const k = tok(t);
    return k ? `${fmt(v as bigint, k)} ${k.symbol}` : `${v} of ${t}`;
  };
  switch (fn) {
    case "sweep":
      return `Send ${money(args[2], args[0])} to ${args[1]} now`;
    case "deposit":
      return `Pull ${money(args[1], s.pay.address)} from ${args[0]}`;
    case "openTender": {
      const p = args[0] as OpenParams;
      return `Open a tender with a budget of ${money(p.budget, s.pay.address)}, ${p.numTicks} prices from ${money(p.floorPrice, s.pay.address)}, ending ${dateTime(p.endTime)}`;
    }
    case "cancelTender":
      return "Cancel the open tender";
    case "queue": {
      const kind = OP_KINDS[Number(args[0])] ?? "Sweep";
      return `Queue: ${describeOp({ kind, data: args[1] as Hex }, s, fmt)}`;
    }
    case "startSealedSale": {
      const c = args[0] as SaleConfig;
      return `Sealed sale "${args[1]}": sell ${money(c.totalSupply, c.saleToken)} for ${tok(c.quoteToken)?.symbol ?? c.quoteToken}, bids close ${dateTime(c.endTime)}`;
    }
    case "cancelSealedSale":
      return `Cancel the sealed sale ${args[0]}`;
    default:
      return fn;
  }
}
