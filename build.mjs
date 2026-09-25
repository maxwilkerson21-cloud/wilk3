// Builds dist/med-anki-builder.html: one self-contained file (app + Anthropic SDK + pdf.js +
// Uses the pdf.js "legacy" build: the modern one needs JS features Safari and older Chrome lack.
// sql.js + JSZip inlined) that opens straight from disk with no server or install.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const result = await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false,
  logLevel: "warning",
});
const bundle = result.outputFiles[0].text;
if (bundle.includes("</script")) throw new Error("bundle contains </script and can't be inlined");

const b64 = async (path) => (await readFile(path)).toString("base64");
const html = (await readFile("src/index.html", "utf8"))
  .replace("<!--PDF_WORKER-->", await b64("node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"))
  .replace("<!--SQL_WASM-->", await b64("node_modules/sql.js/dist/sql-wasm-browser.wasm"))
  .replace("<!--APP_BUNDLE-->", () => bundle);

await mkdir("dist", { recursive: true });
await writeFile("dist/med-anki-builder.html", html);
console.log(`dist/med-anki-builder.html  ${(html.length / 1048576).toFixed(1)} MB`);
