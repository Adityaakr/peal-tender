/**
 * probes.ts - the judge page's calls: positive controls, attacks, and the calls that are
 * stopped before the check they aim at (said so, and shown).
 *
 * The method is a controlled experiment. The order the treasury really sent on
 * 18 November 2026 (two ML-DSA-87 signatures, accepted on chain) is fetched from the chain
 * and simulated at the block before it landed: the deployed contract accepts it again. Each
 * attack then repeats that call with ONE thing changed, so the refusal can only be about
 * that thing. A row passes only if the contract threw the named error with the expected
 * arguments; any other refusal is reported as "refused, but by something else".
 *
 * Everything is an eth_call: nothing is signed or sent, and no key is used. eth_call lets
 * anyone claim any sender, which is what a stolen classical key would give an attacker, and
 * skips QoreChain's window rule, so the attacker here starts with MORE than on chain.
 *
 * Two checks cannot be reached by an outsider on the live state: the daily cap stands behind
 * the signatures, and the timelock has nothing queued. Those rows replace named state inside
 * the simulation (`overrides`), run the same deployed vault code, and say so (`simulated`);
 * next to each stands the plain call, which is stopped earlier, and a simulated control with
 * the one difference removed.
 *
 *   cap       both precompiles answer "valid" (stand-in code): the case the cap exists for, a
 *             whole quorum of post-quantum keys stolen. The vault's state is the real one.
 *             (This node switches its precompiles off whenever a call carries overrides, so
 *             the real signatures could not be checked in the same call.)
 *   timelock  a queued sweep is written into the vault's storage. No precompile is involved.
 */
import {
  decodeAbiParameters,
  decodeErrorResult,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  pad,
  toEventSelector,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { pqcKeyStatusAbi, tenderBookAbi, vaultAbi } from "../../../../scripts/v2/abi.ts";
import { actionIdOf, argsHash, opData, OP_KINDS } from "../../../../scripts/v2/encode.ts";
import { type Answer, type CallSpec, type Override, type Rpc, RpcFailure } from "./rpc.ts";

// ---------------------------------------------------------------- what is on the testnet

export const VAULT = "0x79B2076a34b8CaBCF0120073cE0640165B287940" as Address;
export const BOOK = "0xb06D322fAB9503D59f980D3A67Da5EBA236AAB10" as Address;
export const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA" as Address;
/** The Q-Day Drill's vault and its signer, whose classical key the drill's attacker was given. */
export const DRILL_VAULT = "0xc3EA5683C1f8D8594A1865D169D98B509b057D41" as Address;
export const DRILL_SIGNER = "0x1453faDA276086E39A87CA39C1CD1F754cbf56bF" as Address;
export const PQC_VERIFY = "0x0000000000000000000000000000000000000a01" as Address;
export const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000a02" as Address;
export const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** The real 2-of-3 sweep of 18 November 2026: 0.01 fUSD, signed by two signers, accepted in this transaction. */
export const ORDER_TX = "0xd1aec2ea83c7cd9c89a88f9f60d02eca96e6c9c370784c252e852037b6a6bd4f" as Hex;

/** Where the attacker wants the money: an address made from this text, so nobody's account. */
export const ATTACKER = getAddress(`0x${keccak256(toHex("peal-tender judge page: attacker")).slice(-40)}`);

const SIGNATURE_BYTES = 4627;

// ---------------------------------------------------------------- ABI pieces

export const pqcVerifyAbi = [
  {
    type: "function",
    name: "pqcVerify",
    stateMutability: "view",
    inputs: [
      { name: "pubkey", type: "bytes" },
      { name: "signature", type: "bytes" },
      { name: "message", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
] as const;

/** The drill vault's single-signer sweep. */
export const drillSweepAbi = [
  {
    type: "function",
    name: "sweep",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const V = vaultAbi as Abi;
/** Every error the vault, its library and the drill vault share with PqAuth can throw. */
const ERROR_ABIS: Abi[] = [V, tenderBookAbi as Abi];

export interface Thrown {
  name: string;
  args: readonly unknown[];
  /** The parameter names, where the contract's ABI gives them. */
  names: string[];
}

/** The contract's own error, by the ABI. `undefined` for bytes no known error explains. */
export function thrown(data: Hex): Thrown | undefined {
  for (const abi of ERROR_ABIS) {
    try {
      const d = decodeErrorResult({ abi, data }) as { errorName: string; args?: readonly unknown[]; abiItem: { inputs?: readonly { name?: string }[] } };
      return { name: d.errorName, args: d.args ?? [], names: (d.abiItem.inputs ?? []).map((i) => i.name ?? "") };
    } catch {
      // not this ABI's
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- the real order and the live facts

export interface Auth {
  deadline: bigint;
  signers: readonly Address[];
  signatures: readonly Hex[];
}

export interface Order {
  tx: Hex;
  from: Address;
  /** The block it landed in; the controls run at the block before. */
  block: bigint;
  token: Address;
  to: Address;
  amount: bigint;
  /** The vault's nonce its signatures were made for, from the PqQuorumAuthorized event it emitted. */
  nonce: bigint;
  auth: Auth;
  data: Hex;
}

export interface Facts {
  order: Order;
  members: readonly Address[];
  latest: { number: bigint; timestamp: bigint };
  /** The vault's allowance and free balance of the payment token, today. */
  cap: bigint;
  left: bigint;
  free: bigint;
  delay: bigint;
  epoch: bigint;
  opCount: bigint;
  openTenderId: bigint;
  tenderEnd: bigint;
  drillBalance: bigint;
}

type SweepArgs = readonly [Address, Address, bigint, Auth];

export const encodeSweep = (token: Address, to: Address, amount: bigint, auth: Auth): Hex =>
  encodeFunctionData({ abi: V, functionName: "sweep", args: [token, to, amount, auth] });

const AUTHORIZED = toEventSelector("PqQuorumAuthorized(bytes32,uint256,bytes32,address[])");

export interface RawTx {
  hash: Hex;
  from: Address;
  to: Address | null;
  blockNumber: Hex;
  input: Hex;
}

export interface RawReceipt {
  status: Hex;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
}

export function parseOrder(tx: RawTx, receipt: RawReceipt): Order {
  if (receipt.status !== "0x1") throw new RpcFailure("the node does not show the cited transaction as successful");
  if (tx.to?.toLowerCase() !== VAULT.toLowerCase()) throw new RpcFailure("the cited transaction does not call the vault");
  const d = decodeFunctionData({ abi: V, data: tx.input });
  if (d.functionName !== "sweep") throw new RpcFailure("the cited transaction is not a sweep");
  const [token, to, amount, auth] = d.args as unknown as SweepArgs;
  const log = receipt.logs.find((l) => l.address.toLowerCase() === VAULT.toLowerCase() && l.topics[0] === AUTHORIZED);
  if (!log) throw new RpcFailure("the cited transaction shows no signature check");
  const [nonce, signedArgs] = decodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }, { type: "address[]" }], log.data);
  if (signedArgs !== argsHash.sweep(token, to, amount)) throw new RpcFailure("the cited transaction's event does not match its arguments");
  return { tx: tx.hash, from: getAddress(tx.from), block: BigInt(tx.blockNumber), token, to, amount, nonce, auth, data: tx.input };
}

/** The 256 bytes one member signed for the order: qore-pq-kit's PqAuth.message under the quorum domain. */
export function signedMessage(o: Order, signer: Address): Hex {
  const domain = (t: string) => keccak256(toHex(t));
  const action = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [domain("qore-pq-kit.PqAuthSet.quorum.v1"), actionIdOf("sweep")]));
  return encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    [domain("qore-pq-kit.PqAuth.v1"), 9800n, VAULT, signer, action, o.nonce, o.auth.deadline, argsHash.sweep(o.token, o.to, o.amount)],
  );
}

/** Read a view at a block. A revert here means the facts cannot be read, so it is a failure. */
async function view<T>(rpc: Rpc, to: Address, abi: Abi, functionName: string, args: readonly unknown[], block: "latest" | bigint = "latest"): Promise<T> {
  const a = await rpc.call({ from: ZERO, to, data: encodeFunctionData({ abi, functionName, args }), block });
  if (a.kind === "reverted") throw new RpcFailure(`${functionName} could not be read`);
  const fn = abi.find((x) => x.type === "function" && x.name === functionName) as { outputs: readonly { type: string }[] };
  try {
    const out = decodeAbiParameters(fn.outputs as never, a.data) as readonly unknown[];
    return (out.length === 1 ? out[0] : out) as T;
  } catch {
    throw new RpcFailure(`${functionName} answered ${a.data === "0x" ? "nothing" : "something unreadable"}`);
  }
}

export const vaultView = <T>(rpc: Rpc, fn: string, args: readonly unknown[] = [], block: "latest" | bigint = "latest") => view<T>(rpc, VAULT, V, fn, args, block);

export async function keyStatus(rpc: Rpc, account: Address): Promise<{ registered: boolean; algorithm: number; key: Hex; possession: boolean }> {
  const [registered, algorithm, key, possession] = await view<readonly [boolean, number, Hex, boolean]>(rpc, PQC_KEY_STATUS, pqcKeyStatusAbi as Abi, "pqcKeyStatus", [account]);
  return { registered, algorithm: Number(algorithm), key, possession };
}

/** Everything the calls are built from, read from the chain: the order's calldata included. */
export async function loadFacts(rpc: Rpc): Promise<Facts> {
  // Nothing here needs an old block's state: if the node drops it, only the rows that run there fail.
  const [tx, receipt] = await Promise.all([
    rpc.request<RawTx | null>("eth_getTransactionByHash", [ORDER_TX]),
    rpc.request<RawReceipt | null>("eth_getTransactionReceipt", [ORDER_TX]),
  ]);
  if (!tx || !receipt) throw new RpcFailure("the node does not have the cited transaction");
  const order = parseOrder(tx, receipt);
  const [latest, members, cap, left, free, delay, epoch, opCount, openTenderId, drill] = await Promise.all([
    rpc.request<{ number: Hex; timestamp: Hex }>("eth_getBlockByNumber", ["latest", false]),
    vaultView<readonly Address[]>(rpc, "members"),
    vaultView<bigint>(rpc, "dailyCap", [FUSD]),
    vaultView<bigint>(rpc, "remainingToday", [FUSD]),
    vaultView<bigint>(rpc, "freeBalance", [FUSD]),
    vaultView<bigint>(rpc, "delay"),
    vaultView<bigint>(rpc, "setEpoch"),
    vaultView<bigint>(rpc, "opCount"),
    vaultView<bigint>(rpc, "openTenderId"),
    rpc.request<Hex>("eth_getBalance", [DRILL_VAULT, "latest"]),
  ]);
  const tenderEnd = openTenderId === 0n ? 0n : (await vaultView<{ endTime: bigint }>(rpc, "getTender", [openTenderId])).endTime;
  return {
    order,
    members,
    latest: { number: BigInt(latest.number), timestamp: BigInt(latest.timestamp) },
    cap,
    left,
    free,
    delay: BigInt(delay),
    epoch: BigInt(epoch),
    opCount,
    openTenderId,
    tenderEnd: BigInt(tenderEnd),
    drillBalance: BigInt(drill),
  };
}

// ---------------------------------------------------------------- simulated state (rows that say so)

/** PealTenderV2's storage layout, as `forge inspect PealTenderV2 storage-layout` prints it. */
export const OPS_SLOT = 8n;
const MASK64 = (1n << 64n) - 1n;

const word = (v: bigint): Hex => pad(toHex(v), { size: 32 });

/**
 * Stand-ins that answer what the real precompiles answer for a usable key and a valid
 * signature: pqcKeyStatus (true, 1, 2,592 bytes, true) and pqcVerify (true). A few
 * MSTOREs and a RETURN, so anyone can read them.
 */
export const ALWAYS_VALID: Override[] = [
  { address: PQC_KEY_STATUS, code: "0x6001600052600160205260806040526001606052610a20608052610ac06000f3" },
  { address: PQC_VERIFY, code: "0x600160005260206000f3" },
];

/** The words that make `_ops[opId]` a queued change (`Op { kind, state, eta, epoch, data }`). */
export function queuedOp(opId: bigint, kind: (typeof OP_KINDS)[number], eta: bigint, epoch: bigint, data: Hex): Record<Hex, Hex> {
  const base = keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [opId, OPS_SLOT]));
  const dataSlot = word(BigInt(base) + 1n);
  const bytes = BigInt((data.length - 2) / 2);
  if (bytes < 32n) throw new Error("only long data is laid out here");
  const QUEUED = 1n;
  const out: Record<Hex, Hex> = {
    [base]: word(BigInt(OP_KINDS.indexOf(kind)) | (QUEUED << 8n) | ((eta & MASK64) << 16n) | ((epoch & MASK64) << 80n)),
    [dataSlot]: word(bytes * 2n + 1n),
  };
  const start = BigInt(keccak256(dataSlot));
  for (let i = 0n; i * 32n < bytes; i++) {
    const at = 2 + Number(i) * 64;
    out[word(start + i)] = `0x${data.slice(at, at + 64).padEnd(64, "0")}`;
  }
  return out;
}

// ---------------------------------------------------------------- the calls

export type Expectation =
  | { kind: "accepted"; returns?: Hex }
  | { kind: "error"; name: string; args?: readonly unknown[] };

export type ProbeKind = "control" | "attack" | "stopped-earlier";

export interface Built {
  call: CallSpec;
  expect: Expectation;
  /** Which block, sender and words this run used, in plain words. */
  where: string;
}

export interface Probe {
  id: string;
  kind: ProbeKind;
  group: GroupId;
  title: string;
  /** The single difference from the accepted order, or what the call is. */
  change: string;
  /** Set when the simulation runs on state that is not the chain's: what was replaced. */
  simulated?: string;
  /** What the refusal (or acceptance) proves; for stopped-earlier rows, what it cannot show. */
  means: string;
  build(f: Facts, rpc: Rpc): Built | Promise<Built>;
}

export type GroupId = "control" | "stolen" | "members" | "replay" | "edited" | "cap" | "timelock";

export const GROUPS: { id: GroupId; title: string; lead: string }[] = [
  {
    id: "control",
    title: "First, the calls that must succeed",
    lead: "If these were refused, every refusal below would prove nothing.",
  },
  {
    id: "stolen",
    title: "Stolen classical key, no ML-DSA signature",
    lead: "The sender is the signer's own account, which is all a stolen secp256k1 key can claim to be.",
  },
  {
    id: "members",
    title: "Wrong member set",
    lead: "The real order with its real signatures, presented by the wrong set of signers.",
  },
  { id: "replay", title: "Replayed signature", lead: "The same bytes the chain already accepted once." },
  { id: "edited", title: "Edited arguments", lead: "The real signatures, over an order with one field changed." },
  {
    id: "cap",
    title: "Over the daily cap",
    lead: "The cap is checked after the signatures, so no outsider's call can reach it on the live chain. The first row shows that; the other two simulate the thief it is for.",
  },
  {
    id: "timelock",
    title: "Early execution",
    lead: "The vault has two clocks: a tender's end and the timelock. The tender's is running now. Nothing is in the timelock, so its rows put a queued sweep into the simulation.",
  },
];

/** Bytes of the right length that no signer made. Fixed, so a run can be repeated exactly. */
export function forgedSignature(seed: string): Hex {
  let out = "";
  for (let i = 0; out.length < SIGNATURE_BYTES * 2; i++) out += keccak256(toHex(`${seed}:${i}`)).slice(2);
  return `0x${out.slice(0, SIGNATURE_BYTES * 2)}`;
}

const error = (name: string, ...args: unknown[]): Expectation => ({ kind: "error", name, args });
const n = (v: bigint) => v.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The accepted order, at the block before it landed, with some parts replaced. */
function again(f: Facts, o: { from?: Address; to?: Address; amount?: bigint; auth?: Partial<Auth>; block?: bigint }): CallSpec {
  const { order } = f;
  return {
    from: o.from ?? order.from,
    to: VAULT,
    data: encodeSweep(order.token, o.to ?? order.to, o.amount ?? order.amount, { ...order.auth, ...o.auth }),
    block: o.block ?? order.block - 1n,
  };
}

const before = (f: Facts) => `block ${n(f.order.block - 1n)}, just before the order landed`;
const now = (f: Facts) => `the latest block (${n(f.latest.number)} or later)`;

/** The member whose signature the order does not carry. */
function thirdMember(f: Facts): Address {
  const signed = new Set(f.order.auth.signers.map((s) => s.toLowerCase()));
  const m = f.members.find((x) => !signed.has(x.toLowerCase()));
  if (!m) throw new Error("every member signed the order");
  return m;
}

function pair<T>(xs: readonly T[]): [T, T] {
  if (xs.length !== 2) throw new Error(`the order carries ${xs.length} signatures, not 2`);
  return [xs[0]!, xs[1]!];
}

export const PROBES: Probe[] = [
  // ---- controls
  {
    id: "control-order",
    kind: "control",
    group: "control",
    title: "The treasury's real order, unchanged",
    change: "Nothing. The calldata of the sweep accepted on 18 November, byte for byte.",
    means: "The deployed vault, with the real pqcKeyStatus and pqcVerify, accepts two real ML-DSA-87 signatures through this call path.",
    build: (f) => ({ call: { ...again(f, {}), data: f.order.data }, expect: { kind: "accepted", returns: "0x" }, where: before(f) }),
  },
  {
    id: "control-stranger",
    kind: "control",
    group: "control",
    title: "The same order, sent by a stranger",
    change: "Only the sender: an address that has never done anything.",
    means: "The sender grants nothing and takes nothing away. Only the signatures count, so a stolen classical key adds nothing.",
    build: (f) => ({ call: again(f, { from: ATTACKER }), expect: { kind: "accepted", returns: "0x" }, where: before(f) }),
  },
  {
    id: "control-verify",
    kind: "control",
    group: "control",
    title: "pqcVerify on one of its signatures, today",
    change: "Not the vault: QoreChain's ML-DSA-87 precompile itself, with the signer's key as pqcKeyStatus gives it now.",
    means: "The signature is valid under a key the chain still holds. This needs no old block.",
    build: async (f, rpc) => {
      const signer = f.order.auth.signers[0]!;
      const status = await keyStatus(rpc, signer);
      return {
        call: {
          from: ZERO,
          to: PQC_VERIFY,
          data: encodeFunctionData({ abi: pqcVerifyAbi, functionName: "pqcVerify", args: [status.key, f.order.auth.signatures[0]!, signedMessage(f.order, signer)] }),
          block: "latest",
        },
        expect: { kind: "accepted", returns: word(1n) },
        where: now(f),
      };
    },
  },

  // ---- stolen classical key
  {
    id: "stolen-drill",
    kind: "attack",
    group: "stolen",
    title: "The Q-Day Drill's stolen key, all the drill vault's QOR",
    change: "The drill account as sender, whose classical key the drill's attacker was given; 4,627 forged bytes as the signature.",
    means: "pqcVerify refuses the forged bytes against the account's registered key. Being the signer's account is not enough.",
    build: (f) => ({
      call: {
        from: DRILL_SIGNER,
        to: DRILL_VAULT,
        data: encodeFunctionData({ abi: drillSweepAbi, functionName: "sweep", args: [ZERO, ATTACKER, f.drillBalance, f.latest.timestamp + 3600n, forgedSignature("drill")] }),
        block: "latest",
      },
      expect: error("PqSignatureInvalid"),
      where: now(f),
    }),
  },
  {
    id: "stolen-unsigned",
    kind: "attack",
    group: "stolen",
    title: "The order without its signatures, sent by a signer",
    change: "Sender: a treasury signer's account. Both ML-DSA-87 signatures removed.",
    means: "A signer's classical key counts as zero of the two signatures required.",
    build: (f) => ({
      call: again(f, { from: f.order.auth.signers[0]!, auth: { signers: [], signatures: [] } }),
      expect: error("PqSetTooFewSignatures", 0n, 2n),
      where: before(f),
    }),
  },
  {
    id: "stolen-forged",
    kind: "attack",
    group: "stolen",
    title: "The order with forged signatures, sent by a signer",
    change: "Sender: a treasury signer's account. Both signatures replaced by 4,627 bytes that no signer made.",
    means: "The right names and the right length are not enough: pqcVerify refuses the bytes.",
    build: (f) => ({
      call: again(f, { from: f.order.auth.signers[0]!, auth: { signatures: [forgedSignature("a"), forgedSignature("b")] } }),
      expect: error("PqSignatureInvalid"),
      where: before(f),
    }),
  },
  {
    id: "stolen-now",
    kind: "attack",
    group: "stolen",
    title: "A forged order on the vault as it stands now",
    change: "A new order for 0.01 fUSD to the attacker, sent by a signer, with a fresh deadline and forged signatures.",
    means: "The same refusal on today's state: nothing here depends on an old block.",
    build: (f) => ({
      call: {
        from: f.members[0]!,
        to: VAULT,
        data: encodeSweep(FUSD, ATTACKER, 10_000n, {
          deadline: f.latest.timestamp + 3600n,
          signers: f.members.slice(0, 2),
          signatures: [forgedSignature("a"), forgedSignature("b")],
        }),
        block: "latest",
      },
      expect: error("PqSignatureInvalid"),
      where: now(f),
    }),
  },

  // ---- wrong member set
  {
    id: "members-one",
    kind: "attack",
    group: "members",
    title: "One real signature instead of two",
    change: "The second signer and signature removed.",
    means: "One stolen post-quantum key is one of two. The threshold refuses it.",
    build: (f) => ({
      call: again(f, { auth: { signers: f.order.auth.signers.slice(0, 1), signatures: f.order.auth.signatures.slice(0, 1) } }),
      expect: error("PqSetTooFewSignatures", 1n, 2n),
      where: before(f),
    }),
  },
  {
    id: "members-outsider",
    kind: "attack",
    group: "members",
    title: "One signer and one outsider",
    change: "The second signer replaced by the relayer, which has a registered ML-DSA-87 key but is not in the set.",
    means: "A registered post-quantum key is not authority. Only the vault's members count.",
    build: (f) => {
      const [first] = pair(f.order.auth.signers);
      if (BigInt(f.order.from) <= BigInt(first)) throw new Error("the relayer must sort after the first signer");
      return { call: again(f, { auth: { signers: [first, f.order.from] } }), expect: error("PqSetNotMember", f.order.from), where: before(f) };
    },
  },
  {
    id: "members-twice",
    kind: "attack",
    group: "members",
    title: "The same signer twice",
    change: "The first signer's real signature used for both places.",
    means: "Signers must be strictly ascending, so nobody is counted twice.",
    build: (f) => {
      const [s] = pair(f.order.auth.signers);
      const [g] = pair(f.order.auth.signatures);
      return { call: again(f, { auth: { signers: [s, s], signatures: [g, g] } }), expect: error("PqSetNotAscending", 1n), where: before(f) };
    },
  },
  {
    id: "members-swapped",
    kind: "attack",
    group: "members",
    title: "A real signature under another member's name",
    change: "The third member named in place of the second, keeping the second's real signature.",
    means: "Each signature is checked against that member's own registered key, and the member's name is in the signed bytes.",
    build: (f) => {
      const [first, second] = pair(f.order.auth.signers);
      const third = thirdMember(f);
      const bySigner = new Map([
        [first, f.order.auth.signatures[0]!],
        [third, f.order.auth.signatures[f.order.auth.signers.indexOf(second)]!],
      ]);
      const signers = [...bySigner.keys()].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
      return { call: again(f, { auth: { signers, signatures: signers.map((s) => bySigner.get(s)!) } }), expect: error("PqSignatureInvalid"), where: before(f) };
    },
  },

  // ---- replay
  {
    id: "replay-next-block",
    kind: "attack",
    group: "replay",
    title: "The same order, one block later",
    change: "Only the block: the state after the order landed. Same sender, same bytes, deadline still in the future.",
    means: "The vault's nonce moved, so the signed bytes no longer match what the vault checks.",
    build: (f) => ({
      call: { ...again(f, { block: f.order.block }), data: f.order.data },
      expect: error("PqSignatureInvalid"),
      where: `block ${n(f.order.block)}, after the order used up nonce ${f.order.nonce}`,
    }),
  },
  {
    id: "replay-today",
    kind: "attack",
    group: "replay",
    title: "The same order, today",
    change: "Only the block: the latest one.",
    means: "The deadline is the first check an old order meets. It is at most 24 hours ahead when signed.",
    build: (f) => ({ call: { ...again(f, {}), data: f.order.data, block: "latest" }, expect: { kind: "error", name: "PqExpired", args: [f.order.auth.deadline] }, where: now(f) }),
  },

  // ---- edited arguments
  {
    id: "edited-recipient",
    kind: "attack",
    group: "edited",
    title: "Recipient changed to the attacker",
    change: "Only the recipient.",
    means: "The signed bytes hold the hash of the arguments. One field changed, and no signature matches.",
    build: (f) => ({ call: again(f, { to: ATTACKER }), expect: error("PqSignatureInvalid"), where: before(f) }),
  },
  {
    id: "edited-amount",
    kind: "attack",
    group: "edited",
    title: "Ten times the amount",
    change: "Only the amount: 0.1 fUSD instead of 0.01, still below the daily cap.",
    means: "The amount is signed too.",
    build: (f) => {
      const amount = f.order.amount * 10n;
      if (amount >= f.cap) throw new Error("the edited amount must stay below the cap");
      return { call: again(f, { amount }), expect: error("PqSignatureInvalid"), where: before(f) };
    },
  },
  {
    id: "edited-deadline",
    kind: "attack",
    group: "edited",
    title: "Deadline pushed back an hour",
    change: "Only the deadline, still inside the 24-hour limit.",
    means: "A captured order cannot be kept alive.",
    build: (f) => {
      return { call: again(f, { auth: { deadline: f.order.auth.deadline + 3600n } }), expect: error("PqSignatureInvalid"), where: before(f) };
    },
  },

  // ---- the daily cap
  {
    id: "cap-plain",
    kind: "stopped-earlier",
    group: "cap",
    title: "Twice the cap, as an outsider can send it",
    change: "Only the amount: 2 times the daily cap.",
    means: "Refused by the signature check, which comes first. This row does not show the cap.",
    build: (f) => ({ call: again(f, { amount: f.cap * 2n }), expect: error("PqSignatureInvalid"), where: before(f) }),
  },
  {
    id: "cap-quorum",
    kind: "attack",
    group: "cap",
    title: "Twice the cap, by a thief with a whole quorum",
    change: "Only the amount, against the row below: 2 times the daily cap. Today's real vault.",
    simulated: "pqcKeyStatus and pqcVerify replaced by code that always answers valid, as if two ML-DSA-87 keys were stolen. The vault's code and state are the chain's.",
    means: "The cap holds even when every signature passes. The vault compares the amount with what is left today.",
    build: (f) => ({ call: quorumSweep(f, f.cap * 2n), expect: error("OverDailyCap", FUSD, f.cap * 2n, f.left), where: now(f) }),
  },
  {
    id: "cap-within",
    kind: "control",
    group: "cap",
    title: "The same, with an amount the day still allows",
    change: "Only the amount: what is left of today's allowance.",
    simulated: "The same stand-in precompiles as the row above.",
    means: "Accepted, so the amount was the only thing in the way of the row above. This is what a stolen quorum could take in a day.",
    build: (f) => {
      if (f.left === 0n) throw new NotNow("Today's allowance is already spent, so no amount is allowed.");
      return { call: quorumSweep(f, f.left), expect: { kind: "accepted", returns: "0x" }, where: now(f) };
    },
  },

  // ---- the timelock
  {
    id: "timelock-plain",
    kind: "stopped-earlier",
    group: "timelock",
    title: "Execute a change on the vault as it stands",
    change: "execute() for the next change number, sent by anyone.",
    means: "Nothing is queued under that number, so there is nothing to run early. This row does not show the timer.",
    build: (f) => ({
      call: { from: ATTACKER, to: VAULT, data: encodeFunctionData({ abi: V, functionName: "execute", args: [f.opCount + 1n] }), block: "latest" },
      expect: error("NoSuchOp", f.opCount + 1n),
      where: now(f),
    }),
  },
  {
    id: "timelock-tender",
    kind: "attack",
    group: "timelock",
    title: "Settle the open tender before its end",
    change: "settle(), sent by anyone. No state is replaced.",
    means: "The other clock in the vault, on the live state: settling is open to anyone, but not early.",
    build: (f) => {
      if (f.openTenderId === 0n || f.tenderEnd <= f.latest.timestamp) throw new NotNow("No tender is running now, so there is nothing to settle early.");
      return {
        call: { from: ATTACKER, to: VAULT, data: encodeFunctionData({ abi: V, functionName: "settle" }), block: "latest" },
        expect: error("TooEarly", f.tenderEnd),
        where: `${now(f)}; tender #${f.openTenderId} is open`,
      };
    },
  },
  {
    id: "timelock-override",
    kind: "attack",
    group: "timelock",
    title: "Execute a queued sweep before its delay ends",
    change: "execute(), sent by anyone, as soon as the change is queued.",
    simulated: "A 0.01 fUSD sweep to the attacker, written into the vault's storage as if a quorum had queued it just now. The vault's code is the chain's.",
    means: "The timer refuses it until the delay has passed.",
    build: (f) => {
      const id = f.opCount + 1n;
      const eta = f.latest.timestamp + f.delay;
      return {
        call: executeQueued(f, id, eta),
        expect: error("OpNotReady", id, eta),
        where: `${now(f)}, with change #${id} simulated`,
      };
    },
  },
  {
    id: "timelock-ready",
    kind: "control",
    group: "timelock",
    title: "The same queued sweep, after its delay",
    change: "Only the time it becomes executable: one minute ago.",
    simulated: "The same queued sweep, with its delay already over.",
    means: "The contract accepts it, so time was the only thing in the way of the row above.",
    build: (f) => {
      const id = f.opCount + 1n;
      return { call: executeQueued(f, id, f.latest.timestamp - 60n), expect: { kind: "accepted", returns: "0x" }, where: `${now(f)}, with change #${id} simulated` };
    },
  },
];

/** A sweep by two members whose signatures the stand-in precompiles accept. */
function quorumSweep(f: Facts, amount: bigint): CallSpec {
  if (amount > f.free) throw new NotNow("The vault holds less than this amount now, so a smaller check would answer first.");
  return {
    from: ATTACKER,
    to: VAULT,
    data: encodeSweep(FUSD, ATTACKER, amount, {
      deadline: f.latest.timestamp + 3600n,
      signers: f.members.slice(0, 2),
      signatures: [forgedSignature("a"), forgedSignature("b")],
    }),
    block: "latest",
    overrides: ALWAYS_VALID,
  };
}

function executeQueued(f: Facts, id: bigint, eta: bigint): CallSpec {
  return {
    from: ATTACKER,
    to: VAULT,
    data: encodeFunctionData({ abi: V, functionName: "execute", args: [id] }),
    block: "latest",
    overrides: [{ address: VAULT, slots: queuedOp(id, "Sweep", eta, f.epoch, opData.Sweep(FUSD, ATTACKER, 10_000n)) }],
  };
}

// ---------------------------------------------------------------- running and judging

/** The live state has nothing for this row to act on. Not a failure and not a refusal. */
export class NotNow extends Error {
  override name = "NotNow";
}

export type Verdict =
  /** The contract threw exactly the check this row aims at. */
  | "refused"
  /** A control: accepted, as it must be. */
  | "accepted"
  /** Refused by an earlier check, as the row says it would be. */
  | "stopped-earlier"
  /** Refused, but not by the named check: the row proves nothing. */
  | "other-refusal"
  /** An attack the contract accepted, or a control it did not. */
  | "unexpected"
  | "not-now"
  | "node-failure";

export interface Result {
  verdict: Verdict;
  /** One line: the error with its arguments, or what went wrong. */
  said: string;
  raw?: Hex;
  ms?: number;
  built?: Built;
}

const same = (a: unknown, b: unknown): boolean =>
  typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : String(a) === String(b);

function inWords(v: unknown): string {
  if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return short(v);
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

/** `OverDailyCap(token 0x9714…63CA, amount 10000, remaining 5000)`. */
export function spell(t: Thrown): string {
  return `${t.name}(${t.args.map((a, i) => (t.names[i] ? `${t.names[i]} ${inWords(a)}` : inWords(a))).join(", ")})`;
}

export function judge(kind: ProbeKind, expect: Expectation, a: Answer): Pick<Result, "verdict" | "said" | "raw" | "ms"> {
  const base = { raw: a.data, ms: a.ms };
  if (a.kind === "returned") {
    const ok = expect.kind === "accepted" && (expect.returns === undefined || same(a.data, expect.returns));
    if (ok) return { ...base, verdict: "accepted", said: a.data === "0x" ? "no revert" : `returned ${BigInt(a.data) === 1n ? "true" : a.data}` };
    return { ...base, verdict: "unexpected", said: expect.kind === "accepted" ? `returned ${a.data}, not what was expected` : "the contract did not refuse it" };
  }
  const t = thrown(a.data);
  const said = t ? spell(t) : a.data === "0x" ? "reverted without a reason" : `reverted with unknown bytes ${a.data.slice(0, 10)}`;
  if (expect.kind === "accepted") return { ...base, verdict: "unexpected", said };
  const match = t?.name === expect.name && (expect.args ?? []).every((x, i) => same(t.args[i], x));
  if (!match) return { ...base, verdict: "other-refusal", said };
  return { ...base, verdict: kind === "stopped-earlier" ? "stopped-earlier" : "refused", said };
}

export async function runProbe(p: Probe, f: Facts, rpc: Rpc): Promise<Result> {
  let built: Built | undefined;
  try {
    built = await p.build(f, rpc);
    return { ...judge(p.kind, built.expect, await rpc.call(built.call)), built };
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    if (e instanceof NotNow) return { verdict: "not-now", said };
    return { verdict: "node-failure", said, ...(built ? { built } : {}) };
  }
}

/** True when the row did what it says it does. `not-now` is neither. */
export const held = (r: Result): boolean => r.verdict === "refused" || r.verdict === "accepted" || r.verdict === "stopped-earlier";

