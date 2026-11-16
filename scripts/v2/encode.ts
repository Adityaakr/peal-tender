/**
 * encode.ts - the argument hashes PealTenderV2 signs, built in TypeScript.
 *
 * Pure viem, no Node APIs, so the dashboard imports it too. Each function
 * mirrors one `keccak256(abi.encode(...))` in `src/PealTenderV2.sol`;
 * `test/v2/Vectors.t.sol` checks the two against each other through
 * `vectors/v2-actions.json` (npm run vectors:v2).
 */
import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";

export const ACTIONS = {
  deposit: "PealTenderV2.deposit",
  openTender: "PealTenderV2.openTender",
  cancelTender: "PealTenderV2.cancelTender",
  sweep: "PealTenderV2.sweep",
  queue: "PealTenderV2.queue",
  veto: "PealTenderV2.veto",
  startSealedSale: "PealTenderV2.startSealedSale",
  cancelSealedSale: "PealTenderV2.cancelSealedSale",
} as const;
export type ActionName = keyof typeof ACTIONS;

export function actionIdOf(a: ActionName): Hex {
  return keccak256(toBytes(ACTIONS[a]));
}

/** The order of `PealTenderV2.OpKind`. */
export const OP_KINDS = ["SetSigners", "SetDelay", "SetDailyCap", "SetAuctionFactory", "Sweep"] as const;
export type OpKind = (typeof OP_KINDS)[number];
export const OP_STATES = ["None", "Queued", "Executed", "Vetoed"] as const;

export interface OpenParams {
  budget: bigint;
  floorPrice: bigint;
  tickSize: bigint;
  numTicks: number;
  endTime: bigint;
  maxOffers: number;
  minQuantity: bigint;
}

export const OPEN_PARAMS_TYPE = {
  type: "tuple",
  components: [
    { name: "budget", type: "uint256" },
    { name: "floorPrice", type: "uint256" },
    { name: "tickSize", type: "uint256" },
    { name: "numTicks", type: "uint16" },
    { name: "endTime", type: "uint64" },
    { name: "maxOffers", type: "uint32" },
    { name: "minQuantity", type: "uint256" },
  ],
} as const;

/** `ISealedAuction.Config`, field for field. */
export interface SaleConfig {
  issuer: Address;
  saleToken: Address;
  quoteToken: Address;
  totalSupply: bigint;
  saleDecimals: number;
  reservePrice: bigint;
  tickSize: bigint;
  numTicks: number;
  startTime: bigint;
  endTime: bigint;
  releaseDeadline: bigint;
  minBidQuantity: bigint;
  maxQuantityPerAddress: bigint;
  maxBids: number;
  bidBond: bigint;
  protocolFeeBps: number;
  feeRecipient: Address;
  committeeSetId: Hex;
  metadataHash: Hex;
}

export const SALE_CONFIG_TYPE = {
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
} as const;

const h = (types: readonly { type: string }[], values: readonly unknown[]): Hex =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keccak256(encodeAbiParameters(types as any, values as any));

export const argsHash = {
  deposit: (from: Address, amount: bigint) => h([{ type: "address" }, { type: "uint256" }], [from, amount]),
  sweep: (token: Address, to: Address, amount: bigint) =>
    h([{ type: "address" }, { type: "address" }, { type: "uint256" }], [token, to, amount]),
  openTender: (p: OpenParams) => h([OPEN_PARAMS_TYPE], [p]),
  cancelTender: (tenderId: bigint) => h([{ type: "uint256" }], [tenderId]),
  queue: (kind: OpKind, data: Hex) => h([{ type: "uint8" }, { type: "bytes32" }], [OP_KINDS.indexOf(kind), keccak256(data)]),
  veto: (opId: bigint) => h([{ type: "uint256" }], [opId]),
  startSealedSale: (factory: Address, cfg: SaleConfig, name: string, details: string) =>
    h(
      [{ type: "address" }, SALE_CONFIG_TYPE, { type: "bytes32" }, { type: "bytes32" }],
      [factory, cfg, keccak256(toBytes(name)), keccak256(toBytes(details))],
    ),
  cancelSealedSale: (auction: Address) => h([{ type: "address" }], [auction]),
};

/** `data` for each queued change, as `PealTenderV2.OpKind` documents. */
export const opData = {
  SetSigners: (members: Address[], threshold: bigint) =>
    encodeAbiParameters([{ type: "address[]" }, { type: "uint256" }], [members, threshold]),
  SetDelay: (delay: bigint) => encodeAbiParameters([{ type: "uint64" }], [delay]),
  SetDailyCap: (token: Address, cap: bigint) => encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [token, cap]),
  SetAuctionFactory: (factory: Address) => encodeAbiParameters([{ type: "address" }], [factory]),
  Sweep: (token: Address, to: Address, amount: bigint) =>
    encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [token, to, amount]),
};

/** The auction factory's metadata hash: keccak256(abi.encode(name, details)). */
export function metadataHash(name: string, details: string): Hex {
  return h([{ type: "string" }, { type: "string" }], [name, details]);
}

/** Sort members (or shares) into the strictly ascending order PqAuthSet requires. */
export function ascending<T extends { signer: Address }>(xs: readonly T[]): T[] {
  const out = [...xs].sort((a, b) => (BigInt(a.signer) < BigInt(b.signer) ? -1 : BigInt(a.signer) > BigInt(b.signer) ? 1 : 0));
  for (let i = 1; i < out.length; i++) {
    if (BigInt(out[i]!.signer) === BigInt(out[i - 1]!.signer)) throw new Error(`duplicate signer ${out[i]!.signer}`);
  }
  return out;
}
