# The Peal Tender video

The submission video for QoreChain "Build Before Q-Day" (Post-Quantum dApp category):
a 2:57 narrated explainer and demo, 1920x1080 at 30 fps. This folder holds its source;
the rendered file, the screenshots, the voice and the music are not committed.

The second cut (21 November 2026) replaces the first one's (17 November) local-node demo
with the product live on the testnet: scenes 5, 7 and 8 and their narration are new, and
scenes 6 and 9 move with them.

| File | What |
| --- | --- |
| [`brag-plan.md`](brag-plan.md) | The plan: angle, storyboard per scene, the voice-over script, audio direction |
| [`composition-brief.md`](composition-brief.md) | The hand-off to HyperFrames: identity, scene timings, audio |
| [`src/scenes/`](src/scenes) | The nine scenes (HTML + GSAP), timed to the narration |
| [`src/build.mjs`](src/build.mjs) | Writes the HyperFrames project (`index.html`, `compositions/`) from `src/` |
| [`src/common.css`](src/common.css), [`src/helpers.js`](src/helpers.js) | Peal Tender's tokens and the shared motion helpers (camera framing, focus frames, blur-in) |
| [`src/audio.json`](src/audio.json) | Voice, music bed and the five sound effects, with their times and levels |
| [`src/voice/`](src/voice) | The narration as spoken by Kokoro, one file per scene, and the track assembler |
| [`src/capture.mjs`](src/capture.mjs) | Screenshots of the real landing page the film shows (scenes 2 to 6 and 8) |
| [`src/capture-live.mjs`](src/capture-live.mjs) | Screenshots of the hosted app reading the live v2 vault (scene 7), and where its two wallet shots come from |
| [`share-copy.txt`](share-copy.txt) | The post that goes with the video |

## What the film shows, in order

1. **Q-Day** (0:00): a treasury held by one secp256k1 key, and what an attacker who derives
   the private key from the public one can do.
2. **Peal Tender** (0:17): the lockup, then the landing page's payment order: VERIFIED 2/3,
   and an order signed with a classical key only, REFUSED.
3. **How a buyback clears** (0:34): deposit, open a tender, offers, one clearing price,
   settle, over the drill vault's real tender 1 (cleared at 0.0013 fUSD, 76.92 tPEAL bought).
4. **Why a stolen key moves nothing** (1:02): the signed message field by field,
   `pqcKeyStatus` and `pqcVerify`, the nonce, and the scoped EVM window.
5. **The Q-Day Drill** (1:30): the drill account, the nine refused instructions of the
   rehearsal (THREAT_MODEL.md, section 7), then the day itself: the proof transaction
   `0x42ee8b65…edd4f1` (18 November, 10:18:05 UTC, success), nothing moved by the
   attacker, and the vault's 67 QOR and 0.102818 fUSD all kept (DRILL.md).
6. **Live on the testnet** (1:47): the drill vault's address, the statement of account, the
   `openTender` and `settle` transactions in full.
7. **Version two, live** (2:04): the hosted app at peal-tender.vercel.app reading the v2
   vault: the 2-of-3 signers' ML-DSA-87 keys, the daily allowance and the rules, tender #3
   open for offers, then a fresh browser's guest account registering its key and claiming
   test PEAL-T (the wallet panel's real log), its offer into tender #2 with the window,
   approval and offer transactions, and tender #2 settled at one price.
8. **The category's requirements** (2:30): scoped EVM window, pqcVerify, the two-stage QCAI
   audit (prepared in `audits/`), 132 Foundry tests.
9. **Outro** (2:49): the lockup, the headline, the live app and the repository, the Peal
   family.

Every figure on screen comes from this repository (README.md, DRILL.md, THREAT_MODEL.md,
`deployments/`, `audits/`), from the testnet, or from the screens themselves. Only public addresses and
transaction hashes appear; no key, recovery phrase or API key is shown or spoken.

## Rebuild it

Needs Node.js 22, ffmpeg, Python 3 and the HyperFrames CLI (0.9.58), plus a Chromium for
the screenshots. Work in a scratch folder outside the repository, since the media is large.

```sh
npx hyperframes init film --skip-skills        # a HyperFrames project
cp -R docs/video/src film/src
# Assets the source expects, under film/assets/:
#   brand/     lockup.svg, mark.svg, wordmark.svg from docs/brand/tender/;
#              auction-lockup.svg, bidder-lockup.svg from docs/brand/auction|bidder/lockup.svg
#   fonts/     IBM Plex Serif 300/400 (+italics), Plex Sans 400/500/600, Plex Mono 400/500
#              as woff2, named as in src/fonts.css (Google Fonts, OFL)
#   music/bed.mp3   "Happy Beats / Business Moves vol. 12" by ende.app (CC BY 4.0)
#   sfx/       drop_001, drop_002, impactSoft_medium_001/004, bong_001 (Kenney, CC0)
#   shots/     node src/capture.mjs (see its header: the dashboard and demo:local running),
#              plus node src/capture-live.mjs for scene 07's live-*.png (see its header)
#   vo/ and voiceover.wav   see src/voice/assemble.py
cd film && node src/build.mjs && npx hyperframes check && npx hyperframes render --quality delivery -o ../peal-tender.mp4
```

The voice is Kokoro-82M (`af_heart`) on the local machine through `npx hyperframes tts`;
it needs the `kokoro-onnx` Python package (`HYPERFRAMES_PYTHON` can point at a venv
that has it). Terms are spelled for the voice in `src/voice/` ("M L D S A eighty-seven",
"Core Chain", "P Q C verify"); the plan shows the script as written.

Made with the `/brag` workflow and HyperFrames, by a worker agent; see
[AI_USAGE.md](../../AI_USAGE.md).
