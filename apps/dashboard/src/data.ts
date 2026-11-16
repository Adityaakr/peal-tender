/**
 * data.ts - everything the app reads from the chain. Read-only: no wallet, no keys.
 *
 * The vault address comes from ?vault=, else from deployments/qorechain-diana-v2.json
 * when it exists. ?rpc= points at a local node (anvil with mock precompiles) instead
 * of the testnet's EVM RPC, which allows browser calls from any origin (kit spike S4).
 */
import {
  createPublicClient,
  decodeAbiParameters,
  decodeEventLog,
  http,
  keccak256,
  type Abi,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { erc20Abi, pqcKeyStatusAbi, tenderBookAbi, vaultAbi } from "../../../scripts/v2/abi.ts";
import { OP_KINDS, OP_STATES } from "../../../scripts/v2/encode.ts";

export const TESTNET_RPC = "https://evm-testnet.qore.host";
export const KEY_STATUS = "0x0000000000000000000000000000000000000a02" as Address;
export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const params = new URLSearchParams(location.search);
export const RPC = params.get("rpc") ?? TESTNET_RPC;
export const IS_LOCAL = RPC !== TESTNET_RPC;

const deployments = import.meta.glob("../../../deployments/qorechain-diana-v2.json", { eager: true, import: "default" });
const deployed = Object.values(deployments)[0] as
  | { contracts?: { PealTenderV2?: { address?: string; block?: number } } }
  | undefined;

export function vaultFromUrl(): Address | undefined {
  const v = params.get("vault") ?? deployed?.contracts?.PealTenderV2?.address;
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined;
}

export const client: PublicClient = createPublicClient({
  chain: {
    id: 9800,
    name: "QoreChain testnet",
    nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  },
  transport: http(RPC, { batch: true }),
});

// ---------------------------------------------------------------- types

export interface Token {
  address: Address;
  symbol: string;
  decimals: number;
  balance: bigint;
  free: bigint;
  cap: bigint;
  left: bigint;
}

export interface Member {
  address: Address;
  registered: boolean;
  algorithm: number;
  possession: boolean;
  keyLength: number;
  keyHash: Hex;
  publicKey: Hex;
  usable: boolean;
}

export interface Op {
  id: bigint;
  kind: (typeof OP_KINDS)[number];
  state: (typeof OP_STATES)[number];
  eta: bigint;
  epoch: bigint;
  data: Hex;
  void: boolean;
  lapsed: boolean;
}

export interface Tender {
  id: bigint;
  state: "None" | "Open" | "Settled" | "Failed";
  numTicks: number;
  clearingTick: number;
  maxOffers: number;
  offerCount: number;
  claimedCount: number;
  endTime: bigint;
  budget: bigint;
  floorPrice: bigint;
  tickSize: bigint;
  minQuantity: bigint;
  price: bigint;
  bought: bigint;
  supplyAtClearingTick: bigint;
  fillAtClearingTick: bigint;
  reserved: bigint;
  escrowed: bigint;
}

export interface Sale {
  auction: Address;
  state: "None" | "Active" | "Collected" | "Cancelled";
  startedAt: bigint;
  supply: bigint;
  proceeds: bigint;
  returned: bigint;
  auctionState?: string;
  endTime?: bigint;
  releaseDeadline?: bigint;
}

export interface Snapshot {
  vault: Address;
  block: { number: bigint; timestamp: bigint };
  pay: Token;
  buy: Token;
  native: Token;
  reservedPay: bigint;
  escrowedBuy: bigint;
  members: Member[];
  threshold: number;
  nonce: bigint;
  epoch: bigint;
  delay: bigint;
  factory: Address;
  ops: Op[];
  tenders: Tender[];
  openTenderId: bigint;
  sales: Sale[];
}

// ---------------------------------------------------------------- reads

const read = <T>(vault: Address, functionName: string, args: readonly unknown[] = []) =>
  client.readContract({ address: vault, abi: vaultAbi, functionName, args } as never) as Promise<T>;

async function token(vault: Address, address: Address): Promise<Token> {
  const native = address === ZERO;
  const [symbol, decimals, balance, free, cap, left] = await Promise.all([
    native ? "QOR" : (client.readContract({ address, abi: erc20Abi, functionName: "symbol" }) as Promise<string>),
    native ? 18 : (client.readContract({ address, abi: erc20Abi, functionName: "decimals" }) as Promise<number>),
    native
      ? client.getBalance({ address: vault })
      : (client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [vault] }) as Promise<bigint>),
    read<bigint>(vault, "freeBalance", [address]),
    read<bigint>(vault, "dailyCap", [address]),
    read<bigint>(vault, "remainingToday", [address]),
  ]);
  return { address, symbol, decimals: Number(decimals), balance, free, cap, left };
}

export async function member(address: Address): Promise<Member> {
  const [registered, algorithm, publicKey, possession] = (await client.readContract({
    address: KEY_STATUS,
    abi: pqcKeyStatusAbi,
    functionName: "pqcKeyStatus",
    args: [address],
  })) as readonly [boolean, number, Hex, boolean];
  const keyLength = (publicKey.length - 2) / 2;
  return {
    address,
    registered,
    algorithm: Number(algorithm),
    possession,
    keyLength,
    publicKey,
    keyHash: keccak256(publicKey),
    usable: registered && Number(algorithm) === 1 && possession && keyLength === 2592,
  };
}

const TENDER_STATES = ["None", "Open", "Settled", "Failed"] as const;
const SALE_STATES = ["None", "Active", "Collected", "Cancelled"] as const;
const AUCTION_STATES = ["Created", "Funded", "Open for bids", "Closed", "Settled", "Failed", "Cancelled"];

const auctionAbi = [
  { type: "function", name: "state", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "config",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "issuer", type: "address" },
          { name: "saleToken", type: "address" },
          { name: "quoteToken", type: "address" },
          { name: "totalSupply", type: "uint256" },
          { name: "saleDecimals", type: "uint8" },
          { name: "reservePrice", type: "uint256" },
          { name: "tickSize", type: "uint256" },
          { name: "numTicks", type: "uint16" },
          { name: "startTime", type: "uint64" },
          { name: "endTime", type: "uint64" },
          { name: "releaseDeadline", type: "uint64" },
          { name: "minBidQuantity", type: "uint256" },
          { name: "maxQuantityPerAddress", type: "uint256" },
          { name: "maxBids", type: "uint32" },
          { name: "bidBond", type: "uint256" },
          { name: "protocolFeeBps", type: "uint16" },
          { name: "feeRecipient", type: "address" },
          { name: "committeeSetId", type: "bytes32" },
          { name: "metadataHash", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

export async function snapshot(vault: Address): Promise<Snapshot> {
  const [block, payAddr, buyAddr, memberAddrs, threshold, nonce, epoch, delay, factory, opCount, tenderCount, openTenderId, saleCount, reservedPay, escrowedBuy] =
    await Promise.all([
      client.getBlock(),
      read<Address>(vault, "payToken"),
      read<Address>(vault, "buyToken"),
      read<Address[]>(vault, "members"),
      read<bigint>(vault, "threshold"),
      read<bigint>(vault, "nonce"),
      read<bigint>(vault, "setEpoch"),
      read<bigint>(vault, "delay"),
      read<Address>(vault, "auctionFactory"),
      read<bigint>(vault, "opCount"),
      read<bigint>(vault, "tenderCount"),
      read<bigint>(vault, "openTenderId"),
      read<bigint>(vault, "saleCount"),
      read<bigint>(vault, "reservedPay"),
      read<bigint>(vault, "escrowedBuy"),
    ]);

  const ids = (n: bigint, from = 1n) => Array.from({ length: Number(n) }, (_, i) => from + BigInt(i));
  const [pay, buy, native, members, ops, tenders, sales] = await Promise.all([
    token(vault, payAddr),
    token(vault, buyAddr),
    token(vault, ZERO),
    Promise.all(memberAddrs.map(member)),
    Promise.all(
      ids(opCount).map(async (id) => {
        const o = await read<{ kind: number; state: number; eta: bigint; epoch: bigint; data: Hex }>(vault, "getOp", [id]);
        return {
          id,
          kind: OP_KINDS[o.kind] ?? "Sweep",
          state: OP_STATES[o.state] ?? "None",
          eta: o.eta,
          epoch: o.epoch,
          data: o.data,
          void: o.state === 1 && o.epoch !== epoch,
          lapsed: o.state === 1 && block.timestamp > o.eta + 7n * 86400n,
        } satisfies Op;
      }),
    ),
    Promise.all(
      ids(tenderCount).map(async (id) => {
        const t = await read<Omit<Tender, "id" | "state"> & { state: number }>(vault, "getTender", [id]);
        return { ...t, id, state: TENDER_STATES[t.state] ?? "None" } as Tender;
      }),
    ),
    Promise.all(
      ids(saleCount, 0n).map(async (i) => {
        const auction = await read<Address>(vault, "saleAt", [i]);
        const s = await read<{ state: number; startedAt: bigint; supply: bigint; proceeds: bigint; returned: bigint }>(vault, "getSale", [auction]);
        const sale: Sale = { auction, ...s, state: SALE_STATES[s.state] ?? "None" };
        try {
          const [st, cfg] = await Promise.all([
            client.readContract({ address: auction, abi: auctionAbi, functionName: "state" }),
            client.readContract({ address: auction, abi: auctionAbi, functionName: "config" }),
          ]);
          sale.auctionState = AUCTION_STATES[Number(st)] ?? String(st);
          sale.endTime = cfg.endTime;
          sale.releaseDeadline = cfg.releaseDeadline;
        } catch {
          // not an auction this app can read: show what the vault knows
        }
        return sale;
      }),
    ),
  ]);

  return {
    vault,
    block: { number: block.number, timestamp: block.timestamp },
    pay,
    buy,
    native,
    reservedPay,
    escrowedBuy,
    members,
    threshold: Number(threshold),
    nonce,
    epoch,
    delay,
    factory,
    ops: ops.reverse(),
    tenders: tenders.reverse(),
    openTenderId,
    sales: sales.reverse(),
  };
}

export interface Offer {
  id: number;
  seller: Address;
  tick: number;
  claimed: boolean;
  quantity: bigint;
  allocation: bigint;
}

export async function tenderDetail(vault: Address, t: Tender): Promise<{ supply: bigint[]; offers: Offer[] }> {
  const ticks = Array.from({ length: t.numTicks }, (_, i) => i);
  const offerIds = Array.from({ length: t.offerCount }, (_, i) => i);
  const [supply, offers] = await Promise.all([
    Promise.all(ticks.map((k) => read<bigint>(vault, "supplyByTick", [t.id, BigInt(k)]))),
    Promise.all(
      offerIds.map(async (i) => {
        const [o, allocation] = await Promise.all([
          read<{ seller: Address; tick: number; claimed: boolean; quantity: bigint }>(vault, "getOffer", [t.id, i]),
          read<bigint>(vault, "allocationOf", [t.id, i]),
        ]);
        return { id: i, ...o, tick: Number(o.tick), allocation } satisfies Offer;
      }),
    ),
  ]);
  return { supply, offers };
}

// ---------------------------------------------------------------- decoding

/** A queued change, in words. */
export function describeOp(op: Pick<Op, "kind" | "data">, s: Pick<Snapshot, "pay" | "buy" | "native">, fmt: (v: bigint, t: Token) => string): string {
  const tok = (a: Address) => [s.pay, s.buy, s.native].find((t) => t.address.toLowerCase() === a.toLowerCase());
  try {
    switch (op.kind) {
      case "Sweep": {
        const [t, to, a] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], op.data);
        const k = tok(t);
        return `Send ${k ? `${fmt(a, k)} ${k.symbol}` : `${a} of ${t}`} to ${to}`;
      }
      case "SetSigners": {
        const [m, th] = decodeAbiParameters([{ type: "address[]" }, { type: "uint256" }], op.data);
        return `New signer set, ${th} of ${m.length}: ${m.join(", ")}`;
      }
      case "SetDelay":
        return `Timelock delay becomes ${decodeAbiParameters([{ type: "uint64" }], op.data)[0]} seconds`;
      case "SetDailyCap": {
        const [t, c] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], op.data);
        const k = tok(t);
        return `Daily allowance of ${k?.symbol ?? t} becomes ${k ? fmt(c, k) : String(c)}`;
      }
      case "SetAuctionFactory": {
        const [f] = decodeAbiParameters([{ type: "address" }], op.data);
        return f === ZERO ? "Turn sealed sales off" : `Sealed sales use the factory ${f}`;
      }
    }
  } catch {
    // fall through
  }
  return op.data;
}

// ---------------------------------------------------------------- activity

export interface Activity {
  name: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
  timestamp?: bigint;
  /** For quorum actions: who signed (from PqQuorumAuthorized in the same transaction). */
  signers?: Address[];
}

const EVENT_ABIS: Abi[] = [vaultAbi as Abi, tenderBookAbi as Abi];

function decode(log: Log): { eventName: string; args: Record<string, unknown> } | undefined {
  for (const abi of EVENT_ABIS) {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics });
      return { eventName: String(d.eventName), args: (d.args ?? {}) as unknown as Record<string, unknown> };
    } catch {
      // not in this ABI
    }
  }
  return undefined;
}

/** The vault's events, newest first. Testnet RPCs limit log ranges, so this reads in chunks. */
export async function activity(vault: Address, latest: bigint, limit = 200): Promise<Activity[]> {
  const fromParam = params.get("from");
  const deployedBlock = deployed?.contracts?.PealTenderV2?.address?.toLowerCase() === vault.toLowerCase()
    ? deployed?.contracts?.PealTenderV2?.block
    : undefined;
  const start = fromParam
    ? BigInt(fromParam)
    : deployedBlock !== undefined
      ? BigInt(deployedBlock)
      : IS_LOCAL
        ? 0n
        : latest > 200_000n
          ? latest - 200_000n
          : 0n;
  const STEP = 10_000n;
  const logs: Log[] = [];
  for (let to = latest; to >= start && logs.length < limit * 2; to -= STEP) {
    const from = to - STEP + 1n > start ? to - STEP + 1n : start;
    const chunk = await client.getLogs({ address: vault, fromBlock: from, toBlock: to });
    logs.unshift(...chunk);
    if (from === start) break;
  }
  const out: Activity[] = [];
  const signersByTx = new Map<string, Address[]>();
  for (const l of logs) {
    const d = decode(l);
    if (!d) continue;
    if (d.eventName === "PqQuorumAuthorized") signersByTx.set(l.transactionHash!, d.args.signers as Address[]);
    if (d.eventName === "PqMemberAuthorized") signersByTx.set(l.transactionHash!, [d.args.signer as Address]);
    out.push({ name: d.eventName, args: d.args, blockNumber: l.blockNumber!, txHash: l.transactionHash!, logIndex: l.logIndex! });
  }
  for (const a of out) a.signers = signersByTx.get(a.txHash);
  const shown = out
    .filter((a) => !["PqQuorumAuthorized", "PqMemberAuthorized", "Spent", "PqSetChanged"].includes(a.name))
    .reverse()
    .slice(0, limit);
  const blocks = [...new Set(shown.map((a) => a.blockNumber))].slice(0, 60);
  const times = new Map(
    await Promise.all(blocks.map(async (n) => [n, (await client.getBlock({ blockNumber: n })).timestamp] as const)),
  );
  for (const a of shown) a.timestamp = times.get(a.blockNumber);
  return shown;
}
