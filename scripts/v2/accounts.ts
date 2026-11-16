/**
 * accounts.ts - the v2 accounts: three treasury signers, a relayer, a deployer.
 *
 * They live in ~/.qore-peal-tender/<name>.env (0600), never in ~/.qore-drill/,
 * so no v2 command can load the drill account by accident. Every loader also
 * refuses the drill account's address outright: on 18 November 2026 the drill
 * account's classical key is public, and it must never send or receive anything
 * for v2.
 *
 * Scripts print addresses only, never a mnemonic or a key.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  buildRegisterPqcKeyMsg,
  deriveUnifiedAccount,
  fetchEvmWindow,
  fetchPqcStatus,
  generateMnemonic,
  isRegisteredPqcKey,
  signProofOfPossession,
  verifyProofOfPossession,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { balances, broadcast, loadSecrets, network, publicClient, qor, writeSecrets } from "pqkit";

/** The Q-Day Drill account (judged as deployed). v2 never touches it. */
export const DRILL_ACCOUNT_EVM = "0x1453faDA276086E39A87CA39C1CD1F754cbf56bF";
export const DRILL_ACCOUNT_QOR = "qor1z3fl4k38vzrw8x58eguurnglw4xt744lked87j";
/** The drill contracts (vault and token). v2 never sends to them. */
export const DRILL_CONTRACTS = [
  "0xc3EA5683C1f8D8594A1865D169D98B509b057D41",
  "0x6dE33E6D9f106427fb0bee52a61BaD6CdEE01784",
];

export const SECRETS_DIR = process.env.PEAL_TENDER_SECRETS_DIR?.trim() || join(homedir(), ".qore-peal-tender");

export function secretsFile(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) throw new Error(`bad account name "${name}"`);
  if (name === "drill" || name === "ops") throw new Error(`"${name}" is a drill account name; v2 uses its own accounts`);
  return join(SECRETS_DIR, `${name}.env`);
}

export function isDrillAddress(addr: string): boolean {
  const a = addr.toLowerCase();
  return a === DRILL_ACCOUNT_EVM.toLowerCase() || a === DRILL_ACCOUNT_QOR || DRILL_CONTRACTS.some((c) => c.toLowerCase() === a);
}

export function refuseDrill(addr: string, what: string): void {
  if (isDrillAddress(addr)) throw new Error(`${what} ${addr} is a Q-Day Drill address; v2 never uses it`);
}

export async function loadV2Account(name: string): Promise<UnifiedAccount> {
  const path = secretsFile(name);
  const secrets = loadSecrets(path);
  if (!secrets.QORE_MNEMONIC) throw new Error(`QORE_MNEMONIC missing in ${path}`);
  const acc = await deriveUnifiedAccount(secrets.QORE_MNEMONIC, 0);
  refuseDrill(acc.evm, `account "${name}"`);
  return acc;
}

export async function newV2Account(name: string): Promise<void> {
  const path = secretsFile(name);
  if (existsSync(path)) throw new Error(`${path} exists; refusing to overwrite`);
  const mnemonic = generateMnemonic(256);
  const acc = await deriveUnifiedAccount(mnemonic, 0);
  writeSecrets(
    path,
    { QORE_MNEMONIC: mnemonic, PRIVATE_KEY: acc.privateKey, EVM_ADDRESS: acc.evm, QOR_ADDRESS: acc.cosmos },
    [
      `Peal Tender v2 testnet account "${name}", created ${new Date().toISOString()}.`,
      "QORE_MNEMONIC restores both keys. PRIVATE_KEY is the classical secp256k1 key only;",
      "the ML-DSA-87 key cannot be derived from it. Never commit this file.",
    ].join("\n"),
  );
  console.log(`created ${path} (mode 0600)`);
  console.log(`evm address: ${acc.evm}`);
  console.log(`qor address: ${acc.cosmos}`);
}

/** Register the account's ML-DSA-87 key with a proof of possession (once; the chain charges for a refused repeat). */
export async function registerV2(name: string): Promise<void> {
  const net = network();
  const acc = await loadV2Account(name);
  const before = await fetchPqcStatus({ rest: net.rest, address: acc.cosmos });
  if (before.registered) {
    if (isRegisteredPqcKey(before, acc.pqc.publicKey) === false) {
      throw new Error(`${acc.cosmos} has a DIFFERENT PQC key registered; not sending`);
    }
    console.log(`${acc.cosmos} already has this ML-DSA-87 key registered; nothing to do`);
    return;
  }
  const proof = signProofOfPossession({ chainId: net.chainId, account: acc.cosmos, keypair: acc.pqc });
  if (!verifyProofOfPossession({ chainId: net.chainId, account: acc.cosmos, publicKey: acc.pqc.publicKey, proof })) {
    throw new Error("the proof of possession does not verify locally; not sending");
  }
  const msg = buildRegisterPqcKeyMsg(acc.cosmos, { pqcKeypair: acc.pqc, proofOfPossession: proof });
  const res = await broadcast(acc, [msg], "classical");
  console.log(`registered ML-DSA-87 key for ${acc.cosmos}: tx ${res.transactionHash}`);
}

export async function statusV2(name: string): Promise<void> {
  const net = network();
  const acc = await loadV2Account(name);
  console.log(`account:  ${name} ${acc.evm} (${acc.cosmos})`);
  const bal = await balances(acc.cosmos);
  const entries = Object.entries(bal);
  console.log(`native:   ${entries.length ? entries.map(([d, a]) => (d === "uqor" ? qor(a) : `${a} ${d}`)).join(", ") : "empty"}`);
  console.log(`evm:      ${await publicClient().getBalance({ address: acc.evm as `0x${string}` })} wei`);
  const pqc = await fetchPqcStatus({ rest: net.rest, address: acc.cosmos });
  const mine = pqc.registered ? isRegisteredPqcKey(pqc, acc.pqc.publicKey) : false;
  console.log(`PQC key:  ${pqc.registered ? (mine === false ? "registered, but NOT this key" : "registered, this key") : "not registered"}`);
  const w = await fetchEvmWindow({ rest: net.rest, address: acc.cosmos });
  console.log(
    `window:   ${!w.found ? "none" : `${w.live ? "LIVE" : "not usable"}; ${w.remainingTxs} txs, ${w.remainingBlocks} blocks; ${w.allowedTargets?.length ? `targets ${w.allowedTargets.join(" ")}` : "any target"}`}`,
  );
}
