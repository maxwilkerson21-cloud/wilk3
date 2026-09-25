# Med Anki Builder

Turns a med-school lecture (slides PDF + learning objectives, optionally a transcript) into an
Anki cloze deck (`.apkg`) that follows the med-anki rules: flat `MWMSK::…` deck in slide order,
single-`c1` clozes with question-style hints, LO label + slide screenshot in Extra, spelled-out
abbreviations, cross-links, and board-style application cards.

It makes **one Claude API call per lecture** with your own API key. You don't need a Claude chat
session for it.

## Use it

1. Download [`dist/med-anki-builder.html`](dist/med-anki-builder.html) and double-click it. It's
   one self-contained file with no install and no server.
2. Get an API key at [console.anthropic.com](https://console.anthropic.com) → API keys, and add
   a few dollars of credit under Billing. API credit is billed separately from a claude.ai plan.
3. Paste the key, pick the slides PDF, paste the LOs, then press **Estimate cost (free)** and
   **Build deck**.
4. Review the flagged cards, press **Download .apkg**, and in Anki use File → Import.

Your key and PDFs go only from your browser to `api.anthropic.com`. If you tick "Remember",
the key is saved in that browser's local storage.

## What it costs

You see the real cost after every build, and **Estimate cost** counts the input tokens for free
before you spend anything. As a rough guide, a 50-slide lecture costs about $0.50–$1.50 on
Opus 5, about 60% less on Sonnet 5, and less again on Haiku 4.5 (Haiku is limited to 100 pages).
Lower effort also costs less.

## What it checks for free

After each build the app checks every card locally, with no extra API cost:
- every blank is `c1` and has a hint;
- no hint gives the answer away;
- every card has an LO label and a slide number that exists in the PDF;
- no all-caps abbreviation is left unexpanded.

The LO table also highlights any objective with fewer than 3 cards.

## Develop

```bash
npm install
npm run build   # writes dist/med-anki-builder.html
```

- `src/prompt.js`: system prompt (condensed from the med-anki skill) and the JSON output schema
- `src/app.js`: UI, PDF handling, and the API call (Anthropic TypeScript SDK, streaming, structured output)
- `src/apkg.js`: `.apkg` writer, a port of the skill's `build_apkg.py` (sql.js + JSZip)
- `src/lint.js`: the local rule checks
