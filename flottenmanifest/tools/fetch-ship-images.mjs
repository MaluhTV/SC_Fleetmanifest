#!/usr/bin/env node
/**
 * Downloads a thumbnail for every ship into images/ships/ and points `image` in data/ships.json to it,
 * so the page shows the pictures without loading anything from RSI at runtime.
 *
 *   node tools/fetch-ship-images.mjs                    get the RSI ship matrix, download missing images
 *   node tools/fetch-ship-images.mjs ship-matrix.json   use a saved copy of the ship matrix instead
 *   ... --overwrite                                     download again even if a file already exists
 *   ... --dry-run                                       only report, don't download or write
 *   ... --urls-only                                     don't download, only write data/image-urls.json
 *
 * Every run also writes data/image-urls.json ({ ship name: RSI image URL }). The page uses it to show
 * the image straight from RSI when there is no local file (e.g. a repository without images/), and
 * `node tools/build-standalone.mjs --remote-images` builds a file that links the images instead of embedding them.
 *
 * Where the image URLs come from:
 *   1. the RSI ship matrix  https://robertsspaceindustries.com/ship-matrix/index
 *      → { data: [ { name, media: [ { images: { store_small, … } } ] } ] }, names matched like a hangar import
 *   2. any https URL already set by hand in ships.json (e.g. for variants that are missing from the ship matrix)
 * Files are saved as images/ships/<ship-name-slug>.<ext>, `image` becomes "images/ships/<slug>.<ext>".
 *
 * Afterwards: node tools/validate-ships.mjs --format && node tools/build-standalone.mjs
 * (tools/update-images.cmd / .sh run all three steps.)
 * Requires Node.js 18 or newer (built-in fetch), no packages.
 *
 * The images belong to Cloud Imperium Games – check CIG's fan content guidelines before publishing them.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createShipDb } from "../js/shipdb.js";
import { normalizeName } from "../js/util.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPS_FILE = join(ROOT, "data", "ships.json");
const IMAGE_DIR = "images/ships";
const MATRIX_URL = "https://robertsspaceindustries.com/ship-matrix/index";
/** Preferred image sizes, first one found wins. store_small ≈ 350×200 px is plenty for thumbnails. */
const SIZES = ["store_small", "store_large", "slideshow"];
const HEADERS = { "user-agent": "Mozilla/5.0 (fleet-manifest image fetcher)", accept: "*/*" };

const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const dryRun = args.includes("--dry-run");
const urlsOnly = args.includes("--urls-only");
const URLS_FILE = join(ROOT, "data", "image-urls.json");
const file = args.find((a) => !a.startsWith("--"));

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const shipsDoc = read(SHIPS_FILE);
const db = createShipDb(shipsDoc, read(join(ROOT, "data", "loops.json")), read(join(ROOT, "data", "example-fleet.json")));
const slug = (name) => normalizeName(name).replace(/ /g, "-") || "ship";
const absolute = (url) => (url.startsWith("//") ? "https:" + url : url);

/* ---------- 1. Collect image URLs ---------- */

async function loadMatrix() {
  if (file) return read(file);
  console.log(`Downloading ${MATRIX_URL} …`);
  try {
    const res = await fetch(MATRIX_URL, { headers: { ...HEADERS, accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.log(`  Ship matrix not available (${e.message}). Only URLs already in ships.json are used.`);
    console.log(`  Tip: open ${MATRIX_URL} in a browser, save it as ship-matrix.json and pass the file.`);
    return { data: [] };
  }
}
const matrix = await loadMatrix();
const entries = (Array.isArray(matrix) ? matrix : matrix.data) || [];

function imageOf(entry) {
  for (const m of entry.media || []) {
    for (const size of SIZES) if (m.images && m.images[size]) return absolute(m.images[size]);
    if (m.source_url) return absolute(m.source_url);
  }
  return null;
}

const urls = new Map(); // ship name -> remote URL
// a URL set by hand wins over the ship matrix
for (const s of shipsDoc.ships) if (s.image && /^https:/.test(s.image)) urls.set(s.name, s.image);
// exact name/alias matches before prefix matches, so "Aurora Mk I MR" is not overwritten by a looser match
const exactKeys = new Set(shipsDoc.ships.flatMap((s) => [s.name, ...(s.aliases || [])].map(normalizeName)));
const sorted = [...entries].sort((a, b) => exactKeys.has(normalizeName(b.name)) - exactKeys.has(normalizeName(a.name)));
const unmatched = [];
for (const entry of sorted) {
  const hit = db.match(entry.name);
  const url = imageOf(entry);
  if (!hit) { unmatched.push(entry.name); continue; }
  if (url && !urls.has(hit.name)) urls.set(hit.name, url);
}

/* ---------- 2. Save the URL list (links only, no image data) ---------- */

if (!dryRun) {
  const sortedUrls = Object.fromEntries([...urls].sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(URLS_FILE, JSON.stringify({
    meta: { source: MATRIX_URL, updated: new Date().toISOString().slice(0, 10), note: "Links to RSI store images. The images belong to Cloud Imperium Games and are not part of this repository." },
    urls: sortedUrls,
  }, null, 2) + "\n");
  console.log(`data/image-urls.json written (${urls.size} links).`);
}
if (urlsOnly) {
  console.log("--urls-only: no download. Next: node tools/build-standalone.mjs --remote-images");
  process.exit(0);
}

/* ---------- 3. Download ---------- */

if (!dryRun) mkdirSync(join(ROOT, IMAGE_DIR), { recursive: true });
let downloaded = 0, kept = 0;
const failed = [];
for (const s of shipsDoc.ships) {
  const url = urls.get(s.name);
  const localExisting = s.image && s.image.startsWith(IMAGE_DIR) && existsSync(join(ROOT, s.image));
  if (localExisting && !overwrite) { kept++; continue; }
  if (!url) continue;
  const ext = (url.match(/\.(jpe?g|png|webp)(\?|$)/i) || [, "jpg"])[1].toLowerCase().replace("jpeg", "jpg");
  const target = `${IMAGE_DIR}/${slug(s.name)}.${ext}`;
  if (dryRun) { console.log(`  would download ${s.name} → ${target}`); continue; }
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(join(ROOT, target), Buffer.from(await res.arrayBuffer()));
    s.image = target;
    downloaded++;
    process.stdout.write(".");
  } catch (e) {
    failed.push(`${s.name} (${e.message})`);
  }
}

/* ---------- 4. Report and save ---------- */

console.log(`\n\n${downloaded} images downloaded, ${kept} already present.`);
if (failed.length) console.log(`\nFailed (${failed.length}): ${failed.join(", ")}`);
if (unmatched.length) console.log(`\nIn the ship matrix but not in ships.json (${unmatched.length}): ${unmatched.join(", ")}`);
const missing = shipsDoc.ships.filter((s) => !s.image || !s.image.startsWith(IMAGE_DIR)).map((s) => s.name);
if (missing.length) console.log(`\nStill without local image (${missing.length}): ${missing.join(", ")}`);

if (!dryRun) {
  writeFileSync(SHIPS_FILE, JSON.stringify(shipsDoc, null, 2) + "\n");
  console.log("\ndata/ships.json updated. Next: node tools/validate-ships.mjs --format && node tools/build-standalone.mjs");
}
