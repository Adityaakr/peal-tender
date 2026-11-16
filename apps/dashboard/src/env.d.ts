/** @qorechain/pqc ships JavaScript only; this is the part the app uses. */
declare module "@qorechain/pqc" {
  export const mldsa87: {
    verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
  };
}
