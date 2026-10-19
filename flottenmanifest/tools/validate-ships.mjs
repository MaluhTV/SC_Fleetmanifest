#!/usr/bin/env node
/**
 * Checks data/ships.json for errors and optionally rewrites it in the canonical format.
 *
 *   node tools/validate-ships.mjs            check only (exit code 1 on errors)
 *   node tools/validate-ships.mjs --format   check, sort alphabetically and format consistently
 *
 * Requires only Node.js (18 or newer), no packages.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPS_FILE = join(ROOT, "data", "ships.json");
const LOOPS_FILE = join(ROOT, "data", "loops.json");
const URLS_FILE = join(ROOT, "data", "image-urls.json");

const STATUSES = ["flight-ready", "in-production", "concept"];
const ROLES = ["primary", "secondary", "planned"];
// keep in sync with FIGHTER_CLASSES in js/shipdb.js
const FIGHTER_CLASSES = ["snub", "light", "medium", "heavy", "interceptor", "stealth", "interdiction", "bomber"];
const SIZE_PATTERN = /^(S[1-6] (Snub|Small|Medium|Large|Capital)|Snub|Small|Medium|Large|Capital|Ground vehicle)$/;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const shipsDoc = JSON.parse(readFileSync(SHIPS_FILE, "utf8"));
const loopIds = JSON.parse(readFileSync(LOOPS_FILE, "utf8")).loops.map((l) => l.id);
const ships = shipsDoc.ships;
// RSI image links (tools/fetch-ship-images.mjs): a ship with a link needs no local file – the page falls back to it
const imageUrls = existsSync(URLS_FILE) ? JSON.parse(readFileSync(URLS_FILE, "utf8")).urls || {} : {};

const errors = [];
const warnings = [];
const err = (ship, msg) => errors.push(`${ship}: ${msg}`);
const warn = (ship, msg) => warnings.push(`${ship}: ${msg}`);

// --- Per-ship checks --------------------------------------------------------
const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
for (const s of ships) {
  const n = s.name || "(no name)";
  if (!s.name || typeof s.name !== "string") err(n, "field 'name' is missing");
  if (!Array.isArray(s.aliases)) err(n, "field 'aliases' must be a list (may be empty: [])");
  if (!SIZE_PATTERN.test(s.size || "")) err(n, `invalid field 'size': "${s.size}" (e.g. "S3 Medium", "Capital", "Ground vehicle")`);
  for (const f of ["length", "beam", "height"]) {
    if (s[f] !== null && !isNum(s[f])) err(n, `field '${f}' must be a number or null`);
  }
  if (!Number.isInteger(s.crewMin) || !Number.isInteger(s.crewMax)) err(n, "crewMin/crewMax must be integers");
  else if (s.crewMin > s.crewMax) err(n, "crewMin is greater than crewMax");
  if (!isNum(s.scu)) err(n, "field 'scu' must be a number (0 if no cargo space)");
  if (!STATUSES.includes(s.status)) err(n, `invalid field 'status': "${s.status}" (allowed: ${STATUSES.join(", ")})`);
  if (!s.loops || typeof s.loops !== "object" || !Object.keys(s.loops).length) err(n, "at least one entry under 'loops' is required");
  else {
    for (const [loop, role] of Object.entries(s.loops)) {
      if (!loopIds.includes(loop)) err(n, `unknown loop "${loop}" (see data/loops.json)`);
      if (!ROLES.includes(role)) err(n, `invalid role "${role}" for loop "${loop}" (allowed: ${ROLES.join(", ")})`);
      if (s.status !== "flight-ready" && role !== "planned") warn(n, `not flight-ready, but loop "${loop}" is "${role}" instead of "planned"`);
    }
  }
  if (!s.note || typeof s.note.de !== "string" || typeof s.note.en !== "string") err(n, "field 'note' needs 'de' and 'en' (may be empty)");
  if (!Array.isArray(s.motherships)) err(n, "field 'motherships' must be a list (may be empty: [])");
  if (s.fighterClass != null && !FIGHTER_CLASSES.includes(s.fighterClass)) err(n, `invalid field 'fighterClass': "${s.fighterClass}" (allowed: ${FIGHTER_CLASSES.join(", ")} or null)`);
  if (s.fighterClass != null && !s.loops?.fighter) warn(n, "has a 'fighterClass' but no 'fighter' loop");
  if (s.loops?.fighter === "primary" && s.fighterClass == null) warn(n, "primary fighter without 'fighterClass' – see the role on starcitizen.tools");
  if (s.upgradeable !== undefined && typeof s.upgradeable !== "boolean") err(n, "field 'upgradeable' must be true or false");
  if (s.image != null && !/^(https:\/\/\S+|images\/[\w./-]+)$/.test(s.image)) err(n, "field 'image' must be a local path (images/…), an https URL or null");
  else if (s.image && s.image.startsWith("images/") && !existsSync(join(ROOT, s.image)) && !imageUrls[s.name]) warn(n, `image file ${s.image} is missing and there is no RSI link in data/image-urls.json – run node tools/fetch-ship-images.mjs`);
  // all statuses: concept ships usually have published dimensions on starcitizen.tools as well
  if (s.length == null || s.beam == null || s.height == null) warn(n, "dimensions are incomplete – check the ship page on starcitizen.tools");
}

// --- Checks across all ships ------------------------------------------------
const owner = new Map(); // normalized name/alias -> ship name
for (const s of ships) {
  for (const label of [s.name, ...(s.aliases || [])]) {
    const k = norm(label);
    if (!k) continue;
    if (owner.has(k) && owner.get(k) !== s.name) err(s.name, `name/alias "${label}" is already used by "${owner.get(k)}"`);
    else owner.set(k, s.name);
  }
}
const names = new Set(ships.map((s) => s.name));
for (const s of ships) {
  for (const m of s.motherships || []) if (!names.has(m)) err(s.name, `mothership "${m}" does not exist in ships.json`);
}

// Archetypes: loops.json → group; a ship in a multi loop (snub, ground vehicle) needs an archetype – from its
// other roles or set with "archetype" – otherwise it would not show up in any archetype
const loopsDoc = JSON.parse(readFileSync(LOOPS_FILE, "utf8"));
const groupOf = Object.fromEntries(loopsDoc.loops.map((l) => [l.id, l.group || "multi"]));
const ARCHETYPES = ["combat", "supply", "explore"];
for (const l of loopsDoc.loops) if (![...ARCHETYPES, "multi"].includes(l.group)) err(`loops.json "${l.id}"`, `invalid group "${l.group}" (combat, supply, explore or multi)`);
for (const s of ships) {
  if (s.archetype != null && !ARCHETYPES.includes(s.archetype)) err(s.name, `invalid archetype "${s.archetype}" (combat, supply or explore)`);
  const inMulti = Object.keys(s.loops || {}).some((k) => groupOf[k] === "multi");
  const derived = Object.keys(s.loops || {}).some((k) => groupOf[k] && groupOf[k] !== "multi");
  if (inMulti && !s.archetype && !derived) warn(s.name, 'snub/ground vehicle without other roles – set "archetype" (combat, supply or explore)');
  // the snub loop is the small craft itself – a mothership that carries one gets it via data/included.json
  if (s.loops?.snub && !/Snub/.test(s.size)) err(s.name, 'loop "snub" only for snub-sized craft – a mothership carries its snub via data/included.json');
}

// data/included.json (RSI "Included Vessels"): every vessel must be a ship or alias in ships.json;
// a parent that is unknown only warns (RSI may list variants the database does not have yet)
const INCLUDED_FILE = join(ROOT, "data", "included.json");
if (existsSync(INCLUDED_FILE)) {
  const parents = JSON.parse(readFileSync(INCLUDED_FILE, "utf8")).parents || {};
  for (const [parent, list] of Object.entries(parents)) {
    if (!owner.has(norm(parent))) warn(`included.json "${parent}"`, "parent ship is not a ship or alias in ships.json – ignored on import");
    for (const v of list) if (!owner.has(norm(v))) err(`included.json "${parent}"`, `included vessel "${v}" is not a ship or alias in ships.json`);
  }
}

// --- Output ------------------------------------------------------------------
warnings.forEach((w) => console.log("Warning: " + w));
errors.forEach((e) => console.log("ERROR:   " + e));
console.log(`\n${ships.length} ships checked, ${errors.length} errors, ${warnings.length} warnings.`);

if (process.argv.includes("--format")) {
  if (errors.length) {
    console.log("Formatting cancelled – please fix the errors first.");
    process.exit(1);
  }
  writeFileSync(SHIPS_FILE, formatShipsFile(shipsDoc));
  console.log("ships.json sorted and formatted.");
}
process.exit(errors.length ? 1 : 0);

/**
 * Canonical format: one block per ship, related values on one line.
 * This keeps changes readable in Git diffs.
 */
function formatShipsFile(doc) {
  const j = (v) => JSON.stringify(v);
  const sorted = [...doc.ships].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const block = (s) =>
    [
      "    {",
      `      "name": ${j(s.name)},`,
      `      "aliases": ${j(s.aliases)},`,
      `      "size": ${j(s.size)},`,
      `      "length": ${j(s.length)}, "beam": ${j(s.beam)}, "height": ${j(s.height)},`,
      `      "crewMin": ${j(s.crewMin)}, "crewMax": ${j(s.crewMax)},`,
      `      "scu": ${j(s.scu)},`,
      `      "status": ${j(s.status)},`,
      `      "loops": ${j(s.loops).replace(/,/g, ", ").replace(/":/g, '": ')},`,
      `      "note": { "de": ${j(s.note.de)}, "en": ${j(s.note.en)} },`,
      `      "motherships": ${j(s.motherships)},`,
      ...(s.archetype ? [`      "archetype": ${j(s.archetype)},`] : []),
      `      "upgradeable": ${j(s.upgradeable !== false)},`,
      ...(s.fighterClass ? [`      "fighterClass": ${j(s.fighterClass)},`] : []),
      `      "image": ${j(s.image ?? null)}`,
      "    }",
    ].join("\n");
  return [
    "{",
    `  "meta": ${JSON.stringify(doc.meta, null, 2).replace(/\n/g, "\n  ")},`,
    '  "ships": [',
    sorted.map(block).join(",\n"),
    "  ]",
    "}",
    "",
  ].join("\n");
}
