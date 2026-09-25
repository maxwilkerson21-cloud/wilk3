// Builds a legacy-schema-11 Anki .apkg in the browser.
// Port of the med-anki skill's scripts/build_apkg.py: built-in Cloze model, one flat deck,
// LO label + slide image in Extra, no tags.
import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
import JSZip from "jszip";

const CLOZE_MODEL_ID = 1483883011648;

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
    scm integer not null, ver integer not null, dty integer not null, usn integer not null,
    ls integer not null, conf text not null, models text not null, decks text not null,
    dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
    mod integer not null, usn integer not null, tags text not null, flds text not null,
    sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
    ord integer not null, mod integer not null, usn integer not null, type integer not null,
    queue integer not null, due integer not null, ivl integer not null, factor integer not null,
    reps integer not null, lapses integer not null, left integer not null, odue integer not null,
    odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
    ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
    time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);
`;

let sqlPromise;
function getSql(wasmBinary) {
  sqlPromise ??= initSqlJs({ wasmBinary });
  return sqlPromise;
}

function clozeModel(now) {
  return {
    id: CLOZE_MODEL_ID, name: "Cloze", type: 1, mod: now, usn: -1, sortf: 0, did: null,
    tmpls: [{ name: "Cloze", ord: 0, qfmt: "{{cloze:Text}}", afmt: "{{cloze:Text}}<br>\n{{Extra}}",
      bqfmt: "", bafmt: "", did: null, bfont: "", bsize: 0 }],
    flds: [
      { name: "Text", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
      { name: "Extra", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20, media: [] },
    ],
    css: ".card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n.cloze {\n font-weight: bold;\n color: blue;\n}",
    latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
    latexPost: "\\end{document}", latexsvg: false, req: [[0, "any", [0]]], vers: [],
  };
}

function deckObj(did, name, now) {
  return { id: did, mod: now, name, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0],
    timeToday: [0, 0], collapsed: true, browserCollapsed: true, desc: "", dyn: 0, conf: 1,
    extendNew: 0, extendRev: 0 };
}

const DCONF = { 1: { id: 1, name: "Default", mod: 0, usn: 0, maxTaken: 60, autoplay: true, timer: 0,
  replayq: true,
  new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
  rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
  lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  dyn: false, newMix: 0, newPerDayMinimum: 0, interday: 0, newDeadline: 0, reviewsPerDay: 0 } };

const CONF = { nextPos: 1, estTimes: true, activeDecks: [1], sortType: "noteFld", timeLim: 0,
  sortBackwards: false, addToCur: true, curDeck: 1, newBury: true, newSpread: 0, dueCounts: true,
  collapseTime: 1200 };

// Anki's duplicate-check checksum: first 8 hex digits of sha1(stripped first field).
async function fieldChecksum(text) {
  const stripped = text.replace(/<[^>]+>/g, "").trim();
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(stripped));
  const hex = [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return parseInt(hex, 16);
}

/**
 * @param {object} opts
 * @param {string} opts.deckName  e.g. "MWMSK::Anatomy::Back::Back_Muscles"
 * @param {{slide:number, lo:string, text:string, extra:string}[]} opts.cards  in slide order
 * @param {(page:number) => Promise<Blob|null>} opts.slideImage  JPEG for a page, or null
 * @param {Uint8Array} opts.wasmBinary  sql.js wasm bytes
 * @returns {Promise<Blob>}
 */
export async function buildApkg({ deckName, cards, slideImage, wasmBinary }) {
  const SQL = await getSql(wasmBinary);
  const db = new SQL.Database();
  db.run(SCHEMA);

  const now = Math.floor(Date.now() / 1000);
  let idCounter = Date.now();
  const nextId = () => ++idCounter;

  const rootId = nextId();
  const decks = { 1: deckObj(1, "Default", now), [rootId]: deckObj(rootId, deckName, now) };
  db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
    1, now, Date.now(), Date.now(), 11, 0, 0, 0, JSON.stringify(CONF),
    JSON.stringify({ [CLOZE_MODEL_ID]: clozeModel(now) }), JSON.stringify(decks),
    JSON.stringify(DCONF), "{}",
  ]);

  const zip = new JSZip();
  const mediaMap = {};
  const pageFile = new Map(); // page -> filename, so a slide shared by several cards is stored once
  const prefix = deckName.split("::").pop().replace(/[^A-Za-z0-9_-]/g, "_");

  async function mediaFor(page) {
    if (pageFile.has(page)) return pageFile.get(page);
    const blob = await slideImage(page);
    if (!blob) return null;
    const idx = String(Object.keys(mediaMap).length);
    // Deck-prefixed so slides from different lectures don't overwrite each other in collection.media.
    const fname = `${prefix}_slide_${String(page).padStart(2, "0")}.jpg`;
    mediaMap[idx] = fname;
    zip.file(idx, blob);
    pageFile.set(page, fname);
    return fname;
  }

  let due = 0;
  for (const c of cards) {
    let extra = c.extra || "";
    if (c.lo && !extra.trimStart().startsWith("LO ")) {
      const label = c.lo.endsWith(".") ? c.lo : `${c.lo}.`;
      extra = extra ? `${label}<br>${extra}` : label;
    }
    if (c.slide) {
      const fname = await mediaFor(c.slide);
      if (fname) extra += `${extra ? "<br>" : ""}<img src="${fname}">`;
    }
    const nid = nextId();
    db.run("INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)", [
      nid, `gd${nid}`, CLOZE_MODEL_ID, now, -1, "", `${c.text}\x1f${extra}`, c.text,
      await fieldChecksum(c.text), 0, "",
    ]);
    due += 1;
    db.run("INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [
      nextId(), nid, rootId, 0, now, -1, 0, 0, due, 0, 0, 0, 0, 0, 0, 0, 0, "",
    ]);
  }

  zip.file("collection.anki2", db.export());
  zip.file("media", JSON.stringify(mediaMap));
  db.close();
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
