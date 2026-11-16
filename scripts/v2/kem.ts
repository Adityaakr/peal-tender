/**
 * kem.ts - each treasury signer's ML-KEM-1024 key in QoreChain's encryption key
 * registry, so proposals can be sealed to them (envelope.ts).
 *
 * The seal keys come from the account's own mnemonic (QoreSeal `deriveSealKeys`,
 * index 0), so they need no separate backup. `MsgRegisterKEMKey` is hybrid-signed
 * from the account; QoreX refuses it for pages, which is why this is a script.
 * Registering again would REPLACE the key and strand every envelope sealed to the
 * old one, so it refuses a different key unless told to replace it. (The same
 * rules as qore-pq-kit's kem.ts, v0.5.0, rewritten for v2's own accounts.)
 *
 * Local mode (`npm run e2e:local`): anvil has no registry, so a stand-in file in
 * the secrets directory plays it, the way the precompile stand-ins play
 * pqcKeyStatus and pqcVerify. The testnet always reads the chain.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveSealKeys, type SealKeyPair } from "@qorechain/qoreseal";
import { fetchKemKey } from "@qorechain/qoreseal/network";
import { msg as sdkMsg, type UnifiedAccount } from "@qorechain/sdk";
import type { EncodeObject } from "@cosmjs/proto-signing";
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import { broadcast, network } from "pqkit";
import { SECRETS_DIR, loadV2Account } from "./accounts.ts";
import { LOCAL_RPC } from "./vault.ts";

export const ML_KEM_1024 = 2;
export const ML_KEM_1024_PUBLIC_KEY_LENGTH = 1568;

/** The account's QoreSeal keys. Secret: never print them. */
export function sealKeysOf(acc: UnifiedAccount): SealKeyPair {
  if (!acc.mnemonic) throw new Error("this account was not derived from a mnemonic; cannot derive seal keys");
  return deriveSealKeys({ mnemonic: acc.mnemonic, index: 0 });
}

/** `MsgRegisterKEMKey { sender, algorithm_id: 2 (ML-KEM-1024), public_key }`. */
export function registerKemMsg(sender: string, mlkemPublicKey: Uint8Array): EncodeObject {
  if (mlkemPublicKey.length !== ML_KEM_1024_PUBLIC_KEY_LENGTH) {
    throw new Error(`an ML-KEM-1024 key is ${ML_KEM_1024_PUBLIC_KEY_LENGTH} bytes (got ${mlkemPublicKey.length})`);
  }
  return sdkMsg.pqc.registerKemKey({ sender, algorithmId: ML_KEM_1024, publicKey: mlkemPublicKey });
}

/** A short fingerprint for printing a public key. */
export const fingerprint = (k: Uint8Array): string => keccak256(k).slice(0, 18);

const localRegistry = () => join(SECRETS_DIR, "local-kem-registry.json");

function readLocal(): Record<string, Hex> {
  return existsSync(localRegistry()) ? (JSON.parse(readFileSync(localRegistry(), "utf8")) as Record<string, Hex>) : {};
}

/** The ML-KEM-1024 key `qor` has published, or undefined. */
export async function kemKeyOf(qor: string): Promise<Uint8Array | undefined> {
  if (LOCAL_RPC) {
    const k = readLocal()[qor.toLowerCase()];
    return k ? hexToBytes(k) : undefined;
  }
  const st = await fetchKemKey({ rest: network().rest, address: qor });
  if (!st.registered || !st.publicKey) return undefined;
  if (st.algorithmId !== undefined && st.algorithmId !== ML_KEM_1024) throw new Error(`${qor} publishes a key of algorithm ${st.algorithmId}, not ML-KEM-1024`);
  return st.publicKey;
}

/** Publish the account's ML-KEM-1024 key. Idempotent; refuses to replace a different key unless `replace`. */
export async function registerKemV2(name: string, opts: { replace?: boolean } = {}): Promise<void> {
  const acc = await loadV2Account(name);
  const keys = sealKeysOf(acc);
  const mine = keys.mlkemPublicKey;
  const current = await kemKeyOf(acc.cosmos);
  if (current && bytesToHex(current) === bytesToHex(mine)) {
    console.log(`${acc.cosmos} already publishes this ML-KEM-1024 key (${fingerprint(mine)}); nothing to do`);
    return;
  }
  if (current && !opts.replace) {
    throw new Error(`${acc.cosmos} already publishes a DIFFERENT ML-KEM key (${fingerprint(current)}); pass --replace to replace it`);
  }
  if (LOCAL_RPC) {
    const reg = readLocal();
    reg[acc.cosmos.toLowerCase()] = bytesToHex(mine);
    writeFileSync(localRegistry(), JSON.stringify(reg, null, 2) + "\n", { mode: 0o600 });
    console.log(`published ML-KEM-1024 key ${fingerprint(mine)} for ${acc.cosmos} (local stand-in registry)`);
    return;
  }
  const res = await broadcast(acc, [registerKemMsg(acc.cosmos, mine)]);
  console.log(`${current ? "replaced" : "registered"} ML-KEM-1024 key ${fingerprint(mine)} for ${acc.cosmos}: tx ${res.transactionHash}`);
}
