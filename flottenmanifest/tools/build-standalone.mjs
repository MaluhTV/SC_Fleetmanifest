#!/usr/bin/env node
/**
 * Builds a single self-contained HTML file that works without a web server
 * (double-click / file://), e.g. for end users who just want to open the page.
 *
 *   node tools/build-standalone.mjs        → dist/flottenmanifest.html
 *
 * What it does:
 *   - inlines css/flottenmanifest.css
 *   - embeds data/*.json as globalThis.FM_DATA (read by loadJson() in js/shipdb.js)
 *   - ship images:  default        embeds local images/ships/* as data: URIs (offline); missing files use the RSI link
 *                   --remote-images links every image to RSI (data/image-urls.json), embeds none – for public releases
 *                   --no-images    no images at all
 *   - bundles js/main.js and all modules it imports into one inline <script type="module">
 *
 * The bundler is deliberately tiny and only understands the import/export forms used in this project:
 *   import { a, b } from "./x.js";
 *   export function / export async function / export const / export let / export class
 * Requires only Node.js (18 or newer), no packages. Re-run it after every change.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "dist");
const OUT_FILE = join(OUT_DIR, "flottenmanifest.html");
const DATA_FILES = ["ships.json", "loops.json", "example-fleet.json", "included.json"];
const URLS_FILE = join(ROOT, "data", "image-urls.json");

const read = (p) => readFileSync(p, "utf8");
const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?\s*$/gm;
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

/* ---------- Bundle the JS modules ---------- */

const modules = new Map(); // absolute path -> { id, code }
function addModule(file) {
  if (modules.has(file)) return;
  modules.set(file, null); // mark as in progress (cycles are not supported and not used)
  let src = read(file);
  const imports = [];
  src = src.replace(IMPORT_RE, (_, names, spec) => {
    const dep = resolve(dirname(file), spec);
    addModule(dep);
    imports.push(`const {${names}} = __fm[${JSON.stringify(id(dep))}];`);
    return "";
  });
  if (/^\s*import\s/m.test(src)) throw new Error(`${id(file)}: unsupported import form`);
  const exportsList = [...src.matchAll(EXPORT_RE)].map((m) => m[1]);
  src = src.replace(/^export\s+/gm, "");
  if (/^\s*export\b/m.test(src)) throw new Error(`${id(file)}: unsupported export form`);
  const code = `__fm[${JSON.stringify(id(file))}] = (() => {\n${imports.join("\n")}\n${src}\nreturn { ${exportsList.join(", ")} };\n})();`;
  modules.delete(file);
  modules.set(file, { code }); // insertion order = dependencies first
}
const id = (file) => relative(ROOT, file).replace(/\\/g, "/");

addModule(join(ROOT, "js", "main.js"));
const bundle = "const __fm = {};\n" + [...modules.values()].map((m) => m.code).join("\n\n");

/* ---------- Assemble the page ---------- */

const safe = (text) => text.replace(/<\/(script|style)/gi, "<\\/$1"); // never close the tag early
const data = Object.fromEntries(DATA_FILES.map((f) => [f, JSON.parse(read(join(ROOT, "data", f)))]));

// Ship images, see the header comment for the three modes.
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const noImages = process.argv.includes("--no-images");
const remoteImages = process.argv.includes("--remote-images");
const remoteUrls = existsSync(URLS_FILE) ? JSON.parse(read(URLS_FILE)).urls || {} : {};
if (remoteImages && !Object.keys(remoteUrls).length) throw new Error("--remote-images needs data/image-urls.json – run: node tools/fetch-ship-images.mjs --urls-only");
let embedded = 0, linked = 0;
for (const s of data["ships.json"].ships) {
  const remote = remoteUrls[s.name] || (/^https:/.test(s.image || "") ? s.image : null);
  const path = s.image && !/^(https?:|data:)/.test(s.image) ? join(ROOT, s.image) : null;
  if (noImages) s.image = null;
  else if (!remoteImages && path && existsSync(path)) {
    s.image = `data:${MIME[s.image.split(".").pop().toLowerCase()] || "image/jpeg"};base64,${readFileSync(path).toString("base64")}`;
    embedded++;
  } else if (remote) { s.image = remote; linked++; }
  else s.image = null;
}
data["image-urls.json"] = { urls: {} }; // already applied above; keeps loadShipDb() from fetching it

let html = read(join(ROOT, "index.html"));
// fonts referenced as url(../fonts/x.woff2) are embedded as data: URIs, so the file loads nothing from outside
const css = read(join(ROOT, "css", "flottenmanifest.css")).replace(/url\(\.\.\/fonts\/([\w.-]+\.woff2)\)/g,
  (_, f) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, "fonts", f)).toString("base64")})`);
html = html.replace(/<link rel="stylesheet" href="css\/flottenmanifest\.css">/, () => `<style>\n${safe(css)}\n</style>`);
html = html.replace(/<script type="module" src="js\/main\.js"><\/script>/, () =>
  `<script>globalThis.FM_DATA = ${safe(JSON.stringify(data))};</script>\n<script type="module">\n${safe(bundle)}\n</script>`);
html = html.replace(/<script src="js\/file-hint\.js"><\/script>\s*/, ""); // hint is not needed in the standalone file

// Line endings: Git on Windows checks files out with CRLF. Browsers turn CRLF into LF before they hash an inline
// script or style, so hashes over CRLF text would never match and the page would stay empty – use LF throughout.
html = html.replace(/\r\n?/g, "\n");

// Content Security Policy for the single file: only its own inline script/style blocks may run (sha256 hashes),
// images only embedded (data:) or from the RSI media server, nothing else is loaded or sent anywhere.
const hash = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
const scriptHashes = [...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map((m) => hash(m[1]));
const styleHashes = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => hash(m[1]));
const csp = [
  "default-src 'none'", `script-src ${scriptHashes.join(" ")}`, `style-src ${styleHashes.join(" ")}`,
  "img-src data: https://media.robertsspaceindustries.com", "font-src data:", "connect-src 'none'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");
const cspTag = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
if (!cspTag.test(html)) throw new Error("index.html has no Content-Security-Policy meta tag");
html = html.replace(cspTag, () => `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
html = html.replace("<!doctype html>", `<!doctype html>\n<!-- Generated by tools/build-standalone.mjs – do not edit, edit the source files instead. -->`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html);
console.log(`${relative(ROOT, OUT_FILE)} written (${modules.size} modules, ${embedded} images embedded, ${linked} linked to RSI, ${(html.length / 1024).toFixed(0)} KB).`);
