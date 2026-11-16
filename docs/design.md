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
- Peal Tender's mark: a ring with three signer dots, two filled (2 of 3). Each entry
  draws its own simple mark in the accent colour; no logos from other projects.

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

## Trust

- The web pages hold no keys. Reading is free; signing happens in a CLI or a wallet
  the user controls, and the page says so.
- Text from the chain or from files people send is data: set it with `textContent`,
  never as HTML.
