/**
 * The read-only Peal Tender v2 dashboard: vault state, the signer set with each
 * member's key read live from `pqcKeyStatus`, the daily allowance, the timelock
 * queue, tenders and sealed sales. It holds no keys and sends nothing.
 */
import { createPublicClient, decodeAbiParameters, formatUnits, http, keccak256, type Address, type Hex } from "viem";
import { erc20Abi, pqcKeyStatusAbi, vaultAbi } from "../../scripts/v2/abi.ts";
import { OP_KINDS, OP_STATES } from "../../scripts/v2/encode.ts";

// ?rpc=http://127.0.0.1:8545 reads a local node instead (for a local run with mock precompiles).
const RPC = new URLSearchParams(location.search).get("rpc") ?? "https://evm-testnet.qore.host";
const KEY_STATUS = "0x0000000000000000000000000000000000000a02" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const client = createPublicClient({
  chain: {
    id: 9800,
    name: "QoreChain Testnet",
    nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  },
  transport: http(RPC),
});

const deployments = import.meta.glob("../../deployments/qorechain-diana-v2.json", { eager: true, import: "default" });
const deployed = Object.values(deployments)[0] as { contracts?: { PealTenderV2?: { address?: string } } } | undefined;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;
const pill = (text: string, cls: string) => `<span class="pill ${cls}">${esc(text)}</span>`;
const rows = (head: string[], body: string[][]) =>
  `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` +
  (body.length ? body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") : `<tr><td class="muted" colspan="${head.length}">none</td></tr>`);

function pickVault(): Address | undefined {
  const q = new URLSearchParams(location.search).get("vault") ?? deployed?.contracts?.PealTenderV2?.address;
  return q && /^0x[0-9a-fA-F]{40}$/.test(q) ? (q as Address) : undefined;
}

async function load(vault: Address): Promise<void> {
  const read = <T>(functionName: string, args: readonly unknown[] = []) =>
    client.readContract({ address: vault, abi: vaultAbi, functionName, args } as never) as Promise<T>;
  const now = (await client.getBlock()).timestamp;
  const [members, threshold, nonce, epoch, delay, factory, pay, buy, opCount, tenderCount, openTender, saleCount] =
    await Promise.all([
      read<Address[]>("members"),
      read<bigint>("threshold"),
      read<bigint>("nonce"),
      read<bigint>("setEpoch"),
      read<bigint>("delay"),
      read<Address>("auctionFactory"),
      read<Address>("payToken"),
      read<Address>("buyToken"),
      read<bigint>("opCount"),
      read<bigint>("tenderCount"),
      read<bigint>("openTenderId"),
      read<bigint>("saleCount"),
    ]);
  const meta = async (t: Address) =>
    Promise.all([
      client.readContract({ address: t, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
      client.readContract({ address: t, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
    ]);
  const [[paySym, payDec], [buySym, buyDec]] = await Promise.all([meta(pay), meta(buy)]);
  const fmt = (v: bigint, d: number) => formatUnits(v, d);

  const [payBal, buyBal, nativeBal, reserved, escrowed] = await Promise.all([
    client.readContract({ address: pay, abi: erc20Abi, functionName: "balanceOf", args: [vault] }) as Promise<bigint>,
    client.readContract({ address: buy, abi: erc20Abi, functionName: "balanceOf", args: [vault] }) as Promise<bigint>,
    client.getBalance({ address: vault }),
    read<bigint>("reservedPay"),
    read<bigint>("escrowedBuy"),
  ]);
  $("overview").innerHTML = [
    ["address", `<span class="mono">${vault}</span>`],
    ["signer set", `${threshold}-of-${members.length}, nonce ${nonce}, epoch ${epoch}`],
    ["timelock delay", `${delay} s`],
    ["auction factory", factory === ZERO ? "none (sealed sales off)" : `<span class="mono">${factory}</span>`],
    [paySym, `${fmt(payBal, payDec)} (reserved for tenders ${fmt(reserved, payDec)})`],
    [buySym, `${fmt(buyBal, buyDec)} (sellers' escrow ${fmt(escrowed, buyDec)})`],
    ["QOR", fmt(nativeBal, 18)],
  ]
    .map(([k, v]) => `<div>${esc(k!)}</div><div>${v}</div>`)
    .join("");

  const capRows = await Promise.all(
    ([[paySym, pay, payDec], [buySym, buy, buyDec], ["QOR", ZERO, 18]] as const).map(async ([sym, t, d]) => {
      const [cap, left, free] = await Promise.all([
        read<bigint>("dailyCap", [t]),
        read<bigint>("remainingToday", [t]),
        read<bigint>("freeBalance", [t]),
      ]);
      return [esc(sym), fmt(free, d), fmt(cap, d), `${fmt(left, d)} ${left === 0n ? pill("timelock only", "warn") : ""}`];
    }),
  );
  $("caps").innerHTML = rows(["token", "free", "daily cap", "left today"], capRows);

  const signerRows = await Promise.all(
    members.map(async (m) => {
      const [registered, algo, key, pop] = (await client.readContract({
        address: KEY_STATUS,
        abi: pqcKeyStatusAbi,
        functionName: "pqcKeyStatus",
        args: [m],
      })) as readonly [boolean, number, Hex, boolean];
      const usable = registered && algo === 1 && pop && (key.length - 2) / 2 === 2592;
      return [
        `<span class="mono">${m}</span>`,
        registered ? pill("registered", "ok") : pill("no key", "bad"),
        algo === 1 ? "ML-DSA-87" : String(algo),
        pop ? pill("proven", "ok") : pill("not proven", "bad"),
        `<span class="mono">${(key.length - 2) / 2} B, keccak ${keccak256(key).slice(0, 12)}…</span>`,
        usable ? pill("can sign", "ok") : pill("cannot sign", "bad"),
      ];
    }),
  );
  $("signers").innerHTML = rows(["member", "key", "algorithm", "possession", "public key", "status"], signerRows);

  const opRows: string[][] = [];
  for (let i = opCount; i >= 1n && opRows.length < 25; i--) {
    const op = await read<{ kind: number; state: number; eta: bigint; epoch: bigint; data: Hex }>("getOp", [i]);
    const kind = OP_KINDS[op.kind] ?? String(op.kind);
    const st = OP_STATES[op.state] ?? String(op.state);
    let what = "";
    try {
      if (kind === "Sweep") {
        const [t, to, a] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], op.data);
        what = `${a} of ${short(t)} → ${short(to)}`;
      } else if (kind === "SetSigners") {
        const [ms, th] = decodeAbiParameters([{ type: "address[]" }, { type: "uint256" }], op.data);
        what = `${th}-of-${ms.length}: ${ms.map(short).join(", ")}`;
      } else if (kind === "SetDelay") {
        what = `${decodeAbiParameters([{ type: "uint64" }], op.data)[0]} s`;
      } else if (kind === "SetDailyCap") {
        const [t, c] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], op.data);
        what = `${short(t)} cap ${c}`;
      } else {
        what = short(decodeAbiParameters([{ type: "address" }], op.data)[0]);
      }
    } catch {
      what = `<span class="mono">${op.data.slice(0, 42)}…</span>`;
    }
    const voided = op.state === 1 && op.epoch !== epoch;
    const timing =
      op.state !== 1 ? "" : voided ? pill("void (older signer set)", "bad") : now >= op.eta ? pill("ready to execute", "ok") : pill(`in ${op.eta - now} s`, "warn");
    opRows.push([String(i), esc(kind), esc(what), st === "Vetoed" ? pill("vetoed", "bad") : esc(st), timing]);
  }
  $("ops").innerHTML = rows(["#", "change", "what", "state", "timing"], opRows);

  const tenderRows: string[][] = [];
  for (let i = tenderCount; i >= 1n && tenderRows.length < 10; i--) {
    const t = await read<{
      state: number;
      numTicks: number;
      clearingTick: number;
      offerCount: number;
      claimedCount: number;
      endTime: bigint;
      budget: bigint;
      price: bigint;
      bought: bigint;
    }>("getTender", [i]);
    const st = ["None", "Open", "Settled", "Failed"][t.state]!;
    tenderRows.push([
      `${i}${i === openTender ? " " + pill("open", "ok") : ""}`,
      esc(st),
      fmt(t.budget, payDec),
      String(t.offerCount),
      t.state === 2 ? `${fmt(t.price, payDec)} ${esc(paySym)} (tick ${t.clearingTick})` : "",
      t.state === 2 ? fmt(t.bought, buyDec) : "",
      t.state === 1 ? (now >= t.endTime ? pill("ended: anyone may settle", "warn") : `ends in ${t.endTime - now} s`) : `${t.claimedCount}/${t.offerCount} claimed`,
    ]);
  }
  $("tenders").innerHTML = rows(["#", "state", `budget (${paySym})`, "offers", "clearing price", `bought (${buySym})`, ""], tenderRows);

  const saleRows: string[][] = [];
  for (let i = saleCount; i >= 1n && saleRows.length < 10; i--) {
    const a = await read<Address>("saleAt", [i - 1n]);
    const s = await read<{ state: number; startedAt: bigint; supply: bigint; proceeds: bigint; returned: bigint }>("getSale", [a]);
    saleRows.push([
      `<span class="mono">${a}</span>`,
      esc(["None", "Active", "Collected", "Cancelled"][s.state]!),
      fmt(s.supply, payDec),
      s.state === 2 ? fmt(s.proceeds, buyDec) : "",
      s.state >= 2 ? fmt(s.returned, payDec) : "",
    ]);
  }
  $("sales").innerHTML = rows(["auction", "state", `supply (${paySym})`, `proceeds (${buySym})`, `returned (${paySym})`], saleRows);
  $("updated").textContent = ` Last read at block time ${new Date(Number(now) * 1000).toISOString()}.`;
}

let timer: number | undefined;
function start(vault: Address): void {
  ($("vault") as HTMLInputElement).value = vault;
  const tick = () =>
    load(vault)
      .then(() => ($("error").textContent = ""))
      .catch((e: unknown) => ($("error").textContent = e instanceof Error ? e.message.split("\n")[0]! : String(e)));
  void tick();
  if (timer) clearInterval(timer);
  timer = window.setInterval(tick, 15_000);
}

$("pick").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = ($("vault") as HTMLInputElement).value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    $("error").textContent = "not an address";
    return;
  }
  const q = new URLSearchParams(location.search);
  q.set("vault", v);
  history.replaceState(null, "", `?${q}`);
  start(v as Address);
});

const initial = pickVault();
if (initial) start(initial);
else $("error").textContent = "No v2 vault deployed yet: enter an address, or open ?vault=0x…";
