/** live.ts - the state the judge page shows, read from the testnet now. No DOM, no keys. */
import { encodeFunctionData, keccak256, type Abi, type Address, type Hex } from "viem";
import { erc20Abi } from "../../../../scripts/v2/abi.ts";
import { DRILL_SIGNER, DRILL_VAULT, FUSD, VAULT, keyStatus, vaultView } from "./probes.ts";
import { type Rpc, RpcFailure } from "./rpc.ts";

export interface SignerKey {
  address: Address;
  mlDsa87: boolean;
  possession: boolean;
  bytes: number;
  keyHash: Hex;
}

export interface Live {
  block: bigint;
  time: bigint;
  codeBytes: number;
  fusd: bigint;
  fusdFree: bigint;
  threshold: bigint;
  members: SignerKey[];
  nonce: bigint;
  cap: bigint;
  left: bigint;
  delay: bigint;
  opCount: bigint;
  openTender?: { id: bigint; budget: bigint; endTime: bigint; offers: number };
  drill: { qor: bigint; fusd: bigint; signer: SignerKey };
}

async function balanceOf(rpc: Rpc, token: Address, who: Address): Promise<bigint> {
  const a = await rpc.call({ from: who, to: token, data: encodeFunctionData({ abi: erc20Abi as Abi, functionName: "balanceOf", args: [who] }), block: "latest" });
  if (a.kind !== "returned" || a.data.length !== 66) throw new RpcFailure("a token balance could not be read");
  return BigInt(a.data);
}

async function signerKey(rpc: Rpc, address: Address): Promise<SignerKey> {
  const s = await keyStatus(rpc, address);
  return { address, mlDsa87: s.registered && s.algorithm === 1, possession: s.possession, bytes: (s.key.length - 2) / 2, keyHash: keccak256(s.key) };
}

export async function readLive(rpc: Rpc): Promise<Live> {
  const [block, code, fusd, fusdFree, threshold, members, nonce, cap, left, delay, opCount, openId, qor, drillFusd, drillSigner] = await Promise.all([
    rpc.request<{ number: Hex; timestamp: Hex }>("eth_getBlockByNumber", ["latest", false]),
    rpc.request<Hex>("eth_getCode", [VAULT, "latest"]),
    balanceOf(rpc, FUSD, VAULT),
    vaultView<bigint>(rpc, "freeBalance", [FUSD]),
    vaultView<bigint>(rpc, "threshold"),
    vaultView<readonly Address[]>(rpc, "members").then((m) => Promise.all(m.map((a) => signerKey(rpc, a)))),
    vaultView<bigint>(rpc, "nonce"),
    vaultView<bigint>(rpc, "dailyCap", [FUSD]),
    vaultView<bigint>(rpc, "remainingToday", [FUSD]),
    vaultView<bigint>(rpc, "delay"),
    vaultView<bigint>(rpc, "opCount"),
    vaultView<bigint>(rpc, "openTenderId"),
    rpc.request<Hex>("eth_getBalance", [DRILL_VAULT, "latest"]),
    balanceOf(rpc, FUSD, DRILL_VAULT),
    signerKey(rpc, DRILL_SIGNER),
  ]);
  const t = openId === 0n ? undefined : await vaultView<{ budget: bigint; endTime: bigint; offerCount: number }>(rpc, "getTender", [openId]);
  return {
    block: BigInt(block.number),
    time: BigInt(block.timestamp),
    codeBytes: (code.length - 2) / 2,
    fusd,
    fusdFree,
    threshold,
    members,
    nonce,
    cap,
    left,
    delay: BigInt(delay),
    opCount,
    openTender: t ? { id: openId, budget: t.budget, endTime: BigInt(t.endTime), offers: Number(t.offerCount) } : undefined,
    drill: { qor: BigInt(qor), fusd: drillFusd, signer: drillSigner },
  };
}
