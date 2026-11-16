# Peal Tender's cover image

The 1920 × 1080 cover for the fest project page, `peal-tender-cover.png`, drawn in Peal
Tender's identity: the Tender lockup, the line "A stolen classical key moves nothing",
and the payment order from the landing page. Two ML-DSA-87 signatures carry the order
past the verified seal. The order beneath it, signed only with a stolen secp256k1 key,
is stamped refused.

Everything to be read sits in a centred safe area (x 160 to 1760, y 110 to 800),
because the project page may crop the edges and lays its title band over the bottom.
The bottom band holds only the security pattern. Open `cover.html#safe` to see the
safe area outlined.

Render it (PNG, JPG, a 400 px preview and the safe-area check):

```sh
npm i --no-save playwright-core
node docs/brand/cover/render.mjs <out-dir> [chromium-path]
```
