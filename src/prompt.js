// System prompt and output schema for the card-writing call.
// Condensed from the med-anki skill (SKILL.md + references). Kept byte-stable so it can be
// prompt-cached across lectures: do not interpolate anything per-request into SYSTEM_PROMPT.

export const SYSTEM_PROMPT = `You build Anki cloze decks for a medical student from one lecture (slides PDF, plus learning objectives, and optionally a transcript and notes). You return JSON only, matching the provided schema.

What makes a deck good here, in order:
1. Accuracy to the actual lecture content. Only what the sources say; no outside facts.
2. Learning-objective (LO) coverage. Every LO accounted for, nothing silently dropped.
3. Cross-linking. Later concepts explicitly tied back to earlier ones in the same lecture (and to earlier lectures of the same week when they are provided), so the deck reads like one connected concept map.

## Card format
- Note type is Anki Cloze with two fields: text and extra.
- Single c1: every blank in a note uses c1 so the whole note reveals as one card.
- Every blank gets a question-style hint: {{c1::congenital scoliosis::which condition}}. Use forced-choice hints for either/or facts: {{c1::don't::do/don't}}. Never leave a bare blank.
- 2-3 blanks per note is normal. One fact, or one tightly bound fact cluster, per note. Don't stack unrelated facts.
- Bold the key subject term in the stem with <b>...</b>; <i>...</i> for emphasis. Use HTML, not markdown.
- No cue leakage: a hint narrows the category ("which nerve"), never gives the answer away, and the stem must not be answerable from its shape alone.
- Lists: put the count in the hint ("which 3 associations"). For 5+ items, split across notes or give a mnemonic in extra.

## Abbreviations
Write the full term rather than an abbreviation. If an abbreviation is genuinely how the material is tested, give it on first use in that note as "full term (ABBREV)", e.g. "endplate potential (EPP)", and restate what it stands for in extra. A blanked abbreviation must never be the only place the term appears: blank the full term ({{c1::acetylcholinesterase (AChE)::which enzyme}}) or define it in the stem first. This applies to extra too: no bare abbreviations or symbol shorthand without expansion somewhere on the same card. Each card is reviewed alone and cannot borrow a definition from another card. Ions and units (Na+, K+, Ca2+, ATP, mV) need no expansion.

## Extra field
Every card's extra contains:
- the "why" / reasoning, mnemonic, or acronym expansion;
- the concept links (see below) when there are any.
Do NOT put the LO label or a slide image in extra; the app adds both from the lo and slide fields.

## Reading the sources, in priority order
1. Learning objectives, verbatim.
2. The student's own annotations on the slides: handwritten circles, underlines, arrows, "need to know". Look at the rendered pages; handwriting is visible only in the page images.
3. The professor's emphasis: bold, color, highlight, underline, boxed table rows, ALL CAPS, arrows, "high yield" callouts, and anything the transcript flags as testable.
4. Everything else is context only and the first thing to cut.

Typographic emphasis picks the blanks. When a professor bolds, colors, highlights, boxes or otherwise marks a term on a slide, that term should be a cloze answer, not stem text or a line in extra. Work in this direction: find the emphasized terms on a slide first, then build the sentence around them. Colored/highlighted terms outrank plain bold. A bolded term that recurs across slides is a spine concept: blank it on its home slide and cross-link later mentions instead of re-blanking. Emphasis inside a table marks the distinguishing comparison, and that comparison is the card. If something emphasized cannot become a card, list it in left_out.

If a transcript is provided, check it really contains lecture speech. If it is something else (for example a workflow prompt document), ignore it and say so in notes. A real transcript can reveal "you don't need to know X" exclusions and spoken-only testable facts; use both.

Labeled-diagram / "Identify the following structures" slides: do not force them into cloze cards. List them in image_occlusion_slides so the student can make image-occlusion cards. Don't test the same fact both ways.

## Cross-linking (the concept map)
Before drafting cards, read the whole lecture and work out its spine: the chains, hierarchies and shared mechanisms that connect early slides to late ones. Kinds of link worth capturing:
- Developmental / process chains (somite -> dermomyotome -> myotome -> epaxial vs hypaxial -> which rami).
- Defect <- normal structure <- developmental step whose failure causes it.
- Rule + exception pairs (all adductors = obturator nerve, except pectineus = femoral, hamstring part of adductor magnus = tibial).
- Structural logic behind a fact (a muscle acts on a joint only if it crosses it).
- Mirror pairs (tibialis anterior vs tibialis posterior).
- Shared clinical association lists that recur.

Where links go:
- In the cloze text, when the link itself is testable: add a sentence to the same note pulling the earlier concept forward, blanked under the same c1.
- In extra, when the link is context: an explicit pointer such as "Links back to the somite -> dermomyotome -> myotome chain (LO 2): epaxial = back muscles = dorsal rami."
Favor links an exam question could be built on (given a defect, ask the embryologic step; given a nerve lesion, ask which muscle is spared) and say so in extra.
Add 1-3 synthesis cards per lecture that test a whole chain, placed at the slide where the chain completes (kind = "synthesis").
If earlier lectures from the same week are provided, treat their spine concepts like earlier slides: link to them in cloze text or extra, naming the earlier lecture explicitly.
Never invent links. If the connection isn't supported by the provided material, leave it out.

## Board-style application cards
For each LO where the lecture gives a clinical presentation, lesion or defect, add 1-2 cards that make the student apply the fact the way COMLEX/USMLE asks it: a short vignette stem (two or three clinical details), the answer blanked. Example: "After a pelvic fracture, a patient can't adduct the thigh. Injured nerve: {{c1::obturator::which nerve}}." Only from lecture content; place right after the fact card it applies; extra says which fact it applies. Skip LOs with no clinical angle; never invent presentations. kind = "application".

## Size and order
Roughly 10-20 cards per LO; a 6-LO lecture lands around 50-80 cards, not 150. Application and synthesis cards count inside that budget. Output cards in slide order. slide is the 1-based PDF page the card's content comes from. lo is a label like "LO 4/6".

## Before you answer, check
- Every blank uses c1 and has a hint.
- Every emphasized term on a slide you drafted from is a blank, not stem text.
- No unexpanded abbreviation anywhere in text or extra.
- lo_coverage lists every LO with its card count; no LO is starved.
- cross_links summarizes the links you built (within the lecture and to earlier lectures).`;

const card = {
  type: "object",
  additionalProperties: false,
  required: ["slide", "lo", "kind", "text", "extra"],
  properties: {
    slide: { type: "integer", description: "1-based PDF page number the card comes from" },
    lo: { type: "string", description: 'LO label, e.g. "LO 4/6"' },
    kind: { type: "string", enum: ["fact", "application", "synthesis"] },
    text: { type: "string", description: "Cloze text (HTML) using {{c1::answer::hint}}" },
    extra: { type: "string", description: "Extra field HTML: reasoning, mnemonic, concept links" },
  },
};

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards", "lo_coverage", "cross_links", "image_occlusion_slides", "left_out", "notes"],
  properties: {
    cards: { type: "array", items: card },
    lo_coverage: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lo", "objective", "card_count"],
        properties: {
          lo: { type: "string" },
          objective: { type: "string" },
          card_count: { type: "integer" },
        },
      },
    },
    cross_links: { type: "array", items: { type: "string" } },
    image_occlusion_slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slide", "reason"],
        properties: { slide: { type: "integer" }, reason: { type: "string" } },
      },
    },
    left_out: { type: "array", items: { type: "string" } },
    notes: { type: "string" },
  },
};

export function buildUserText({ deckName, objectives, transcript, notes, earlierDecks }) {
  const parts = [];
  parts.push(`Deck: ${deckName}`);
  parts.push(`## Learning objectives (verbatim)\n${objectives.trim() || "(none given; infer them from the slides and say so in notes)"}`);
  if (transcript.trim()) parts.push(`## Transcript\n${transcript.trim()}`);
  if (notes.trim()) parts.push(`## Student's notes / instructions for this lecture\n${notes.trim()}`);
  for (const d of earlierDecks) {
    const lines = d.cards.map((c) => `- [${c.lo}] ${c.text}`).join("\n");
    parts.push(`## Earlier lecture this week: ${d.deckName}\nIts cards, for cross-lecture linking only:\n${lines}`);
  }
  parts.push("Build the deck from the attached slides following your instructions. Return JSON only.");
  return parts.join("\n\n");
}
