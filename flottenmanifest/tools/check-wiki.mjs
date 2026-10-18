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

// special paints and event editions of a ship (same values) – not reported as missing
const SPECIAL = /wikelo|pyam exec|best in show|citizencon|\bedition\b|\bcolou?r\b|\bikti\b|orange line|\b2951 bis\b/i;
// "MISC Freelancer" → "Freelancer": the wiki sometimes puts the manufacturer in front
const withoutMaker = (name) => name.split(/\s+/).slice(1).join(" ");
const findShip = (name) => byName.get(norm(name)) || byName.get(norm(withoutMaker(name)));

let api;
const fileArg = process.argv.indexOf("--file"); // offline: node tools/check-wiki.mjs --file vehicles.json
try {
  api = fileArg > 0 ? JSON.parse(readFileSync(process.argv[fileArg + 1], "utf8")) : await fetchAll();
  if (!Array.isArray(api)) api = api.data || [];
} catch (e) { console.error(`Star Citizen Wiki API not reachable: ${e.message}`); process.exit(2); }
if (process.argv.includes("--sample")) { console.log(JSON.stringify(api[0], null, 2)); process.exit(0); }
const withDims = process.argv.includes("--dims");

const STATUS = (v) => {
  const t = norm(v && typeof v === "object" ? pick(v, "en_EN", "en") : v);
  return /flight ready|released/.test(t) ? "flight-ready" : /production/.test(t) ? "in-production" : /concept/.test(t) ? "concept" : undefined;
};
const num = (v) => (v === undefined || v === null || v === "" || Number(v) === 0 || !Number.isFinite(Number(v)) ? undefined : Number(v)); // 0 = not filled in the wiki

// one wiki entry per ship: the one with exactly the ship's name, otherwise the first match
const entries = new Map(), missing = new Set();
for (const v of api) {
  const name = pick(v, "name");
  if (!name) continue;
  const s = findShip(name);
  if (!s) { if (!SPECIAL.test(name)) missing.add(name); continue; }
  const exact = norm(name) === norm(s.name);
  if (!entries.has(s.name) || (exact && !entries.get(s.name).exact)) entries.set(s.name, { v, exact });
}

const groups = { axes: [], crew: [], scu: [], status: [], dims: [] };
for (const [shipName, { v }] of entries) {
  const s = ships.find((x) => x.name === shipName);
  // crew: only if the wiki values are consistent (min ≤ max)
  const cMin = num(pick(v, "crew.min", "crew.minimum", "min_crew")), cMax = num(pick(v, "crew.max", "crew.maximum", "max_crew"));
  if (cMin !== undefined && cMax !== undefined && cMin <= cMax && (cMin !== s.crewMin || cMax !== s.crewMax)) groups.crew.push(`${s.name}: here ${s.crewMin}–${s.crewMax}, wiki ${cMin}–${cMax}`);
  const scu = num(pick(v, "cargo_capacity", "cargo.capacity", "cargo"));
  if (scu !== undefined && Math.abs(scu - s.scu) >= 1) groups.scu.push(`${s.name}: here ${s.scu}, wiki ${scu}`);
  const st = STATUS(pick(v, "production_status"));
  if (st && st !== s.status) groups.status.push(`${s.name}: here ${s.status}, wiki ${st}`);
  const w = [num(pick(v, "sizes.length", "dimension.length", "length")), num(pick(v, "sizes.beam", "dimension.width", "beam")), num(pick(v, "sizes.height", "dimension.height", "height"))];
  const h = [s.length, s.beam, s.height];
  if (w.every((x) => x !== undefined) && h.every((x) => typeof x === "number")) {
    const fmt = (a) => a.join(" × ");
    const sorted = (a) => [...a].sort((x, y) => x - y).join(",");
    const off = h.some((x, i) => Math.abs(x - w[i]) > Math.max(0.5, x * 0.1));
    if (off && sorted(h) === sorted(w)) groups.axes.push(`${s.name}: here ${fmt(h)}, wiki ${fmt(w)} (same values, other order)`);
    else if (off && withDims) groups.dims.push(`${s.name}: here ${fmt(h)}, wiki ${fmt(w)}`);
  }
}

const out = (title, list) => { if (list.length) console.log(`\n${title} (${list.length}):\n  ` + list.join("\n  ")); };
console.log(`${api.length} wiki entries, ${entries.size} matched to the ${ships.length} ships in ships.json.`);
out("Dimensions in another axis order – probably length/beam/height swapped here", groups.axes);
out("Status", groups.status);
out("Cargo (SCU)", groups.scu);
out("Crew min–max", groups.crew);
if (withDims) out("Dimensions differing by more than 10 %", groups.dims);
else console.log("\n(Other dimension differences hidden – the wiki often has hitbox or placeholder values; show them with --dims.)");
out("In the wiki but not in ships.json – new ships or other names (special paints/editions left out)", [...missing].sort());
console.log("\nThe wiki is community data: check the RSI ship page before changing ships.json.");
