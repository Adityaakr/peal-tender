/**
 * cli.ts - operate Peal Tender v2 with post-quantum signatures.
 *
 * Accounts (in ~/.qore-peal-tender/, never the drill account):
 *   npm run v2 -- account new|register|status <name>
 *
 * A quorum action takes three steps, which can run on three machines:
 *   npm run v2 -- propose <action> ...          writes a proposal file, prints its path
 *   npm run sign-action -- <file> --as <name>   one signer adds an ML-DSA-87 share (repeat per signer)
 *   npm run v2 -- relay <file>                  sends it once `threshold` shares are in
 *
 * Proposal actions:
 *   sweep <token> <to> <amount>                 immediate, within the daily allowance
 *   deposit <from> <amount>
 *   open-tender <budget> <floorPrice> <tickSize> <numTicks> <durationSec> <maxOffers> <minQuantity>
 *   cancel-tender
 *   queue sweep <token> <to> <amount>           above the allowance: waits the delay
 *   queue signers <threshold> <addr,addr,...>
 *   queue delay <seconds> | queue cap <token> <cap> | queue factory <address>
 *   start-sale <config.json>                    a sealed buyback on Peal Sealed Auction
 *   cancel-sale <auction>
 * <token> is fusd, peal, native or an address. Amounts are base units.
 *
 * One signer alone:
 *   npm run v2 -- veto <opId> --as <name>
 * Anyone (permissionless):
 *   npm run v2 -- execute <opId> | settle | collect <auction>
 * Read-only and demos:
 *   npm run v2 -- status
 *   npm run v2 -- refusal-demo                  a scoped window refuses an off-target transaction
 *
 * Every transaction goes from the relayer (--relayer <name>, default "v2-relayer")
 * inside a window scoped to [vault, fUSD, PEAL-T, auction factory], for one
 * transaction, closed again afterwards. The relayer pays gas and has no authority.
 */
import { readFileSync } from "node:fs";
import { BaseError, decodeErrorResult, encodeFunctionData, keccak256, type Address, type Hex } from "viem";
import { FUSD, estimate, sendEvm } from "pqkit";
import { quorumMessage, signAnyAction, signQuorumShare, orderShares } from "pqkit/pqauthset";
import { erc20Abi, pqcKeyStatusAbi, tenderBookAbi, vaultAbi } from "./abi.ts";
import { loadV2Account, newV2Account, refuseDrill, registerV2, statusV2 } from "./accounts.ts";
import { ACTIONS, OP_KINDS, OP_STATES, actionIdOf, argsHash, metadataHash, opData, type OpenParams, type SaleConfig } from "./encode.ts";
import {
  CHAIN_ID,
  argsHashFor,
  client,
  decodeArgs,
  encodeArgs,
  loadDeployment,
  loadProposal,
  reader,
  saveProposal,
  type Proposal,
} from "./vault.ts";
import { withScopedWindow } from "./window.ts";

const argv = process.argv.slice(2);
function flag(name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
}
const AS = flag("as");
const RELAYER = flag("relayer", process.env.RELAYER?.trim() || "v2-relayer")!;
const TTL_MIN = BigInt(flag("ttl-min", "30")!);
const OUT = flag("out");

const dep = () => loadDeployment();
const VAULT = () => dep().contracts.PealTenderV2.address;
const read = <T>(fn: string, args: readonly unknown[] = []) => reader(VAULT())<T>(fn, args);

async function tokenArg(t: string): Promise<Address> {
  if (t === "native") return "0x0000000000000000000000000000000000000000";
  if (t === "fusd") return (await read<Address>("payToken")) ?? FUSD;
  if (t === "peal") return read<Address>("buyToken");
  if (!/^0x[0-9a-fA-F]{40}$/.test(t)) throw new Error(`bad token "${t}"`);
  return t as Address;
}

function addr(a: string | undefined, what: string): Address {
  if (!a || !/^0x[0-9a-fA-F]{40}$/.test(a)) throw new Error(`bad ${what} "${a}"`);
  refuseDrill(a, what);
  return a as Address;
}

async function targets(): Promise<string[]> {
  const t = [VAULT(), await read<Address>("payToken"), await read<Address>("buyToken")];
  const f = await read<Address>("auctionFactory");
  if (BigInt(f) !== 0n) t.push(f);
  return t;
}

/** Name the vault's custom error in a failed estimate, e.g. "OverDailyCap(fUSD, 40000000, 39000000)". */
function explain(err: unknown): Error {
  if (err instanceof BaseError) {
    const found = err.walk((e) => typeof (e as { data?: unknown }).data === "string") as { data?: Hex } | null;
    if (found?.data && found.data.length >= 10) {
      for (const abi of [vaultAbi, tenderBookAbi]) {
        try {
          const d = decodeErrorResult({ abi, data: found.data });
          return new Error(`the vault refused: ${d.errorName}(${(d.args ?? []).map(String).join(", ")})`);
        } catch {
          // not this ABI's error
        }
      }
    }
    return new Error(err.shortMessage);
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Send one transaction to the vault from the relayer inside a one-transaction scoped window. */
async function relayCall(data: Hex, label: string): Promise<Hex> {
  const relayer = await loadV2Account(RELAYER);
  const gas = await estimate(relayer, { to: VAULT(), data }).catch((e: unknown) => {
    throw explain(e);
  });
  console.log(`${label}: estimated gas ${gas}`);
  return withScopedWindow(relayer, { targets: await targets(), maxTxs: 1, blocks: 120, gasPerTx: gas }, async () => {
    const r = await sendEvm(relayer, { to: VAULT(), data, gas });
    console.log(`${label}: tx ${r.transactionHash} in block ${r.blockNumber}, gas used ${r.gasUsed}`);
    return r.transactionHash;
  });
}

// ------------------------------------------------------------------ propose

async function propose(): Promise<void> {
  const [what, ...a] = argv.slice(1);
  const block = await client().getBlock();
  const nonce = await read<bigint>("nonce");
  const deadline = block.timestamp + TTL_MIN * 60n;
  if (TTL_MIN < 1n || TTL_MIN > 1380n) throw new Error("--ttl-min must be 1 to 1380 (the vault allows up to one day)");
  const ctx = { factory: await read<Address>("auctionFactory"), openTenderId: await read<bigint>("openTenderId") };
  let fn: string;
  let args: unknown[];
  let summary: string;

  switch (what) {
    case "sweep": {
      const token = await tokenArg(a[0]!);
      const to = addr(a[1], "recipient");
      const amount = BigInt(a[2]!);
      fn = "sweep";
      args = [token, to, amount];
      summary = `sweep ${amount} of ${token} to ${to} now (draws on today's allowance)`;
      break;
    }
    case "deposit": {
      const from = addr(a[0], "from");
      const amount = BigInt(a[1]!);
      fn = "deposit";
      args = [from, amount];
      summary = `pull ${amount} fUSD from ${from} (it must have approved the vault)`;
      break;
    }
    case "open-tender": {
      const p: OpenParams = {
        budget: BigInt(a[0]!),
        floorPrice: BigInt(a[1]!),
        tickSize: BigInt(a[2]!),
        numTicks: Number(a[3]!),
        endTime: block.timestamp + BigInt(a[4]!),
        maxOffers: Number(a[5]!),
        minQuantity: BigInt(a[6]!),
      };
      fn = "openTender";
      args = [p];
      summary = `open a tender: budget ${p.budget}, floor ${p.floorPrice} + ${p.tickSize} x tick, ${p.numTicks} ticks, ends ${p.endTime}`;
      break;
    }
    case "cancel-tender": {
      if (ctx.openTenderId === 0n) throw new Error("no open tender");
      fn = "cancelTender";
      args = [];
      summary = `cancel open tender ${ctx.openTenderId}`;
      break;
    }
    case "queue": {
      const [sub, ...b] = a;
      let kind: (typeof OP_KINDS)[number];
      let data: Hex;
      if (sub === "sweep") {
        const token = await tokenArg(b[0]!);
        const to = addr(b[1], "recipient");
        kind = "Sweep";
        data = opData.Sweep(token, to, BigInt(b[2]!));
        summary = `QUEUE a sweep of ${b[2]} of ${token} to ${to} (after the delay)`;
      } else if (sub === "signers") {
        const members = b[1]!.split(",").map((m) => addr(m, "member"));
        members.sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1));
        kind = "SetSigners";
        data = opData.SetSigners(members, BigInt(b[0]!));
        summary = `QUEUE a new signer set ${b[0]}-of-${members.length}: ${members.join(", ")}`;
      } else if (sub === "delay") {
        kind = "SetDelay";
        data = opData.SetDelay(BigInt(b[0]!));
        summary = `QUEUE delay = ${b[0]} s`;
      } else if (sub === "cap") {
        const token = await tokenArg(b[0]!);
        kind = "SetDailyCap";
        data = opData.SetDailyCap(token, BigInt(b[1]!));
        summary = `QUEUE daily cap of ${token} = ${b[1]}`;
      } else if (sub === "factory") {
        kind = "SetAuctionFactory";
        data = opData.SetAuctionFactory(addr(b[0], "factory"));
        summary = `QUEUE auction factory = ${b[0]}`;
      } else {
        throw new Error("queue sweep|signers|delay|cap|factory ...");
      }
      fn = "queue";
      args = [OP_KINDS.indexOf(kind), data];
      break;
    }
    case "start-sale": {
      const j = JSON.parse(readFileSync(a[0]!, "utf8")) as Record<string, string | number>;
      const name = String(j.name);
      const details = String(j.details);
      const cfg: SaleConfig = {
        issuer: VAULT(),
        saleToken: await read<Address>("payToken"),
        quoteToken: await read<Address>("buyToken"),
        totalSupply: BigInt(j.totalSupply!),
        saleDecimals: Number(
          await client().readContract({ address: await read<Address>("payToken"), abi: erc20Abi, functionName: "decimals" }),
        ),
        reservePrice: BigInt(j.reservePrice!),
        tickSize: BigInt(j.tickSize!),
        numTicks: Number(j.numTicks),
        startTime: block.timestamp,
        endTime: block.timestamp + BigInt(j.durationSec!),
        releaseDeadline: block.timestamp + BigInt(j.durationSec!) + BigInt(j.releaseSec!),
        minBidQuantity: BigInt(j.minBidQuantity!),
        maxQuantityPerAddress: BigInt(j.maxQuantityPerAddress ?? 0),
        maxBids: Number(j.maxBids),
        bidBond: BigInt(j.bidBond!),
        protocolFeeBps: 0,
        feeRecipient: "0x0000000000000000000000000000000000000000",
        committeeSetId: j.committeeSetId as Hex,
        metadataHash: metadataHash(name, details),
      };
      if (BigInt(ctx.factory) === 0n) throw new Error("the vault has no auction factory set");
      fn = "startSealedSale";
      args = [cfg, name, details];
      summary = `sealed sale "${name}": sell ${cfg.totalSupply} fUSD for PEAL-T, reserve ${cfg.reservePrice} PEAL-T per fUSD, via factory ${ctx.factory}`;
      break;
    }
    case "cancel-sale": {
      const auction = addr(a[0], "auction");
      fn = "cancelSealedSale";
      args = [auction];
      summary = `cancel sealed sale ${auction}`;
      break;
    }
    default:
      throw new Error(`unknown proposal "${what}"`);
  }

  const p: Proposal = {
    format: "peal-tender-v2/proposal/1",
    chainId: CHAIN_ID.toString(),
    vault: VAULT(),
    fn,
    summary,
    args: encodeArgs(fn, args),
    argsHash: argsHashFor(fn, args, ctx),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    createdAt: new Date().toISOString(),
    shares: [],
  };
  const file = saveProposal(p, OUT);
  console.log(summary);
  console.log(`nonce ${nonce}, deadline ${deadline} (${TTL_MIN} min)`);
  console.log(`proposal: ${file}`);
}

// ------------------------------------------------------------------ sign-action

async function signAction(): Promise<void> {
  const file = argv[1];
  if (!file || !AS) throw new Error("sign-action <proposal.json> --as <signer name>");
  const p = loadProposal(file);
  if (p.vault.toLowerCase() !== VAULT().toLowerCase()) throw new Error(`proposal is for vault ${p.vault}, not ${VAULT()}`);
  const signer = await loadV2Account(AS);
  const me = signer.evm as Address;
  if (!(await read<boolean>("isMember", [me]))) throw new Error(`${AS} (${me}) is not a member of the vault's signer set`);
  const nonce = await read<bigint>("nonce");
  if (nonce.toString() !== p.nonce) throw new Error(`stale proposal: made at nonce ${p.nonce}, the vault is at ${nonce}`);

  // Recompute what is signed from the arguments themselves, never from the file's claim.
  const args = decodeArgs(p);
  const ctx = { factory: await read<Address>("auctionFactory"), openTenderId: await read<bigint>("openTenderId") };
  const h = argsHashFor(p.fn, args, ctx);
  if (h !== p.argsHash) throw new Error("the proposal's argsHash does not match its arguments; not signing");
  const action = actionIdOf(p.fn as keyof typeof ACTIONS);
  const fields = { chainId: CHAIN_ID, verifier: p.vault, action, nonce, deadline: BigInt(p.deadline), argsHash: h };

  // Cross-check the exact bytes with the vault's own view before signing.
  const onChain = await read<Hex>("quorumMessage", [me, action, h, BigInt(p.deadline)]);
  if (onChain.toLowerCase() !== quorumMessage(fields, me).toLowerCase()) throw new Error("local and on-chain messages differ");

  console.log(`signing as ${AS} (${me}): ${p.summary}`);
  const share = signQuorumShare(signer.pqc, me, fields);
  p.shares = p.shares.filter((x) => x.signer.toLowerCase() !== me.toLowerCase());
  p.shares.push({ signer: me, signature: share.signature });
  saveProposal(p, file);
  const t = await read<bigint>("threshold");
  console.log(`share added (${p.shares.length} of ${t} needed); keccak ${keccak256(share.signature).slice(0, 18)}…`);
}

// ------------------------------------------------------------------ relay

async function relay(): Promise<void> {
  const p = loadProposal(argv[1]!);
  const nonce = await read<bigint>("nonce");
  if (nonce.toString() !== p.nonce) throw new Error(`stale proposal: made at nonce ${p.nonce}, the vault is at ${nonce}`);
  const block = await client().getBlock();
  if (block.timestamp > BigInt(p.deadline)) throw new Error("the proposal's deadline has passed; propose again");
  const t = await read<bigint>("threshold");
  if (BigInt(p.shares.length) < t) throw new Error(`${p.shares.length} shares, ${t} needed`);
  const { signers, signatures } = orderShares(p.shares);
  const auth = { deadline: BigInt(p.deadline), signers, signatures };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = encodeFunctionData({ abi: vaultAbi, functionName: p.fn, args: [...decodeArgs(p), auth] } as any);
  console.log(p.summary);
  await relayCall(data, p.fn);
}

async function veto(): Promise<void> {
  const opId = BigInt(argv[1]!);
  if (!AS) throw new Error("veto <opId> --as <signer name>");
  const signer = await loadV2Account(AS);
  const me = signer.evm as Address;
  const nonce = await read<bigint>("nonce");
  const block = await client().getBlock();
  const deadline = block.timestamp + TTL_MIN * 60n;
  const fields = { chainId: CHAIN_ID, verifier: VAULT(), action: actionIdOf("veto"), nonce, deadline, argsHash: argsHash.veto(opId) };
  const onChain = await read<Hex>("vetoMessage", [me, opId, deadline]);
  const share = signAnyAction(signer.pqc, me, fields);
  const { anyMessage } = await import("pqkit/pqauthset");
  if (onChain.toLowerCase() !== anyMessage(fields, me).toLowerCase()) throw new Error("local and on-chain messages differ");
  const data = encodeFunctionData({ abi: vaultAbi, functionName: "veto", args: [opId, deadline, me, share.signature] });
  await relayCall(data, `veto ${opId}`);
}

// ------------------------------------------------------------------ permissionless

const permissionless = {
  execute: () =>
    relayCall(encodeFunctionData({ abi: vaultAbi, functionName: "execute", args: [BigInt(argv[1]!)] }), `execute ${argv[1]}`),
  settle: () => relayCall(encodeFunctionData({ abi: vaultAbi, functionName: "settle", args: [] }), "settle"),
  collect: () =>
    relayCall(
      encodeFunctionData({ abi: vaultAbi, functionName: "collectSealedSale", args: [addr(argv[1], "auction")] }),
      "collectSealedSale",
    ),
};

/** Under a window scoped to the vault's targets, a transaction to anything else is refused by the chain. */
async function refusalDemo(): Promise<void> {
  const relayer = await loadV2Account(RELAYER);
  const offTarget = "0x000000000000000000000000000000000000dEaD" as Address;
  await withScopedWindow(relayer, { targets: await targets(), maxTxs: 1, blocks: 60, gasPerTx: 50_000n }, async () => {
    try {
      const r = await sendEvm(relayer, { to: offTarget, value: 0n, gas: 30_000n });
      console.log(`UNEXPECTED: off-target transaction ${r.transactionHash} was accepted`);
      process.exitCode = 1;
    } catch (err) {
      console.log(`refused as expected: a transaction to ${offTarget}, outside the window's targets`);
      console.log(`  ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
    }
  });
}

// ------------------------------------------------------------------ status

async function status(): Promise<void> {
  const v = VAULT();
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
  console.log(`vault:      ${v}`);
  console.log(`signers:    ${threshold}-of-${members.length}, nonce ${nonce}, epoch ${epoch}`);
  for (const m of members) {
    const [registered, algo, key, pop] = (await client().readContract({
      address: "0x0000000000000000000000000000000000000a02",
      abi: pqcKeyStatusAbi,
      functionName: "pqcKeyStatus",
      args: [m],
    })) as readonly [boolean, number, Hex, boolean];
    console.log(
      `  ${m}  ${registered ? "registered" : "NO KEY"}, algorithm ${algo === 1 ? "ML-DSA-87" : algo}, possession ${pop ? "proven" : "NOT proven"}, key ${keccak256(key).slice(0, 14)}…`,
    );
  }
  console.log(`timelock:   delay ${delay} s; auction factory ${BigInt(factory) === 0n ? "none" : factory}`);
  for (const [label, token] of [
    ["fUSD", pay],
    ["PEAL-T", buy],
    ["native", "0x0000000000000000000000000000000000000000"],
  ] as const) {
    const [cap, left, free] = await Promise.all([
      read<bigint>("dailyCap", [token]),
      read<bigint>("remainingToday", [token]),
      read<bigint>("freeBalance", [token]),
    ]);
    console.log(`  ${label.padEnd(7)} free ${free}; daily cap ${cap}, left today ${left}`);
  }
  const now = (await client().getBlock()).timestamp;
  for (let i = 1n; i <= opCount; i++) {
    const op = await read<{ kind: number; state: number; eta: bigint; epoch: bigint; data: Hex }>("getOp", [i]);
    const st = OP_STATES[op.state];
    const when = op.state === 1 ? (now >= op.eta ? "ready" : `in ${op.eta - now} s`) : "";
    console.log(`  op ${i}: ${OP_KINDS[op.kind]} ${st} ${when}${op.epoch !== epoch && op.state === 1 ? " (void: older signer set)" : ""}`);
  }
  console.log(`tenders:    ${tenderCount} (open: ${openTender === 0n ? "none" : openTender}); reserved ${await read<bigint>("reservedPay")}, escrowed ${await read<bigint>("escrowedBuy")}`);
  console.log(`sales:      ${saleCount}`);
  for (let i = 0n; i < saleCount; i++) {
    const a = await read<Address>("saleAt", [i]);
    const s = await read<{ state: number; supply: bigint; proceeds: bigint; returned: bigint }>("getSale", [a]);
    console.log(`  ${a}: ${["None", "Active", "Collected", "Cancelled"][s.state]}, supply ${s.supply}, proceeds ${s.proceeds}, returned ${s.returned}`);
  }
}

// ------------------------------------------------------------------ main

const cmd = argv[0] ?? "status";
const commands: Record<string, () => Promise<unknown>> = {
  status,
  propose,
  "sign-action": signAction,
  relay,
  veto,
  ...permissionless,
  "refusal-demo": refusalDemo,
  account: async () => {
    const [sub, name] = argv.slice(1);
    if (!name) throw new Error("account new|register|status <name>");
    if (sub === "new") return newV2Account(name);
    if (sub === "register") return registerV2(name);
    if (sub === "status") return statusV2(name);
    throw new Error("account new|register|status <name>");
  },
};
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command "${cmd}". Commands: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
