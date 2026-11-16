# Peal Tender: design identity

Peal Tender's own look. The rules all three Peal products share are in
[`docs/design.md`](../../docs/design.md); everything below belongs to Peal Tender alone.

## Concept

- **The visitor.** A hackathon judge, a treasury signer of a DAO, or a token holder.
  They know what a multisig is. They do not yet believe a post-quantum treasury is
  real, usable and inspectable.
- **The idea in five seconds.** Money leaves this treasury only on an order signed by
  two of its three signers with ML-DSA-87 and checked on chain. An order signed with a
  stolen classical key is refused.
- **The metaphor.** A bank's **payment order** and its **statement of account**:
  - the order carries two authorised signatures, checked against the **signature card
    on file** (the key QoreChain holds for each signer, read by `pqcKeyStatus`);
  - a clerk verifies the signatures (`pqcVerify`) and posts the entry to the ledger;
  - an order with a forged signature is stamped **refused**;
  - the treasury's rules read like the bank **mandate** a company files: signatories,
    limits, holds, stop instructions.

## Look

- **Ground:** cool security paper, `#f1f4f2`, not cream. A fine, generated guilloché
  pattern, the kind printed on cheques, appears only on the instrument itself.
- **Ink:** deep banknote green-black, `#10231d`. **Accent:** treasury green `#1e5b46`,
  used for verification (the seal, a verified signature, the primary button) and
  nothing decorative.
- **Stamp red:** `#a3261a`, only for a refused order.
- No gradients, glows or shadows except the instrument's single paper shadow.

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#f1f4f2` | page |
| `--sheet` | `#fcfdfc` | the instrument, tables |
| `--ink` | `#10231d` | text, strokes |
| `--ink-2` | `#3d4d47` | secondary text |
| `--muted` | `#677770` | labels |
| `--rule` | `#d3dcd7` | ledger lines |
| `--guilloche` | `#b9cfc5` | the security pattern |
| `--accent` | `#1e5b46` (hover `#164536`, weak `#e2ece7`) | verification, primary actions |
| `--stamp` | `#a3261a` on `#f9ebe9` | refused |
| `--amber` | `#9a5b0d` on `#fbf3e4` | held, waiting |

## Type

One engineered family, chosen for an institutional, exact voice:

- **IBM Plex Serif** 300 and 400 (with italic) for display: headlines, the instrument's
  title, clause headings.
- **IBM Plex Sans** 400, 500, 600 for text and interface.
- **IBM Plex Mono** 400, 500 for every number, amount, hash, nonce and code name.
  Amounts are right-aligned on their decimal point with tabular figures.

Scale: display 64/1.05 (phone 40), title 38/1.12 (phone 29), lead 19/1.6, body
16/1.6, label 13, figures 13 to 15 in tables, 28 in the instrument's amount.

## Page order and the question each part answers

| Section | The visitor's question | Form |
| --- | --- | --- |
| Hero | What is this? | The payment order: two signatures, the keys on file, the verification seal; a refused order beneath |
| Why a treasury needs this | What breaks on Q-Day? | Two drawings side by side: a treasury held by one key, and one held by three post-quantum keys |
| How a payment clears | What happens between a proposal and a transfer? | A swimlane drawing in four lanes (signers' machines, any account, QoreChain, the vault), six numbered steps including the scoped EVM window and both precompiles; a numbered list on phones |
| What an attacker can and cannot do | Is it safe? | Rows of three columns joined by arrows: what the attacker holds, what the chain checks, the most it achieves |
| Statement of account | Is it real? | The drill vault's ledger (real transactions, running columns, double-ruled totals) and the nine refused instructions |
| How a buyback clears at one price | How is the price decided? | A chart of the drill vault's tender 1: offered supply per price against what the budget buys, the clearing bar split into filled, pro rata and returned |
| The mandate | What are the rules, today? | Numbered clauses (§ 1 to § 7) with live values in the margin |
| The category's requirements | Does it meet the brief? | A table: requirement, where it lives, its state on the day |
| Sell into a buyback | Can I try it? | Four joined steps |

Grid: 12 columns at 1200px; section heads put the title in 5 columns and the lead in 7.
Every drawing has its own phone version at 1:1 scale rather than a shrunk copy.

## Motion

One moment, on load: the two signatures are written (stroke drawn over 900 ms, 250 ms
apart), then the verification seal settles and the refused stamp lands. Everything else
is still. With `prefers-reduced-motion: reduce` the instrument appears signed and
stamped.

## The app

The app pages use the same tokens: paper ground, Plex type, green for verified and
primary, stamp red for refusals and vetoes, amber for held changes.
