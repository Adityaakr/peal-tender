# Design rules for the Peal entries

Written 16 November 2026. The owner chose one look for all three hackathon entries
(Peal Tender, Peal Sealed Auction, Peal Bidder): the design language of **Peal**, the
author's earlier project. Peal's code is private and stays out of these repositories;
these are its rules, re-stated so each entry can follow them, with Peal credited.
Peal Tender's web app ([`apps/dashboard`](../apps/dashboard)) is the first
implementation: its [`styles.css`](../apps/dashboard/src/styles.css) holds the tokens
and components below, and any entry may copy it.

## Identity

- One product family. Each entry is "Peal <thing>": Peal Tender, Peal Sealed Auction,
  Peal Bidder.
- Wordmark in Josefin Sans 500, about 24px, with a small mark to its left, and a
  one-line tagline under it in muted 13px.
- Each entry has a simple mark in the accent colour (see Marks below); no logos from
  other projects.

## Voice

- Sentence case everywhere, headings and buttons included.
- Short, declarative and technical. Say what happens: "Every move needs their
  ML-DSA-87 signatures", not "Next-gen quantum security".
- No hype, no emoji in the interface, no em-dashes in interface copy (use a full stop
  or a comma).
- Name chain things by their real names (`pqcVerify`, `pqcKeyStatus`, ML-KEM-1024) in
  monospace when they are code.
- Tell people the command when an action needs one (`npm run v2 -- execute 3`).

## Colour

| Token | Value | Use |
| --- | --- | --- |
| page | sky wash `#dcebfa → #eaf3fc → #f6f9fd`, top to bottom, on `html` | every page; the only gradient |
| surface | `#ffffff` | cards, tables, inputs |
| text | `#111827`; secondary `#374151`; muted `#6b7280` | body, labels, captions |
| border | `#e5e7eb` (hover `#d1d5db`) | hairlines on everything |
| **accent** | `#2563eb` (hover `#1d4ed8`, weak `#eff6ff`, border `#bfdbfe`) | the **single** accent: links, focus rings, primary buttons, selected tabs, "waiting" |
| green | `#16a34a` on `#f0fdf4` | success only: valid, executed, can sign |
| red | `#dc2626` on `#fef2f2` | failure only: refused, vetoed, invalid |
| amber | text `#92400e` on `#fffbeb`; meter fill `#d97706` | warnings and "used up" only |

- No dark mode: white surfaces are part of the identity.
- No second accent. Status colours are reserved for status, never for decoration or a
  data series.
- Shadows no heavier than `0 1px 2px rgb(0 0 0 / 0.05)`; tooltips may lift a little more.

## Type

- Interface: **Satoshi** (Fontshare, 400/500/600/700), system-ui fallback.
- Titles: **Josefin Sans** 400/500 (Google Fonts): page titles about 30px, section
  titles about 18px.
- Hashes, addresses and code: `ui-monospace` stack, 13px.
- `font-variant-numeric: tabular-nums` on the whole page, so figures line up.

## Components

- **Card:** white, 1px hairline, 12px radius, 18 to 20px padding. Generous space
  between cards rather than heavier boxes.
- **Stat tile:** label (muted 13px, no colon), value (28px semibold, unit in muted
  14px after it), one line of context; an optional meter.
- **Meter:** 8px track in the accent's weak step; fill in the accent, amber when used
  up, green when complete.
- **Chip:** pill, 12px, always an icon **and** a word (never colour alone): ok, bad,
  waiting, warning, plain.
- **Hash:** monospace, shortened `0x1234ab…cdef12`, dashed underline, click to copy,
  full value on hover.
- **Table:** hairline rows, muted 12px header on `#f9fafb`, numbers right-aligned.
- **Buttons:** 38px high, 8px radius; primary in the accent; secondary white with a
  hairline. Icons 16px.
- **Tabs:** text links in a row with a 2px accent underline on the current one; they
  scroll sideways on a phone instead of wrapping.
- **Code block:** dark slate (`#0f172a`) with comments in `#94a3b8`, for commands
  people copy.
- **Notes:** accent-weak box for information, amber for warnings, red for blockers.

## Charts

Follow the shared data-visualisation method: pick the form first, colour by the job
the colour does, thin marks (columns at most 24px with a 4px rounded top and a square
foot), a 2px gap between touching marks, recessive hairline axes, a legend for two or
more series, a tooltip on every mark that is also reachable from a table view, and
text in text colours, never in the data colour. Within the accent ramp, a lighter step
may be a meter's track (offered vs bought), never a separate category.

## Motion

Only for state changes and small feedback: 100 to 300 ms, ease-out on enter, all of it
behind `prefers-reduced-motion: no-preference`.

## Layout

- Content at most 1040px wide, 24px side gutters (16px on a phone).
- Grids collapse to one column on a phone; nothing scrolls sideways except a tab row
  or a wide table inside its own scroller.
- Every page works at 390px wide.

## Landing pages (every entry)

Updated 16 November 2026 (deep redesign). Each product opens on a landing page, then
its app. Peal Tender's [`landing.ts`](../apps/dashboard/src/pages/landing.ts) and the
`landing` part of its [`styles.css`](../apps/dashboard/src/styles.css) are the reference
implementation; copy them and change the words, the mark and the illustration.

### Principles

1. **One idea per section.** A visitor should be able to say what each section told them.
2. **Show the mechanism.** The main illustration draws how the product actually works,
   with the real names (`pqcVerify`, ML-DSA-87, ML-KEM-1024, window). It is the page's
   centrepiece, not decoration.
3. **Evidence over claims.** Real refused attacks, real transactions, real test counts.
   A number is either read live from the chain or labelled as a demo or a target.
4. **Every button goes somewhere real**: the app, a guest account, the repository.
5. **Not a template.** No stock blobs or meshes, no glass cards, no gradient text, no
   logo walls, testimonials or invented metrics, no grid of six identical icon cards.

### Grid and rhythm

| Token | Desktop | Tablet (≤ 900px) | Phone (≤ 560px) |
| --- | --- | --- | --- |
| Container | 1120px | 100% | 100% |
| Side gutter | 24px | 24px | 16px |
| Section padding (top and bottom) | 112px | 80px | 56px |
| Grid | 12 columns, 24px gap | 6 columns | 1 column |

Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 112. Use the larger steps between
sections and the smaller inside them.

**Bands.** The page keeps the sky wash. One or two sections sit on a full-width white
band with hairlines top and bottom, for rhythm. One section, the security evidence,
may sit on the dark band (`#0b1220`, text `#e5e7eb`, muted `#94a3b8`, hairlines
`#1e293b`); no other dark surfaces.

### Type scale

| Role | Font | Size / line height | Weight | Tracking | Phone |
| --- | --- | --- | --- | --- | --- |
| Display (hero) | Josefin Sans | 64 / 1.04 | 400 | −0.025em | 40 |
| Section title | Josefin Sans | 40 / 1.1 | 400 | −0.015em | 30 |
| Card title | Satoshi | 20 / 1.3 | 600 | −0.005em | 18 |
| Lead | Satoshi | 19 / 1.6 | 400, secondary ink | 0 | 17 |
| Body | Satoshi | 16 / 1.65 | 400 | 0 | 15 |
| Kicker | Satoshi | 13 / 1.4 | 600, accent | 0.01em | 13 |
| Caption | Satoshi | 13 / 1.5 | 400, muted | 0 | 13 |
| Figure | Satoshi | 28 to 32 / 1.1 | 600, tabular | −0.01em | 24 |
| Code and hashes | ui-monospace | 13 / 1.6 | 400 | 0 | 12 |

- Text blocks at most 60 to 68 characters wide (`max-width: 34em` for leads).
- One accent phrase per display headline, in accent ink. Nothing else in the headline
  is coloured.
- The kicker sits above a title, prefixed by a 20px accent rule; sentence case.

### Section order

Adapt the words, keep the order:

1. **Navigation bar.** The wordmark, a family switcher (the three Peal marks), anchor
   links (How it works, Security, Try it), GitHub, then "Open the app" (primary) and
   Connect. Sticky; once scrolled it gets a white 85% background with a hairline.
2. **Hero.** Kicker (category), display headline of at most three short lines, lead
   of at most three sentences, a primary and a secondary button, a proof line in caption type
   ("Testnet · Apache-2.0 · 132 tests"), and the **mechanism illustration** beside it
   (below it on a phone).
3. **Proof bar.** Four or five figures in one white strip with hairline dividers: label
   in caption type, value as a figure. A small live dot when the numbers are read from
   the chain.
4. **How it works.** A **step rail**: three or four numbered steps on the left; on the
   right one large illustration, in which the part each step describes is highlighted
   when that step is hovered, focused or chosen. On a phone, steps stack and each
   carries its own small crop of the drawing.
5. **Security (dark band).** The threat in two sentences, the evidence (a terminal of
   real refused attempts), and a two-column comparison: an ordinary wallet or contract
   against this product, row by row.
6. **Who uses it.** Three role cards, each with a small line drawing and one link into
   the app.
7. **Try it.** Numbered steps a visitor can finish in about five minutes, each with
   the real button.
8. **Family band.** The three Peal products, each with its mark, one line, and a link.
   The current product is marked "You are here".
9. **Footer.** The wordmark and one sentence, link columns (Product, Developers,
   Hackathon), and the licence and credit line ("Design language from Peal").

### Illustration

- Hand-made inline SVG, never a raster or a stock image.
- Draw the real mechanism and label its parts with their real names, in Satoshi 12
  to 13px.
- Strokes 1.5 to 2px with rounded joins. Shapes are white cards with hairlines, on the
  accent ramp: `#eff6ff`, `#dbeafe`, `#bfdbfe`, `#93c5fd`, `#60a5fa`, `#2563eb`,
  `#1e40af`. Green and red appear only for an outcome (accepted, refused).
- Animate only meaning: a signature travelling along a path, a check appearing, a
  refused key bouncing off. Each runs once when it comes into view, 600 to 1,200 ms,
  behind `prefers-reduced-motion: no-preference`. The still state must read on its own.
- `role="img"` with an `aria-label` that says what the drawing shows. Every word in the
  drawing also appears in the page text.
- On a phone use a simplified vertical drawing, not the desktop one scaled down.

### Marks

All 26 × 26 (`viewBox="0 0 26 26"`), a ring `cx 13 cy 13 r 11`, stroke 2, in the accent:

| Product | Inside the ring |
| --- | --- |
| Peal Tender | three dots (r 2.6) at (13, 7.5), (8.2, 16), (17.8, 16); the first two filled (2 of 3 signers) |
| Peal Sealed Auction | a horizontal bar from (7, 13) to (19, 13), stroke 2, with a filled square seal 6 × 6 centred on it (a sealed bid) |
| Peal Bidder | one filled dot (r 2.6) at (9, 13) and an arrow from (12, 13) to (19, 13) with a 3px head (an agent placing a bid) |

### Landing components

- **Kicker:** 20px × 2px accent rule, 8px gap, kicker text.
- **Button pair:** primary (accent, 44px high on the landing page, 10px radius) and
  secondary (white, hairline); an arrow icon on the primary.
- **Proof bar:** one card, cells divided by hairlines, label above figure.
- **Step rail:** the step number in a 28px accent-weak circle, a title, two lines of
  body; the active step gets an accent left border and a white background.
- **Comparison table:** two columns, a row per property, "✓" and "✕" drawn as icons in
  status colours with a word next to them.
- **Evidence terminal:** on the dark band, monospace 13px, `REFUSED` in red, comments in
  muted slate, the source linked under it.
- **Role card:** a 40px line drawing in the accent, a title, two lines, one link.
- **Family card:** the product mark, its name, one line, a link; "You are here" chip on
  the current one.

### Motion on the landing page

- Hero on load: the headline, lead and buttons fade in and rise 8px, 300 ms, staggered
  60 ms.
- Sections reveal once as they enter the view (an IntersectionObserver), 300 ms.
- The step rail's highlight moves in 200 ms.
- All of it behind `prefers-reduced-motion: no-preference`; without it, everything is
  simply there.

### Before shipping a landing page

- Works at 390px, 768px and 1280px wide with no sideways scroll.
- Every figure is live from the chain or labelled.
- Every claim has its evidence one click away (a transaction, a test, a file).
- Keyboard: every control reachable, visible focus ring, the step rail usable with
  arrow keys or Tab.
- A screenshot at each width looks deliberate: no orphaned single words in titles
  (`text-wrap: balance`), no crowded labels in the illustration.

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
