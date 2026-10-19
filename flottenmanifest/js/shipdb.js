/**
 * Ship database: loads the JSON files and matches ship names.
 *
 * Data sources (relative to this file):
 *   ../data/ships.json   – all ships (maintenance guide: docs/SHIP-DATABASE.md)
 *   ../data/loops.json   – gameplay loops with German/English names
 */
import { normalizeName } from "./util.js";

export const ROLE = { PRIMARY: "primary", SECONDARY: "secondary", PLANNED: "planned" };
export const STATUS = { FLIGHT_READY: "flight-ready", IN_PRODUCTION: "in-production", CONCEPT: "concept" };

/** Sort order of roles in lists: primary, planned, secondary. */
export const ROLE_ORDER = { primary: 0, planned: 1, secondary: 2 };

const dataUrl = (file) => new URL(`../data/${file}`, import.meta.url);

async function loadJson(file) {
  // Standalone build (tools/build-standalone.mjs) embeds the data as globalThis.FM_DATA
  if (globalThis.FM_DATA && globalThis.FM_DATA[file]) return globalThis.FM_DATA[file];
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`${file} could not be loaded (HTTP ${res.status})`);
  return res.json();
}

/**
 * Loads ships, loops and the example fleet and builds the name index.
 * @returns {Promise<ShipDb>}
 */
export async function loadShipDb() {
  const [shipsDoc, loopsDoc, example, imageUrls, includedDoc] = await Promise.all([
    loadJson("ships.json"),
    loadJson("loops.json"),
    loadJson("example-fleet.json"),
    // optional: links to the RSI store images (tools/fetch-ship-images.mjs); missing file = no fallback
    loadJson("image-urls.json").catch(() => ({ urls: {} })),
    // optional: vessels RSI includes with a parent ship (Carrack → C8 Pisces + Ursa …)
    loadJson("included.json").catch(() => ({ parents: {} })),
  ]);
  // untouched copy for the editor export (js/views/editor.js) – keeps the relative image paths
  const rawShipsDoc = JSON.parse(JSON.stringify(shipsDoc));
  // Local images ("images/ships/x.jpg", see tools/fetch-ship-images.mjs) are relative to the project root,
  // so they also work when the page is embedded elsewhere. URLs and embedded data: URIs stay as they are.
  for (const s of shipsDoc.ships) {
    if (s.image && !/^(https?:|data:)/.test(s.image)) s.image = new URL(`../${s.image}`, import.meta.url).href;
    // remote fallback: shown when the local file is missing (thumb() → data-fallback, handled in main.js)
    const remote = imageUrls?.urls?.[s.name];
    if (typeof remote === "string" && /^https:\/\/[\w.-]*robertsspaceindustries\.com\//.test(remote)) {
      if (s.image) s.imageFallback = remote; else s.image = remote;
    }
  }
  const db = createShipDb(shipsDoc, loopsDoc, example);
  db.source = { shipsDoc, rawShipsDoc, loopsDoc, example, includedDoc };
  db.included = includedIndex(includedDoc);
  return db;
}

/**
 * data/included.json → Map normalized parent name → names of the included vessels.
 * Looked up with the imported name first ("Carrack" includes the C8, "Carrack w/C8X" the C8X), then the database name.
 */
export function includedIndex(doc) {
  const map = new Map();
  const parents = doc && typeof doc.parents === "object" && doc.parents ? doc.parents : {};
  for (const [parent, list] of Object.entries(parents)) {
    if (Array.isArray(list)) map.set(normalizeName(parent), list.filter((n) => typeof n === "string"));
  }
  return map;
}

/**
 * Editable fields of a ship. The in-page editor stores changes per ship as an "override"
 * ({ shipName: { field: newValue } }, localStorage key fm_overrides) that is laid over ships.json.
 */
export const EDITABLE_FIELDS = ["size", "length", "beam", "height", "crewMin", "crewMax", "scu", "status", "loops", "fighterClass", "note"];

/**
 * Fighter classes = the official RSI role shown on starcitizen.tools ("Light fighter", "Interdiction" …).
 * The first four form a ladder (snub < light < medium < heavy): a heavier class may replace a lighter one.
 * The others are specialised jobs and can only be replaced by the same class.
 * Labels: "fc_<class>" in i18n.js. Keep in sync with tools/validate-ships.mjs.
 */
export const FIGHTER_CLASSES = ["snub", "light", "medium", "heavy", "interceptor", "stealth", "interdiction", "bomber"];
export const FIGHTER_LADDER = { snub: 0, light: 1, medium: 2, heavy: 3 };

export const SIZE_PATTERN = /^(S[1-6] (Snub|Small|Medium|Large|Capital)|Snub|Small|Medium|Large|Capital|Ground vehicle)$/;
const STATUSES = Object.values(STATUS);
const ROLES = Object.values(ROLE);
const isCount = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Validates one override object field by field and drops everything that is not a valid value.
 * Overrides come from localStorage, which anyone with access to the browser can edit, so they are
 * treated like import data: never trusted.
 */
export function sanitizeOverride(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const out = {};
  if (typeof o.size === "string" && SIZE_PATTERN.test(o.size)) out.size = o.size;
  for (const f of ["length", "beam", "height"]) if (f in o && (o[f] === null || isCount(o[f]))) out[f] = o[f];
  if (isCount(o.scu)) out.scu = o.scu;
  if (Number.isInteger(o.crewMin) && Number.isInteger(o.crewMax) && o.crewMin >= 1 && o.crewMin <= o.crewMax) {
    out.crewMin = o.crewMin; out.crewMax = o.crewMax;
  }
  if (STATUSES.includes(o.status)) out.status = o.status;
  if (o.loops && typeof o.loops === "object" && !Array.isArray(o.loops)) {
    const loops = Object.fromEntries(Object.entries(o.loops).filter(([k, r]) => /^[a-z-]{1,40}$/.test(k) && ROLES.includes(r)));
    if (Object.keys(loops).length) out.loops = loops;
  }
  if ("fighterClass" in o && (o.fighterClass === null || FIGHTER_CLASSES.includes(o.fighterClass))) out.fighterClass = o.fighterClass;
  if (o.note && typeof o.note.de === "string" && typeof o.note.en === "string") out.note = { de: o.note.de.slice(0, 300), en: o.note.en.slice(0, 300) };
  if (!Object.keys(out).length) return null;
  // database date (ships.json → meta.updated) the edit was made on – newer data is not hidden silently
  if (typeof o.base === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.base)) out.base = o.base;
  return out;
}

/** Returns a copy of shipsDoc with the overrides applied (unknown ship names are ignored). */
export function applyOverrides(shipsDoc, overrides) {
  const doc = JSON.parse(JSON.stringify(shipsDoc));
  for (const s of doc.ships) {
    const o = overrides[s.name];
    if (o) for (const f of EDITABLE_FIELDS) if (f in o) s[f] = JSON.parse(JSON.stringify(o[f]));
  }
  return doc;
}

/** Archetypes (loops.json → group): every loop belongs to one, "multi" loops (snub, ground vehicle) to all three. */
export const ARCHETYPES = ["combat", "supply", "explore"];

/** Builds the database from already loaded data (also usable in tests). */
export function createShipDb(shipsDoc, loopsDoc, example) {
  const loopIds = new Set(loopsDoc.loops.map((l) => l.id));
  const groupOf = Object.fromEntries(loopsDoc.loops.map((l) => [l.id, l.group || "multi"]));
  const ships = shipsDoc.ships.map((s) => ({
    aliases: [],
    note: { de: "", en: "" },
    motherships: [],
    image: null,
    upgradeable: true,
    fighterClass: null,
    beam: null,
    height: null,
    archetype: null,
    ...s,
  }));
  // roles of loops that no longer exist (old edits, removed loops) are dropped
  ships.forEach((s) => { s.loops = Object.fromEntries(Object.entries(s.loops || {}).filter(([k]) => loopIds.has(k))); });

  /**
   * Archetypes of a ship: the one set in ships.json ("archetype"), otherwise the groups of its primary/announced
   * roles, otherwise of its secondary roles – multi loops (snub, ground) do not decide.
   */
  const archetypesOf = (s) => {
    if (ARCHETYPES.includes(s.archetype)) return [s.archetype];
    const groups = (roles) => [...new Set(Object.entries(s.loops).filter(([k, r]) => roles.includes(r) && groupOf[k] !== "multi").map(([k]) => groupOf[k]))];
    const core = groups(["primary", "planned"]);
    return core.length ? core : groups(["secondary"]);
  };
  /**
   * Display slots in archetype order: every loop once, multi loops once per archetype (key "snub--combat").
   * slot.has(ship) = the ship counts in this slot.
   */
  const slots = [];
  for (const g of ARCHETYPES) {
    for (const l of loopsDoc.loops.filter((x) => x.group === g)) slots.push({ key: l.id, id: l.id, group: g, multi: false, has: (s) => !!s.loops[l.id] });
    for (const l of loopsDoc.loops.filter((x) => (x.group || "multi") === "multi")) {
      slots.push({ key: `${l.id}--${g}`, id: l.id, group: g, multi: true, has: (s) => !!s.loops[l.id] && archetypesOf(s).includes(g) });
    }
  }

  // Index: normalized name or alias -> ship. The main name wins over aliases.
  const index = new Map();
  ships.forEach((s) => index.set(normalizeName(s.name), s));
  ships.forEach((s) => s.aliases.forEach((a) => {
    const k = normalizeName(a);
    if (!index.has(k)) index.set(k, s);
  }));
  // For prefix matching: longest keys first, so "Cyclone AA" wins over "Cyclone".
  const keysByLength = [...index.keys()].sort((a, b) => b.length - a.length);

  return {
    meta: shipsDoc.meta,
    ships,
    loops: loopsDoc.loops,
    slots,
    slot: (key) => slots.find((x) => x.key === key) || null,
    archetypesOf,
    example,

    /** Ship by its exact name in ships.json (no alias). */
    byName(name) {
      return ships.find((s) => s.name === name) || null;
    },

    /**
     * Matches any name from an import to a ship.
     * 1. exact match on name or alias (case and punctuation are ignored)
     * 2. prefix match: "Cutlass Black Best In Show Edition" -> "Cutlass Black"
     */
    match(name) {
      const k = normalizeName(name);
      if (!k) return null;
      if (index.has(k)) return index.get(k);
      const hit = keysByLength.find((key) => k.startsWith(key + " "));
      return hit ? index.get(hit) : null;
    },
  };
}

/** Size class as a number for comparisons (ground vehicle = 0, snub = 1 … capital = 6). */
export function sizeRank(size) {
  const m = String(size).match(/S(\d)/);
  if (m) return +m[1];
  if (/Capital/.test(size)) return 6;
  if (/Large/.test(size)) return 5;
  if (/Medium/.test(size)) return 3;
  if (/Snub/.test(size)) return 1;
  return 0;
}

/**
 * @typedef {Object} Ship
 * @property {string} name            display name, unique
 * @property {string[]} aliases       other names used in hangar exports
 * @property {string} size            e.g. "S3 Medium", "Capital", "Ground vehicle"
 * @property {?number} length         m
 * @property {?number} beam           m
 * @property {?number} height         m
 * @property {number} crewMin
 * @property {number} crewMax
 * @property {number} scu             cargo capacity in SCU
 * @property {"flight-ready"|"in-production"|"concept"} status
 * @property {Object<string,"primary"|"secondary"|"planned">} loops  loop ID -> role
 * @property {{de:string,en:string}} note
 * @property {string[]} motherships   snubs only: matching motherships
 *
 * @typedef {Object} ShipDb
 * @property {Object} meta
 * @property {Ship[]} ships
 * @property {{id:string,de:string,en:string}[]} loops
 * @property {Object} example
 * @property {(name:string)=>?Ship} byName
 * @property {(name:string)=>?Ship} match
 */
