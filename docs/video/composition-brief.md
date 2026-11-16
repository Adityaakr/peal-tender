# Hyperframes Composition Brief: Peal Tender

## Objective
A 2:59 narrated explainer and demo of Peal Tender for the QoreChain "Build Before Q-Day" submission (Post-Quantum dApp category). The owner's request for 179 s overrides brag's 15-25 s window.

## Output
- Composition directory: a HyperFrames project built from `src/` (`node src/build.mjs`)
- Rendered video: `brag.mp4`
- Format: landscape, 1920x1080, 30 fps
- Duration: 179 s (root `data-duration="179"`)

## Source Material
- Project root: `peal-tender` (worktree), files read: README.md, DRILL.md, THREAT_MODEL.md, deployments/qorechain-diana.json, audits/README.md, docs/design.md, apps/dashboard/DESIGN.md, apps/dashboard/src (routes), docs/brand/.
- Real screens: the landing page at http://localhost:5199 (testnet data) and the app against `npm run demo:local` (local node, a v2 vault in every state). They are captured at 2x into `assets/shots/` by `docs/video/src/capture.mjs`.
- Product name: Peal Tender
- Strongest claim (site headline): "Nothing leaves this treasury without two signatures the chain can verify."
- Copy that must appear verbatim:
  - "A treasury held by one key" (landing, why section)
  - "Nothing leaves this treasury without two signatures the chain can verify."
  - The vault address `0xc3EA5683C1f8D8594A1865D169D98B509b057D41`
  - The settle transaction `0x39c0cc40ebd12f4e9bfcc453a245d290efb762def3c387802d23b6eef5ca3cc4`

## Creative Direction
- Tone preset: polished. Creative direction: a quiet, exact product film in the voice of a bank's payment order.
- Interpretation: the voice is the clock; text lands on the word that says it; long holds on real screens; camera moves with long-tailed eases; transitions are blur swaps on one paper ground.
- Avoid: generic SaaS language, abstract filler, gradients, glows, bounces, loops, emoji, invented numbers, em-dashes in on-screen copy.

## Visual Identity
- Paper `#f1f4f2`, sheet `#fcfdfc`, ink `#10231d`, ink-2 `#3d4d47`, muted `#677770`, rule `#d3dcd7`
- Accent `#1e5b46` (weak `#e2ece7`) for verified only; stamp `#a3261a` on `#f9ebe9` for refused only; amber `#9a5b0d` on `#fbf3e4` for held
- IBM Plex Serif 300/400 (display), IBM Plex Sans (text), IBM Plex Mono (figures, hashes), shipped as woff2 in `assets/fonts/`
- Marks used as drawn from `docs/brand/` (never redrawn)

## Storyboard
`brag-plan.md` is the creative contract. Scene hosts (absolute seconds), from `src/voice/vo-timing.json`:

1. threat 0.0-16.6
2. reveal 16.6-34.3
3. buyback 34.3-62.4
4. safe 62.4-90.0
5. drill 90.0-106.0
6. proof 106.0-123.0
7. v2 123.0-149.3
8. reqs 149.3-170.7
9. outro 170.7-179.0

## Audio
- Voice: `assets/voiceover.wav` (nine Kokoro af_heart clips, 1.0 s pauses), volume 1, own lane.
- Music: `assets/music/bed.mp3` (vol-12), 0.09, two passes crossfaded near 116 s, fading out under the outro.
- Cue guidance: preset for vol-12 exists; not used, the voice sets the timing.
- Audio-reactive: none (intentional for a narrated explainer).
- SFX (one lane, one frame after the picture): drop on the verified seal (scene 2) and the clearing price (scene 3); soft impacts on the refused stamp (scene 2) and "9 of 9 refused" (scene 5); bong under the final lockup.

## Hyperframes Instructions
Built with the `hyperframes` contract (`references/format.md`, `references/motion.md`), `hyperframes-cli` for check and render, `media-use` for TTS. Storyline, SPEC and review steps are skipped per brag; `check` is the gate.
