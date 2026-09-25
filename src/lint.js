// Free, local checks for the med-anki card rules. They catch what can be checked mechanically;
// judgment calls (accuracy, emphasis, link quality) still need a human read.

// Ions, units and common short forms that need no expansion.
const ALLOWED = new Set(["ATP", "ADP", "AMP", "DNA", "RNA", "mRNA", "mV", "LO", "OK", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "USMLE", "COMLEX"]);

export function lintCards(cards, numPages) {
  const problems = [];
  cards.forEach((c, index) => {
    const add = (message) => problems.push({ index, message });
    const blanks = [...c.text.matchAll(/\{\{c(\d+)::(.*?)\}\}/g)];
    if (!blanks.length) add("has no cloze blank.");
    for (const [, n, body] of blanks) {
      if (n !== "1") add(`uses c${n}; every blank should be c1.`);
      const [answer, hint] = body.split("::");
      if (hint === undefined || !hint.trim()) add(`blank "${strip(answer)}" has no hint.`);
      else if (strip(answer).toLowerCase() && strip(hint).toLowerCase().includes(strip(answer).toLowerCase())) add(`hint gives away the answer "${strip(answer)}".`);
    }
    if (!c.lo?.trim()) add("has no LO label.");
    if (!(c.slide >= 1 && c.slide <= numPages)) add(`slide ${c.slide} is outside the PDF.`);

    // Abbreviations: an ALL-CAPS token must be defined as "full term (ABBR)" somewhere on the card.
    const whole = strip(`${c.text} ${c.extra}`);
    const defined = new Set([...whole.matchAll(/\(([A-Z][A-Za-z0-9]{1,6})\)/g)].map((m) => m[1]));
    const seen = new Set();
    for (const [tok] of whole.matchAll(/\b[A-Z][A-Z0-9]{1,5}s?\b/g)) {
      const t = tok.replace(/s$/, "");
      if (seen.has(t) || ALLOWED.has(t) || defined.has(t) || /^\d/.test(t)) continue;
      seen.add(t);
      add(`abbreviation "${t}" isn't spelled out on this card.`);
    }
  });
  return problems;
}

function strip(s) {
  return String(s ?? "").replace(/<[^>]+>/g, "").replace(/\{\{c\d+::|\}\}/g, "").trim();
}
