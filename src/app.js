import Anthropic from "@anthropic-ai/sdk";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.min.mjs";
import { SYSTEM_PROMPT, OUTPUT_SCHEMA, buildUserText } from "./prompt.js";
import { buildApkg } from "./apkg.js";
import { lintCards } from "./lint.js";

// $ per million tokens (input, output). Cache writes bill at 1.25x input, cache reads at 0.1x.
const PRICES = {
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25], // Opus 5's refusal fallback target
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};
const PAGE_LIMIT = { "claude-haiku-4-5": 100 }; // 200K-context model; others take 600
const MAX_PDF_BYTES = 24 * 1024 * 1024; // base64 inflates ~33%; request cap is 32 MB
const DECKS_KEY = "medanki.decks";
const SETTINGS_KEY = "medanki.settings";

const $ = (id) => document.getElementById(id);
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
};

// ---- one-time setup: pdf.js worker and sql.js wasm are inlined as base64 by build.mjs ----
function b64ToBytes(b64) {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const workerCode = b64ToBytes($("pdf-worker").textContent);
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }));
const wasmBinary = b64ToBytes($("sql-wasm").textContent);

// ---- state ----
let pdfDoc = null;
let pdfBytes = null;
let transcriptPdf = null; // base64 when the transcript is a PDF
let lastResult = null;
let running = null;

// ---- settings ----
function loadSettings() {
  const s = store.get(SETTINGS_KEY, {});
  if (s.apiKey) { $("api-key").value = s.apiKey; $("remember-key").checked = true; }
  if (s.model) $("model").value = s.model;
  if (s.effort) $("effort").value = s.effort;
  if (s.deckPrefix) $("deck-name").value = s.deckPrefix;
  syncEffort();
}
function saveSettings() {
  const deck = $("deck-name").value;
  store.set(SETTINGS_KEY, {
    apiKey: $("remember-key").checked ? $("api-key").value.trim() : "",
    model: $("model").value,
    effort: $("effort").value,
    deckPrefix: deck.includes("::") ? deck.slice(0, deck.lastIndexOf("::") + 2) : "MWMSK::",
  });
}
function syncEffort() {
  // Haiku 4.5 rejects the effort parameter.
  const haiku = $("model").value === "claude-haiku-4-5";
  $("effort").disabled = haiku;
  $("effort-note").hidden = !haiku;
}

// ---- earlier decks (for cross-lecture links) ----
function renderEarlierDecks() {
  const decks = store.get(DECKS_KEY, []);
  const box = $("earlier-decks");
  box.innerHTML = "";
  if (!decks.length) {
    box.innerHTML = '<p class="muted">Decks you build are saved here so later lectures in the same week can link back to them.</p>';
    return;
  }
  decks.forEach((d, i) => {
    const row = document.createElement("label");
    row.className = "check-row";
    row.innerHTML = `<input type="checkbox" data-idx="${i}"> <span>${escapeHtml(d.deckName)}
      <span class="muted">· ${d.cards.length} cards · ${new Date(d.savedAt).toLocaleDateString()}</span></span>
      <button type="button" class="link-btn" data-del="${i}" aria-label="Remove">remove</button>`;
    box.appendChild(row);
  });
}
function selectedEarlierDecks() {
  const decks = store.get(DECKS_KEY, []);
  return [...$("earlier-decks").querySelectorAll("input:checked")].map((el) => decks[+el.dataset.idx]).filter(Boolean);
}
function saveDeckForLinking(deckName, cards) {
  const decks = store.get(DECKS_KEY, []).filter((d) => d.deckName !== deckName);
  decks.unshift({ deckName, savedAt: Date.now(), cards: cards.map((c) => ({ lo: c.lo, text: c.text })) });
  store.set(DECKS_KEY, decks.slice(0, 12));
  renderEarlierDecks();
}

// ---- files ----
async function onSlides(file) {
  $("slides-info").textContent = "Reading PDF…";
  pdfBytes = new Uint8Array(await file.arrayBuffer());
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  let info = `${pdfDoc.numPages} pages · ${(file.size / 1048576).toFixed(1)} MB`;
  if (file.size > MAX_PDF_BYTES) info += " · too large (max ~24 MB): compress it or split the lecture";
  $("slides-info").textContent = info;
  const deck = $("deck-name");
  if (deck.value.endsWith("::")) {
    deck.value += file.name.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }
}

async function onTranscript(file) {
  transcriptPdf = null;
  if (/\.pdf$/i.test(file.name)) {
    transcriptPdf = bytesToB64(new Uint8Array(await file.arrayBuffer()));
    $("transcript").value = "";
    $("transcript").placeholder = `Using ${file.name} (PDF)`;
  } else {
    $("transcript").value = await file.text();
  }
}

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function slideImage(page) {
  if (!pdfDoc || page < 1 || page > pdfDoc.numPages) return null;
  const p = await pdfDoc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: Math.min(2, 1000 / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, canvas, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

// ---- request ----
function requestParams() {
  const model = $("model").value;
  const content = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToB64(pdfBytes) }, title: "Lecture slides" },
  ];
  if (transcriptPdf) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: transcriptPdf }, title: "Transcript" });
  }
  content.push({
    type: "text",
    text: buildUserText({
      deckName: $("deck-name").value.trim(),
      objectives: $("objectives").value,
      transcript: $("transcript").value,
      notes: $("notes").value,
      earlierDecks: selectedEarlierDecks(),
    }),
  });
  return {
    model,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  };
}

function validateInputs() {
  if (!$("api-key").value.trim()) return "Paste your Anthropic API key first.";
  if (!pdfDoc) return "Choose the lecture slides PDF.";
  if (pdfBytes.length > MAX_PDF_BYTES) return "The PDF is over ~24 MB. Compress it or split the lecture.";
  const limit = PAGE_LIMIT[$("model").value] ?? 600;
  if (pdfDoc.numPages > limit) return `This model takes at most ${limit} pages; the PDF has ${pdfDoc.numPages}.`;
  if (!$("deck-name").value.trim() || $("deck-name").value.trim().endsWith("::")) return "Give the deck a name, e.g. MWMSK::Anatomy::Back::Back_Muscles.";
  return null;
}

function client() {
  return new Anthropic({ apiKey: $("api-key").value.trim(), dangerouslyAllowBrowser: true });
}

function usd(n) {
  return n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

async function estimate() {
  const err = validateInputs();
  if (err) return setStatus(err, "error");
  saveSettings();
  setStatus("Counting tokens (free)…");
  try {
    const params = requestParams();
    const { input_tokens } = await client().messages.countTokens(params);
    const [pin, pout] = PRICES[params.model];
    // Output is a guess: ~70 cards of JSON plus thinking. Varies with lecture length and effort.
    const low = (input_tokens * pin + 12000 * pout) / 1e6;
    const high = (input_tokens * pin + 40000 * pout) / 1e6;
    setStatus(`Input is ${input_tokens.toLocaleString()} tokens. Estimated cost for this lecture: about ${usd(low)}–${usd(high)}.`, "ok");
  } catch (e) {
    setStatus(explainError(e), "error");
  }
}

async function build() {
  const err = validateInputs();
  if (err) return setStatus(err, "error");
  saveSettings();
  const params = requestParams();
  const model = params.model;
  Object.assign(params, { max_tokens: 64000, output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } } });
  if (model !== "claude-haiku-4-5") params.output_config.effort = $("effort").value;
  if (model === "claude-opus-5") {
    // If a safety classifier declines, the API re-runs the request on a fallback model instead of failing.
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  setBusy(true);
  $("results").hidden = true;
  setStatus("Sending the lecture to Claude…");
  let chars = 0;
  try {
    running = client().beta.messages.stream(params);
    running.on("streamEvent", (ev) => {
      if (ev.type === "content_block_start" && ev.content_block.type === "thinking") setStatus("Claude is reading the slides and planning the deck…");
    });
    running.on("text", (delta) => {
      chars += delta.length;
      setStatus(`Writing cards… (${Math.round(chars / 1000)}k characters so far)`);
    });
    const msg = await running.finalMessage();
    const cost = costOf(msg);
    if (msg.stop_reason === "refusal") throw new Error("Claude declined this request. Try again, or remove content that might be flagged.");
    if (msg.stop_reason === "max_tokens") throw new Error(`The output got cut off before the deck was finished (spent ${usd(cost)}). Split the lecture into two PDFs, or lower the effort.`);
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const data = JSON.parse(text);
    data.cards.sort((a, b) => a.slide - b.slide); // stable: keeps Claude's order within a slide
    lastResult = { ...data, deckName: $("deck-name").value.trim(), model: msg.model, cost, usage: msg.usage };
    saveDeckForLinking(lastResult.deckName, data.cards);
    renderResults();
    setStatus(`Done. ${data.cards.length} cards for ${usd(cost)}.`, "ok");
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) setStatus("Stopped.");
    else setStatus(explainError(e), "error");
  } finally {
    running = null;
    setBusy(false);
  }
}

function costOf(msg) {
  const [pin, pout] = PRICES[msg.model] ?? PRICES[$("model").value];
  const u = msg.usage;
  const input = (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0);
  return (input * pin + (u.output_tokens ?? 0) * pout) / 1e6;
}

function explainError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it at console.anthropic.com → API keys.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a minute and try again.";
  if (e instanceof Anthropic.BadRequestError) {
    const m = e.error?.error?.message ?? e.message;
    if (/credit balance/i.test(m)) return "Your API account is out of credit. Add some at console.anthropic.com → Billing.";
    return `The API rejected the request: ${m}`;
  }
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `API error (${e.status ?? "?"}): ${e.message}`;
  if (e instanceof SyntaxError) return "Claude's reply wasn't valid JSON. Try again.";
  return e.message || String(e);
}

// ---- results ----
function renderResults() {
  const r = lastResult;
  $("results").hidden = false;
  const u = r.usage;
  $("summary").innerHTML = `
    <div class="stat"><b>${r.cards.length}</b><span>cards</span></div>
    <div class="stat"><b>${r.cards.filter((c) => c.kind === "application").length}</b><span>board-style</span></div>
    <div class="stat"><b>${r.cards.filter((c) => c.kind === "synthesis").length}</b><span>synthesis</span></div>
    <div class="stat"><b>${usd(r.cost)}</b><span>${(u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)).toLocaleString()} in · ${u.output_tokens.toLocaleString()} out</span></div>`;

  const counts = {};
  for (const c of r.cards) counts[c.lo] = (counts[c.lo] ?? 0) + 1;
  $("lo-table").innerHTML = `<tr><th>LO</th><th>Objective</th><th>Cards</th></tr>` + r.lo_coverage
    .map((l) => {
      const n = counts[l.lo] ?? 0;
      return `<tr class="${n < 3 ? "warn" : ""}"><td>${escapeHtml(l.lo)}</td><td>${escapeHtml(l.objective)}</td><td>${n}</td></tr>`;
    })
    .join("");

  fillList("cross-links", r.cross_links);
  fillList("io-slides", r.image_occlusion_slides.map((s) => `Slide ${s.slide}: ${s.reason}`));
  fillList("left-out", r.left_out);
  $("model-notes").textContent = r.notes || "";
  $("model-notes").hidden = !r.notes;

  const problems = lintCards(r.cards, pdfDoc?.numPages ?? Infinity);
  $("lint").innerHTML = problems.length
    ? `<p><b>${problems.length} thing${problems.length === 1 ? "" : "s"} to check</b> (flagged by the app's rule checks):</p><ul>${problems.map((p) => `<li>Card ${p.index + 1}: ${escapeHtml(p.message)}</li>`).join("")}</ul>`
    : "<p>All cards pass the rule checks (c1 only, every blank hinted, LO label, slide in range).</p>";
  $("lint").className = problems.length ? "callout warn" : "callout ok";

  const flagged = new Set(problems.map((p) => p.index));
  $("cards").innerHTML = r.cards
    .map((c, i) => `
      <li class="card ${flagged.has(i) ? "flagged" : ""}">
        <div class="card-meta">#${i + 1} · slide ${c.slide} · ${escapeHtml(c.lo)}${c.kind !== "fact" ? ` · <span class="tag">${c.kind}</span>` : ""}</div>
        <div class="card-text">${renderCloze(c.text)}</div>
        <div class="card-extra">${sanitize(c.extra)}</div>
      </li>`)
    .join("");
}

function fillList(id, items) {
  const el = $(id);
  el.innerHTML = items.length ? items.map((t) => `<li>${escapeHtml(t)}</li>`).join("") : '<li class="muted">None</li>';
}

// Shows the answer highlighted with its hint, the way the back of the card looks.
function renderCloze(text) {
  return sanitize(text).replace(/\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g, (_, n, ans, hint) =>
    `<span class="cloze">${ans}</span>${hint ? `<span class="hint">[${hint}]</span>` : '<span class="hint missing">[no hint]</span>'}`);
}

// Card HTML comes from the model; allow only simple formatting tags in the preview.
function sanitize(html) {
  return escapeHtml(html).replace(/&lt;(\/?)(b|i|u|em|strong|br|sub|sup)\s*\/?&gt;/gi, "<$1$2>");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

async function downloadApkg() {
  if (!lastResult) return;
  $("dl-apkg").disabled = true;
  setStatus("Rendering slide images and packing the deck…");
  try {
    const blob = await buildApkg({ deckName: lastResult.deckName, cards: lastResult.cards, slideImage, wasmBinary });
    saveBlob(blob, `${lastResult.deckName.split("::").pop()}.apkg`);
    setStatus("Deck downloaded. In Anki: File → Import.", "ok");
  } catch (e) {
    setStatus(`Couldn't build the .apkg: ${e.message}`, "error");
  } finally {
    $("dl-apkg").disabled = false;
  }
}

function downloadJson() {
  if (!lastResult) return;
  const { usage, ...rest } = lastResult;
  saveBlob(new Blob([JSON.stringify(rest, null, 2)], { type: "application/json" }), `${lastResult.deckName.split("::").pop()}.json`);
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---- ui helpers ----
function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
}
function setBusy(busy) {
  $("build").disabled = busy;
  $("estimate").disabled = busy;
  $("stop").hidden = !busy;
}

// ---- wire up ----
loadSettings();
renderEarlierDecks();
$("model").addEventListener("change", () => { syncEffort(); saveSettings(); });
$("effort").addEventListener("change", saveSettings);
$("remember-key").addEventListener("change", saveSettings);
$("slides").addEventListener("change", (e) => e.target.files[0] && onSlides(e.target.files[0]).catch((err) => setStatus(`Couldn't read that PDF: ${err.message}`, "error")));
$("transcript-file").addEventListener("change", (e) => e.target.files[0] && onTranscript(e.target.files[0]));
$("estimate").addEventListener("click", estimate);
$("build").addEventListener("click", build);
$("stop").addEventListener("click", () => running?.abort());
$("dl-apkg").addEventListener("click", downloadApkg);
$("dl-json").addEventListener("click", downloadJson);
$("earlier-decks").addEventListener("click", (e) => {
  const idx = e.target.dataset?.del;
  if (idx === undefined) return;
  const decks = store.get(DECKS_KEY, []);
  decks.splice(+idx, 1);
  store.set(DECKS_KEY, decks);
  renderEarlierDecks();
});
