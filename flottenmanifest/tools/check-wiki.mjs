/**
 * Compares data/ships.json with the Star Citizen Wiki API and lists differences – it never changes anything.
 * Run it before updating the ship data:
 *
 *   node tools/check-wiki.mjs            differences in crew, SCU, status, dimensions + ships missing here
 *   node tools/check-wiki.mjs --sample   prints one raw API entry (to check the field names if the API changed)
 *
 * Source: https://api.star-citizen.wiki (Star Citizen Wiki, community data). Field names are read defensively,
 * because the API may change; a field the API does not deliver is skipped, not reported.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.star-citizen.wiki/api/v2/vehicles";
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pick = (obj, ...paths) => {
  for (const p of paths) {
    const v = p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

async function fetchAll() {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`${API}?page%5Bsize%5D=100&page%5Bnumber%5D=${page}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`API answered HTTP ${res.status}`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : body.data || [];
    all.push(...items);
    const last = pick(body, "meta.last_page", "meta.lastPage");
    if (!items.length || (last && page >= last) || (!last && !pick(body, "links.next"))) break;
  }
  return all;
}

const ships = JSON.parse(readFileSync(join(ROOT, "data", "ships.json"), "utf8")).ships;
const byName = new Map();
for (const s of ships) for (const n of [s.name, ...(s.aliases || [])]) byName.set(norm(n), s);

let api;
try { api = await fetchAll(); }
catch (e) { console.error(`Star Citizen Wiki API not reachable: ${e.message}`); process.exit(2); }
if (process.argv.includes("--sample")) { console.log(JSON.stringify(api[0], null, 2)); process.exit(0); }

const STATUS = (v) => {
  const t = norm(typeof v === "object" ? pick(v, "en_EN", "en") : v);
  return /flight ready|released/.test(t) ? "flight-ready" : /production/.test(t) ? "in-production" : /concept/.test(t) ? "concept" : null;
};
const diffs = [], missing = [];
for (const v of api) {
  const name = pick(v, "name");
  if (!name) continue;
  const s = byName.get(norm(name));
  if (!s) { missing.push(name); continue; }
  const cmp = (label, ours, theirs, eq = (a, b) => a === b) => {
    if (theirs === undefined || ours === undefined || ours === null) return;
    if (!eq(ours, theirs)) diffs.push(`${s.name}: ${label} here ${ours}, wiki ${theirs}`);
  };
  cmp("crew min", s.crewMin, pick(v, "crew.min", "crew.minimum", "min_crew"));
  cmp("crew max", s.crewMax, pick(v, "crew.max", "crew.maximum", "max_crew"));
  cmp("SCU", s.scu, pick(v, "cargo_capacity", "cargo.capacity", "cargo"), (a, b) => Math.abs(a - Number(b)) < 0.01);
  cmp("status", s.status, STATUS(pick(v, "production_status")));
  const close = (a, b) => Math.abs(a - Number(b)) <= 0.5;
  cmp("length", s.length, pick(v, "sizes.length", "dimension.length", "length"), close);
  cmp("beam", s.beam, pick(v, "sizes.beam", "dimension.width", "beam"), close);
  cmp("height", s.height, pick(v, "sizes.height", "dimension.height", "height"), close);
}
console.log(`${api.length} vehicles from the wiki, ${ships.length} in ships.json.\n`);
console.log(diffs.length ? `Differences (${diffs.length}):\n  ` + diffs.join("\n  ") : "No differences in crew, SCU, status or dimensions.");
console.log(missing.length ? `\nIn the wiki but not in ships.json (${missing.length}) – maybe new ships or other names:\n  ` + missing.sort().join("\n  ") : "");
console.log("\nThe wiki is community data: check the RSI ship page before changing ships.json.");
