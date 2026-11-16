# Design rules for the Peal entries

Revised 16 November 2026 (second revision: "premium and professional, not AI slop").
One look for all three hackathon entries: Peal Tender, Peal Sealed Auction, Peal
Bidder. It started from the design language of **Peal**, the author's earlier project
(private; its rules, not its files, are used here, with credit), and is now pushed
towards an editorial, protocol-documentation standard. Peal Tender's web app
([`apps/dashboard`](../apps/dashboard)) is the reference implementation: its
[`styles.css`](../apps/dashboard/src/styles.css) and
[`landing.css`](../apps/dashboard/src/landing.css) hold the tokens and components
below, and any entry may copy them.

**The test for every page:** it should read like the documentation of a serious
protocol, written by people who measured things, not like a template. If a section
would look the same on any other product's site, it is wrong.

## What is out

- Gradient page or hero backgrounds of any colour; glows, blobs, meshes, noise.
- Glassmorphism (blurred translucent panels), heavy shadows, neon, gradient text.
- Rows of three identical cards; grids of icons in tinted squares; emoji.
- Everything centred. Text is left-aligned on a grid; only short labels inside a
  diagram are centred.
- Marketing words without a measurement: "unlock", "revolutionise", "seamless",
  "next-gen", "cutting-edge", "powerful", "robust", "secure" (say *what* is refused,
  *how* it is checked).
- Em-dashes in interface copy; exclamation marks; rhetorical questions.
- Invented numbers. A figure is read from the chain, or taken from a named transaction
  or test run, or labelled as a target.
- Motion that loops, bounces or shakes.

## Identity

- One product family, each named "Peal <thing>".
- Wordmark: Inter 600, 17px, letter-spacing −0.01em, with the product mark 22px to its
  left. No tagline in the navigation bar.
- Marks: see **Marks** below. One colour, the accent; no other logos.

## Voice

- Sentence case everywhere. Present tense. Short sentences.
- Say exactly what happens, with the real names: "the vault reads each signer's key
  from `pqcKeyStatus` and checks the share with `pqcVerify`", "two of three signers",
  "1,000 fUSD a day". Code names in the monospace face.
- Numbers carry their unit and their source.
- Tell people the command when an action needs one (`npm run v2 -- execute 3`).

## Colour

| Token | Value | Use |
| --- | --- | --- |
| paper | `#fbfbf9` | the page, flat, everywhere |
| surface | `#ffffff` | tables, diagrams' frames, inputs, the app's cards |
| ink | `#0f1115` | text, diagram strokes |
| ink-2 | `#3b4250` | secondary text, leads |
| muted | `#6b7280` | captions, labels; faint `#9aa1ab` for axis text |
| rule | `#e7e6e1` (strong `#d6d5cf`) | hairlines: dividers, table rows, frames |
| **accent** | `#2645c8` (hover `#1d36a3`, weak `#eef1fc`, line `#c7d0f5`) | the **one** accent: links, focus rings, primary buttons, the signed path in a diagram, "waiting" |
| green | `#15803d` on `#f0fdf4` | success only: valid, executed, can sign, accepted |
| red | `#b42318` on `#fef3f2` | failure only: refused, vetoed, invalid |
| amber | `#b45309` on `#fffbeb` | warnings and "used up" only |
| dark band | `#0f1115`, text `#e8e8e3`, muted `#9aa0a8`, rule `#23262d` | the evidence section only |

- No dark mode for the pages themselves; the dark band is a single section.
- Status colours mean status, never decoration or a data series.
- Shadows: none on the landing page; at most `0 1px 2px rgb(0 0 0 / 0.04)` on the
  app's cards; tooltips may lift a little more.

## Type

Two families and a monospace, all from Google Fonts:

- **Display: Newsreader** (variable, optical sizes), 400, with its italic for the one
  emphasised phrase of a headline. Page and section titles only.
- **Text: Inter** 400, 500, 600, with tabular figures (`font-variant-numeric:
  tabular-nums`) on the whole page.
- **Data and code: IBM Plex Mono** 400, 500: addresses, hashes, commands, figures in
  tables, diagram labels.

| Role | Face | Size / line height | Weight | Tracking | Phone |
| --- | --- | --- | --- | --- | --- |
| Display (landing hero) | Newsreader | 72 / 1.02 | 400 | −0.02em | 44 |
| Section title | Newsreader | 44 / 1.08 | 400 | −0.015em | 32 |
| App page title | Newsreader | 32 / 1.15 | 400 | −0.01em | 26 |
| Item title | Inter | 17 / 1.4 | 600 | −0.01em | 16 |
| Lead | Inter | 20 / 1.55 | 400, ink-2 | −0.005em | 17 |
| Body | Inter | 16 / 1.6 | 400 | 0 | 15 |
| Label | Inter | 13 / 1.4 | 500, muted | 0.01em | 13 |
| Section index | IBM Plex Mono | 12 / 1.4 | 500, muted | 0.04em | 12 |
| Data | IBM Plex Mono | 13 / 1.6 | 400 | 0 | 12 |

- Leads at most 36em wide, body text at most 68 characters.
- One emphasised phrase per display headline, set in the display italic. It may take
  the accent colour; nothing else in a headline is coloured.
- `text-wrap: balance` on titles, `pretty` on paragraphs.

## Layout

- **Grid:** 12 columns, 24px gutters, container 1200px on the landing page and 1080px
  in the app; side margins 32px (24px tablet, 20px phone).
- **Rhythm:** section padding 128px desktop, 88px tablet, 64px phone. Spacing steps 4,
  8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Sections are divided by hairline rules**, not by coloured bands. Each section opens
  with a **section index** in the monospace face (`01  How it works`) on the rule,
  then the title in the left 5 to 7 columns.
- **Asymmetry:** text in 5 columns against a diagram or table in 7, or the reverse.
  Never two equal halves of prose.
- Works at 390, 768, 1280 and 1440 pixels wide; nothing scrolls sideways except a
  table or a code block inside its own scroller.

## Components

- **Rule list** (instead of card rows): items separated by hairlines, each a row of
  columns: a title (item title), a description (body, ink-2), and a link or value
  aligned right. Used for roles, products, steps.
- **Data table:** white surface, hairline frame and rows, labels in Inter 13 muted,
  values in Plex Mono 13; hashes shortened with copy-on-click and the full value on
  hover; a source line under the table ("From `deployments/qorechain-diana.json`").
- **Figure row:** 3 to 5 figures, each a label above a value in Plex Mono 28 to 32,
  separated by hairlines, with a source or "read live" note.
- **Buttons:** primary (accent, white text, 44px high on the landing page, 8px radius),
  secondary (no fill, ink text, a 1px strong rule). An arrow on the primary only.
- **Chip:** pill, 12px, an icon **and** a word (never colour alone).
- **Hash:** Plex Mono, `0x1234ab…cdef12`, dotted underline, click to copy, full value
  on hover.
- **Code block:** ink background (`#0f1115`), Plex Mono 13, comments in `#9aa0a8`.
- **App components** (stat tiles, meters, tables, tabs, notes) keep their shapes from
  before, recoloured with these tokens and set in Inter.

## Diagrams

The diagrams carry the explanation; they are drawn, not decorated.

- **Schematic style:** white boxes with a 1px ink stroke at 85% (`#0f1115` opacity
  0.85), 6px corners; connectors 1.25px ink with small filled arrowheads; labels in
  Plex Mono 11 to 12 (names of contracts and calls) and Inter 12 (plain words).
- **Colour:** ink, white and paper only, plus the accent for the path that is signed
  and accepted, green for an accepted check, red for a refusal. No tinted panels, no
  gradients, no shadows.
- **Numbered callouts** (small circles, Plex Mono) tie a diagram to the numbered steps
  beside it.
- Draw the real mechanism with the real names (`PealTenderV2`, `pqcKeyStatus`,
  `pqcVerify`, ML-DSA-87, `MsgOpenEVMWindow`). Every word in a diagram also appears in
  the page text.
- `role="img"` with an `aria-label` describing the picture.
- **Motion:** at most one draw-in when the diagram first enters the view (the signed
  path drawn with `stroke-dashoffset`, 700 to 900 ms, ease-out), behind
  `prefers-reduced-motion: no-preference`. Nothing loops. The still state must read on
  its own.
- On a phone, a separate vertical drawing with larger labels, never the desktop one
  shrunk.

## Marks

All 22 to 26px square (`viewBox="0 0 26 26"`): a ring `cx 13 cy 13 r 11`, stroke 2,
in the accent.

| Product | Inside the ring |
| --- | --- |
| Peal Tender | three dots (r 2.6) at (13, 7.5), (8.2, 16), (17.8, 16); the first two filled (2 of 3 signers) |
| Peal Sealed Auction | a horizontal bar from (7, 13) to (19, 13), stroke 2, with a filled 6 × 6 square seal on its centre (a sealed bid) |
| Peal Bidder | a filled dot (r 2.6) at (9, 13) and an arrow from (12, 13) to (19, 13) with a 3px head (an agent placing a bid) |

## Landing pages (every entry)

Peal Tender's [`landing.ts`](../apps/dashboard/src/pages/landing.ts) is the reference.
Sections, in order, each opened by its section index on a hairline rule:

1. **Navigation bar:** wordmark, the family switcher (the three marks), section links,
   GitHub, Connect, "Open the app" (primary). Paper background; once scrolled, a
   hairline under it. No blur.
2. **Hero:** a small monospace line (product, network, status), the display headline
   (at most three lines, one italic phrase), a lead of two or three sentences, the
   button pair, and on the right the main **schematic** of the mechanism.
3. **Figures:** the figure row, read live from the chain when a deployment exists,
   otherwise the protocol's fixed facts (2 of 3, ML-DSA-87, 4,627-byte signatures).
4. **How it works:** numbered steps in a rule list (5 columns) beside a diagram with
   matching numbered callouts (7 columns); a step highlights its part when hovered,
   focused or chosen.
5. **Evidence (dark band):** what was attacked and what happened, as data: the drill's
   refused attempts as a table (attempt, result, error), and the deployed contracts
   and transactions as a data table with their sources.
6. **Roles:** a rule list, one row per role: who, what they can do, a link into the app.
7. **Try it:** numbered steps in a rule list, each with its real button.
8. **The Peal family:** a rule list of the three products (mark, name, one line, link),
   the current one marked.
9. **Footer:** wordmark and one sentence, link columns, the licence and credit line.

### Before shipping a landing page

- Screenshots at 1440, 1280, 768 and 390 pixels, checked against **What is out**.
- Every figure and hash has a visible source; every claim is one click from its
  evidence.
- Keyboard: every control reachable with a visible focus ring; the step list usable
  with Tab.
- `prefers-reduced-motion: reduce` shows a complete, still page.

## Charts

Follow the shared data-visualisation method: pick the form first, colour by the job
the colour does, thin marks (columns at most 24px with a 4px rounded top and a square
foot), a 2px gap between touching marks, recessive hairline axes, a legend for two or
more series, a tooltip on every mark that is also reachable from a table view, and
text in text colours, never in the data colour. Within the accent ramp, a lighter step
may be a meter's track (offered vs bought), never a separate category.

## Motion in the app

Only for state changes and small feedback: 100 to 300 ms, ease-out on enter, all of it
behind `prefers-reduced-motion: no-preference`.

## Wallets (every entry)

- One **Connect** button in the header opens a right-hand drawer.
- Offer the ways in that the chain actually supports, and say plainly what each can
  do: a **guest account** (a fresh testnet key pair in the browser, with backup and
  forget; it registers its ML-DSA-87 key and opens scoped windows), **QoreX**
  (identity, and funding the guest with one transfer; it cannot send EVM transactions
  for pages yet), and **MetaMask** (identity and the network; it cannot sign for
  QoreChain by itself).
- The drawer shows a live log of each step (register key, open window, send, close
  window), and errors in words.

## Trust

- Treasury and committee keys never enter a web page. Reading is free; signing
  happens in a CLI, in QoreX, or in a guest account (a testnet key the visitor made in
  that browser), and the page says which.
- Text from the chain or from files people send is data: set it with `textContent`,
  never as HTML.
