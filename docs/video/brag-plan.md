# Brag Plan: Peal Tender

Run: `/brag:brag --voice --tone polished --duration 179`, 17 November 2026.
Owner's direction: "the best demo and explainer video, around 2:59, clean and meaningful depth, with a clean voice-over, so we can share everything about Peal Tender."
Purpose: the hackathon submission video for QoreChain "Build Before Q-Day", Post-Quantum dApp category (at most 3:00).

The owner asked for 2:59, which overrides brag's 15-25 s window. Every other creative law holds: readable, specific, the real product, no generic SaaS language.

## What is this app?
A treasury buyback vault on QoreChain where every action that moves money or changes the rules needs a fresh ML-DSA-87 signature, which the contract checks on chain with `pqcKeyStatus` and `pqcVerify`. A stolen classical key moves nothing.

## The angle
A bank's payment order, the product's own metaphor (`apps/dashboard/DESIGN.md`). The film walks a judge through it in the order a sceptic asks: what breaks on Q-Day, what this is, how a buyback clears, why a stolen key fails, whether it is real, what v2 adds, and whether it meets the brief. Every number on screen comes from the repository or the chain.

## Hook (first 2-3 seconds)
A treasury drawn the way the landing page draws it: one account, one secp256k1 key, the funds beneath. Its public key slides onto the chain line while the voice says it has been there since the first transaction. On "Q-Day" the attacker box appears in stamp red.

## Key moments (the middle)
- The real payment-order instrument from the landing page: the camera moves from the VERIFIED 2/3 seal to the REFUSED stamp on the order signed with a classical key only.
- The drill vault's tender 1: a five-step rail (deposit, open a tender, offers, one clearing price, settle) above the real clearing chart. It cleared at 0.0013 fUSD and bought 76.92 tPEAL.
- The signed message assembling field by field, then the vault's three checks (`pqcKeyStatus`, `pqcVerify`, nonce) and the scoped EVM window from the real "How a payment clears" diagram.
- The drill rehearsal: nine refused instructions, stamped "9 of 9 refused".
- The statement of account: real testnet transactions, row by row, with the vault address and the settle hash in full.
- v2 in the real app on a local node: signers' keys from `pqcKeyStatus`, the timelock with a vetoed and an executed change, a settled tender, sealed sales on Peal Sealed Auction.
- The category's requirements table, then 132 Foundry tests counted up.

## Outro / punchline
The Peal Tender lockup and the site's headline, "Nothing leaves this treasury without two signatures the chain can verify.", the repository link and the family line with all three products. A 2.7 s hold.

## User flow worth showing
1. The treasury opens a tender (budget and price ladder); holders offer; it settles at one price (tender 1 on testnet; tender #1 in the local v2 app).
2. Two signers authorise an order; the vault verifies both with `pqcVerify`; it pays or holds (landing diagram and app Overview, Signers, Timelock).
3. An attacker with the classical key tries every route; each is refused (rehearsal table).

## Tone
- Preset: polished
- Creative direction: a quiet, exact product film for a post-quantum treasury, in the voice of a bank's payment order
- Interpretation: long holds on real screens, slow camera moves with long-tailed eases, one accent colour (treasury green) for verified things and stamp red only for refusals. No bounces, no loops, no flashing text.

## Format: landscape, 1920x1080, 30 fps
## Duration: 179 s (2:59). Hard ceiling 180 s.

## Visual identity (from the project)
- Background: paper `#f1f4f2`; sheet `#fcfdfc`
- Ink: `#10231d`; secondary `#3d4d47`; muted `#677770`; rules `#d3dcd7`
- Accent: treasury green `#1e5b46` (weak `#e2ece7`)
- Stamp red `#a3261a` on `#f9ebe9` (refusals only); amber `#9a5b0d` on `#fbf3e4` (held)
- Display: IBM Plex Serif 300/400; text: IBM Plex Sans; figures and hashes: IBM Plex Mono
- Marks: `docs/brand/tender/lockup.svg`, `mark.svg`; family lockups for Sealed Auction and Bidder
- Strongest visual: the payment-order instrument with its VERIFIED seal and REFUSED stamp

## Secrets
None appear. The film shows public addresses and transaction hashes only. The v2 app screens come from `npm run demo:local`, whose throwaway accounts live in a temporary directory and never appear. DRILL.md's key hand-over line is not shown or spoken.

## Share copy (draft)
Peal Tender: a treasury buyback vault on QoreChain where every payment needs ML-DSA-87 signatures the chain verifies with pqcVerify. A stolen classical key moves nothing: 9 of 9 drill attacks refused, live on testnet.

## Audio direction
- Role: the voice is the clock; a quiet warm bed under it.
- Music: `happy-beats-business-moves-vol-12` (steady, clean, 110 BPM), at 0.09 under the voice, in two passes (0-118 s, then from the track's start, crossfaded at about 116 s under the v2 section), faded out under the outro.
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. The voice decides timing here; cue sync is not used, because narration anchors every reveal.
- Audio-reactive treatment: none. A narrated explainer reads better still; the edit carries the rhythm.
- SFX posture: sparse, warm, low high-frequency risk. A soft impact when the REFUSED stamp is the subject (scene 2), a soft impact on "9 of 9 refused" (scene 5), a quiet drop on the verified seal and on the clearing price, a low bong under the final lockup.
- Restraint rule: nothing over the voice louder than the voice; no whooshes on every cut.

## Voiceover script
Kokoro `af_heart`, speed 1.0, one clip per scene, assembled with 1.0 s pauses (`src/voice/vo-timing.json`). Terms are spelled for the voice in `src/voice/` (e.g. "M L D S A eighty-seven", "Core Chain", "P Q C verify").

1. Every blockchain treasury answers to a classical key, and its public half is on chain from the very first transaction. On Q-Day, a large enough quantum computer derives the private key from it. A treasury held by that one key loses everything.
2. Peal Tender is a treasury buyback vault on QoreChain, built for that day. Money leaves only on an order signed with ML-DSA-87, a post-quantum signature the chain checks itself. An order carrying only a stolen classical key is refused.
3. Here's how a buyback works. The treasury deposits its payment token, and opens a tender: a budget, and a ladder of prices. Holders offer their tokens at the lowest price they'll accept. The price climbs while the budget can still pay every offer at or below it. At settlement, everyone who sells is paid that one clearing price, never less than they asked. The vault's first tender cleared at 0.0013, and bought back 76.92 tokens.
4. So why can't a stolen key touch it? Every action that moves money, or changes the rules, carries a fresh ML-DSA signature, bound to the chain, the vault, the action, a number that works only once, and the exact arguments. The vault reads the signer's key with pqcKeyStatus, and checks the signature with pqcVerify: QoreChain's own precompiles. And every transaction goes out through an EVM window scoped to the vault, then closed.
5. For the Q-Day Drill on November eighteenth, the signer's classical key goes to the organisers. We rehearsed every route with that key alone: transfers, opening windows, approvals, a forged sweep. Nine of nine were refused. Nothing moved.
6. And it's live. The drill vault has run on the QoreChain testnet since November fifteenth, and its statement of account is real: a deposit, a post-quantum signed sweep, a tender opened, settled, and paid. Every line is a transaction you can look up.
7. Version two moves authority to three signers. Any two of their ML-DSA keys sign each order. Payments draw on a daily cap. Anything larger, and every rule change, waits in a public timelock, where one honest signer can veto it. Anyone can settle a finished tender. And a buyback can run as a sealed sale on Peal Sealed Auction, with bids hidden until the close, and proceeds that can only return to the vault.
8. And against the category's brief: a scoped EVM window on every action. pqcVerify on every order. A two-stage QCAI audit, with stage one around November twenty-second, and stage two on the twenty-ninth. And a hundred and thirty-two Foundry tests, unit, fuzz, and invariant, running in CI.
9. Peal Tender. Nothing leaves this treasury without signatures the chain can verify.

## Storyboard

Scene starts follow the voice: each scene opens 0.4-0.5 s before its narration. Transitions are a blur swap on one paper ground (out 0.25 s, in 0.35 s); the ground never cuts.

### Scene 1 - The threat - 0.0-16.6 s
Left: chapter label "Q-Day"; serif title "A treasury held by one key" (the site's own heading). Right: the landing page's "Today" diagram rebuilt large: Treasury account (one secp256k1 key) above Treasury funds. On "public half" a public-key chip moves onto a chain line ("on chain since its first transaction"). On "Q-Day" the dashed red attacker box appears ("derives the private key from the public key"), with a red dashed arrow from the key. On "loses everything" a red arrow reaches the funds and the funds box turns stamp red: "move on one signature".
Sequential/interaction: yes; diagram parts arrive on their words.
Audio intent: bed enters quietly; no effects.
Transition mood: soft -> Scene 2

### Scene 2 - Peal Tender - 16.6-34.3 s
The lockup arrives centred with a blur-in; a mono line under it: "Treasury buyback vault · QoreChain". On "Money leaves only on an order" the lockup gives way to the real landing hero; the camera moves to the instrument (VERIFIED 2 / 3 on "the chain checks itself"), then down to the REFUSED order on "is refused".
Sequential/interaction: camera path across one real screen; a thin green frame marks the seal, a thin red frame the stamp.
Audio-coupled idea: soft drop when the seal frame lands; soft impact when the refused frame lands.
Transition mood: soft -> Scene 3

### Scene 3 - How a buyback clears - 34.3-62.4 s
Top: a five-step rail, Deposit · Open a tender · Offers · One clearing price · Settle; each step turns green on its word. Below: the real "Tender 1 of the drill vault" chart and table. Camera: the whole chart, then onto the 0.0013 bar on "clearing price", then the table rows "Clearing price 0.0013 fUSD, for everyone" and "Bought 76.92 tPEAL" on the last sentence.
Sequential/interaction: rail steps light one by one (each holds as the voice moves on).
Audio-coupled idea: one quiet drop on the clearing price.
Transition mood: soft -> Scene 4

### Scene 4 - Why a stolen key fails - 62.4-90.0 s
A: a payment-order card titled "ML-DSA-87 signature · 4,627 bytes" whose message fields (chain 9800, vault, action, nonce, deadline, arguments) write in as they are named. B: the vault's checks as three ledger lines: `pqcKeyStatus(signer)` at `0x…0a02` (registered, ML-DSA-87, possession proven), `pqcVerify(key, sig, message)` at `0x…0a01`, `nonce += 1`, then "funds move". C: the real "How a payment clears" diagram with step 4, the scoped EVM window, framed.
Transition mood: soft -> Scene 5

### Scene 5 - The drill - 90.0-106.0 s
Left: "Q-Day Drill · 18 November 2026" and "The signer's classical key goes to the organisers." Right: the real "Instructions refused" table revealed row by row as routes are named. On "Nine of nine" a stamp-red seal lands: "9 of 9 refused".
Audio-coupled idea: soft impact on the stamp.
Transition mood: soft -> Scene 6

### Scene 6 - Live on testnet - 106.0-123.0 s
Header: "Live on QoreChain testnet · qorechain-diana · chain id 9800"; the vault address in full mono; "deployed 15 Nov 2026, block 10158423". The real statement of account below; each row is framed as the voice names it. Bottom: the settle transaction hash in full.
Transition mood: soft -> Scene 7

### Scene 7 - Version two - 123.0-149.3 s
Label: "PealTenderV2 · the real app on a local node · testnet deploys open 19 November". Real app screens, one framing each: Signers (2 of 3 to act, 1 to veto) -> Timelock (daily allowance; vetoed and executed changes) -> Tender #1 settled by anyone -> Sealed sales, with the Peal Sealed Auction lockup.
Transition mood: soft -> Scene 8

### Scene 8 - The category's requirements - 149.3-170.7 s
The real requirements table; each row framed as it is named. On "132 Foundry tests" a figure strip counts up to 132 with its breakdown (drill vault 50; v2 82: 57 unit, 8 fuzz, 7 invariant, 4 vectors, 6 gas).
Transition mood: soft -> Scene 9

### Scene 9 - Outro - 170.7-179.0 s
The Peal Tender lockup; the headline; `github.com/Adityaakr/peal-tender`; the family line (Peal Tender, Peal Sealed Auction, Peal Bidder). Holds still to the end.
Audio-coupled idea: a low bong as the lockup lands; music fades out.

**Music mood for this video:** steady, warm, very low
**Audio summary:** a calm voice carries the film over a barely-there bed, with five or six soft, physical accents where something is verified, refused or finished.
