# The Peal Tender video

The submission video for QoreChain "Build Before Q-Day" (Post-Quantum dApp category):
a 2:59 narrated explainer and demo, 1920x1080 at 30 fps. This folder holds its source;
the rendered file, the screenshots, the voice and the music are not committed.

| File | What |
| --- | --- |
| [`brag-plan.md`](brag-plan.md) | The plan: angle, storyboard per scene, the voice-over script, audio direction |
| [`composition-brief.md`](composition-brief.md) | The hand-off to HyperFrames: identity, scene timings, audio |
| [`src/scenes/`](src/scenes) | The nine scenes (HTML + GSAP), timed to the narration |
| [`src/build.mjs`](src/build.mjs) | Writes the HyperFrames project (`index.html`, `compositions/`) from `src/` |
| [`src/common.css`](src/common.css), [`src/helpers.js`](src/helpers.js) | Peal Tender's tokens and the shared motion helpers (camera framing, focus frames, blur-in) |
| [`src/audio.json`](src/audio.json) | Voice, music bed and the five sound effects, with their times and levels |
| [`src/voice/`](src/voice) | The narration as spoken by Kokoro, one file per scene, and the track assembler |
| [`src/capture.mjs`](src/capture.mjs) | Screenshots of the real landing page and app the film shows |
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
5. **The Q-Day Drill** (1:30): the drill account, and the nine refused instructions of the
   rehearsal (THREAT_MODEL.md, section 7).
6. **Live on the testnet** (1:46): the vault address, the statement of account, the
   `openTender` and `settle` transactions in full.
7. **Version two** (2:03): the real app on a local node (`npm run demo:local`): the 2-of-3
   signers, the daily allowance and timelock with a vetoed and an executed change, a
   settled tender, sealed sales on Peal Sealed Auction.
8. **The category's requirements** (2:29): scoped EVM window, pqcVerify, the two-stage QCAI
   audit, 132 Foundry tests.
9. **Outro** (2:51): the lockup, the headline, the repository and the Peal family.

Every figure on screen comes from this repository (README.md, DRILL.md, THREAT_MODEL.md,
`deployments/`, `audits/`) or from the screens themselves. Only public addresses and
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
#   shots/     node src/capture.mjs (see its header: the dashboard and demo:local running)
#   vo/ and voiceover.wav   see src/voice/assemble.py
cd film && node src/build.mjs && npx hyperframes check && npx hyperframes render --quality delivery -o ../peal-tender.mp4
```

The voice is Kokoro-82M (`af_heart`) on the local machine through `npx hyperframes tts`;
it needs the `kokoro-onnx` Python package (`HYPERFRAMES_PYTHON` can point at a venv
that has it). Terms are spelled for the voice in `src/voice/` ("M L D S A eighty-seven",
"Core Chain", "P Q C verify"); the plan shows the script as written.

Made with the `/brag` workflow and HyperFrames, by a worker agent; see
[AI_USAGE.md](../../AI_USAGE.md).
