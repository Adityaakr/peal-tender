/**
 * refusal.ts - say why QoreChain refused an EVM transaction.
 *
 * The chain admits an EVM transaction only inside a live authorisation window,
 * from an account with a registered post-quantum key, and only the chain's text
 * survives the JSON-RPC error. `@qorechain/wallet-adapter`'s `isEvmWindowRejection`
 * reads that text (and the pqc codes 26 to 28) and names the case; its
 * `EVM_WINDOW_REMEDIES` says what to do about it. No browser globals here, so the
 * tests run it in Node.
 */
export async function explainEvmRefusal(e: unknown, label: string): Promise<Error> {
  const { isEvmWindowRejection, EVM_WINDOW_REMEDIES } = await import("@qorechain/wallet-adapter");
  const kind = isEvmWindowRejection(e);
  if (!kind) return e instanceof Error ? e : new Error(String(e));
  return new Error(`${label} was refused by QoreChain (${kind}): ${EVM_WINDOW_REMEDIES[kind]}`);
}
