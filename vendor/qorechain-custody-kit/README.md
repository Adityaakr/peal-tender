# Vendored: QoreChain custody kit (address validation)

`address.ts`, `bech32.ts` and `LICENSE` are copied unchanged from
[qorechain/qorechain-custody-kit](https://github.com/qorechain/qorechain-custody-kit)
`code/ts/src/` at tag **v0.1.1** (commit `4455daddfbd055ab0b4b7cb0beb90d3e3460d06b`),
Apache-2.0, Copyright 2026 QoreChain Association. `address-vectors.json` is the
`addresses` section of that tag's `vectors/custody-v1.json`.

The custody kit is reference code "meant to be read, copied or vendored rather than
installed as a package", so it is vendored here. Peal Tender uses `validateAddress` on
every address a treasury proposal names (a sweep's recipient, a deposit's source, a new
signer set) before the proposal is written, and `test-ts/custody.test.ts` runs the
kit's own vectors against this copy.

To update: copy the same files from a newer tag and rerun `npm run test:ts`.
