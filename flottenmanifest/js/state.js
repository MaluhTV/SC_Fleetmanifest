/**
 * Page state and its persistence in the browser.
 * Only ship name, quantity, insurance and meltability are stored – no prices or IDs.
 */
import { storage } from "./util.js";
import { sanitizeOverride } from "./shipdb.js";
import { MELT_STATES } from "./analysis.js";

export const MAX_COMPARE = 4;
export const VIEWS = ["loops", "matrix", "list", "overlaps", "compare", "planner"];
/** Fleet planner: at most this many wishes, crew numbers between 1 and PLANNER_CREW_LIMIT. */
export const PLANNER_MAX_SLOTS = 20;
export const PLANNER_CREW_LIMIT = 99;
export const PLANNER_MAX_PICKS = 20;

/*
 * Everything in localStorage can be edited by anyone with access to the browser, so every value is
 * checked on load: wrong types and unknown values are dropped. Output is escaped as well (esc()).
 */
const isStr = (v) => typeof v === "string" && v.length > 0 && v.length <= 100;
const strList = (v) => (Array.isArray(v) ? v.filter(isStr) : []);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const strMap = (v, valueOk) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => isStr(k) && valueOk(x))) : {});

/** Reads the saved state or falls back to the example fleet. */
export function loadState(example) {
  const saved = storage.get("fleet", null);
  const items = saved && Array.isArray(saved.items) ? saved.items.map(sanitizeItem).filter((i) => i.name) : null;
  const lang = storage.get("lang", "de");
  const compare = storage.get("cmp", null);
  const view = storage.get("tab", "loops");
  const marked = storage.get("marked", []);
  const chosen = storage.get("chosen", {});
  const overrides = storage.get("overrides", {});
  const melt = storage.get("melt", {});
  const ovDetails = storage.get("ovdetails", []);
  const planner = storage.get("planner", []);
  const ovReadyFirst = storage.get("ovready", false);
  const rsiImages = storage.get("rsiimg", null);
  const aliases = storage.get("aliases", {});
  return {
    lang: lang === "en" ? "en" : "de",
    username: typeof storage.get("name", null) === "string" ? storage.get("name").slice(0, 40) : example.username,
    ownFleet: !!(items && saved.own),
    items: items || exampleItems(example),
    compare: Array.isArray(compare) ? strList(compare).slice(0, MAX_COMPARE) : [...example.compare],
    view: VIEWS.includes(view) ? view : "loops",
    marked: strList(marked), // ships marked "to replace" in the overlaps tab (red)
    chosen: strMap(chosen, isStr), // { shipToReplace: substitute } (green)
    overrides: Object.fromEntries(Object.entries(strMap(overrides, isObj)).map(([k, o]) => [k, sanitizeOverride(o)]).filter(([, o]) => o)), // edits from the in-page editor
    ovDetails: strList(ovDetails),
    ovReadyFirst: ovReadyFirst === true, // overlaps option: ships usable today first (off by default) // extra data shown in the overlaps tab, e.g. ["scu"]
    melt: strMap(melt, (x) => MELT_STATES.includes(x)), // melt status chosen by click: { ship: "meltable"|"upgrade"|"locked" }
    aliases: strMap(aliases, isStr), // own name → database ship for entries the import did not recognise
    rsiImages: rsiImages === true || rsiImages === false ? rsiImages : null, // RSI ship images: false = off; true = on (notice acknowledged); null = on, notice not acknowledged yet
    planner: Array.isArray(planner) ? planner.map(sanitizeSlot).filter(Boolean).slice(0, PLANNER_MAX_SLOTS) : [], // fleet planner wishes
    list: { sortKey: "name", sortDir: 1 },
    kpiFilter: null, // KPI tile filter for the ship list: "owned" | "ready" | "included" (not stored)
  };
}

export function exampleItems(example) {
  return example.ships.map((s) => ({ name: s.name, qty: s.qty || 1 }));
}

/** Keep only allowed fields with valid values (older saved states may contain more; used for imports too). */
export function sanitizeItem(i) {
  const meltable = i.meltable ?? i.melt;
  return {
    name: String(i.name || "").slice(0, 100),
    qty: Number.isInteger(+i.qty) && +i.qty >= 1 && +i.qty <= 999 ? +i.qty : 1,
    insurance: cleanInsurance(typeof i.insurance === "string" ? i.insurance : typeof i.ins === "string" ? i.ins : ""),
    meltable: meltable === false || meltable === "false" ? false : meltable === true || meltable === "true" ? true : null,
  };
}

/** Planner wish { loop, min, max, picks }: loop ID, crew 1…99, max null = open, chosen ship names. Anything else is dropped. */
export function sanitizeSlot(x) {
  if (!x || typeof x !== "object" || typeof x.loop !== "string" || !/^[a-z-]{1,40}$/.test(x.loop)) return null;
  const min = Number.isInteger(x.min) && x.min >= 1 && x.min <= PLANNER_CREW_LIMIT ? x.min : null;
  if (min === null) return null;
  const max = x.max === null || x.max === undefined ? null
    : Number.isInteger(x.max) && x.max >= min && x.max <= PLANNER_CREW_LIMIT ? x.max : null;
  // picks = ships chosen for this wish (names; checked against the database when shown)
  const picks = Array.isArray(x.picks) ? [...new Set(x.picks.filter((n) => typeof n === "string" && n.length > 0 && n.length <= 100))].slice(0, PLANNER_MAX_PICKS) : [];
  return { loop: x.loop, min, max, picks };
}

/** Insurance is "LTI" or a number of months; anything else is dropped (also used by the importers). */
export const cleanInsurance = (v) => {
  const s = String(v ?? "").trim();
  return /^lti$/i.test(s) ? "LTI" : /^\d{1,3}$/.test(s) ? s : "";
};

/** Save functions – key names stay compatible with earlier versions. */
export const save = {
  fleet: (state) => storage.set("fleet", { own: state.ownFleet, items: state.items }),
  username: (state) => storage.set("name", state.username),
  lang: (state) => storage.set("lang", state.lang),
  compare: (state) => storage.set("cmp", state.compare),
  view: (state) => storage.set("tab", state.view),
  marked: (state) => { storage.set("marked", state.marked); storage.set("chosen", state.chosen); },
  overrides: (state) => storage.set("overrides", state.overrides),
  melt: (state) => storage.set("melt", state.melt),
  ovDetails: (state) => storage.set("ovdetails", state.ovDetails),
  ovReadyFirst: (state) => storage.set("ovready", state.ovReadyFirst),
  planner: (state) => storage.set("planner", state.planner),
  rsiImages: (state) => storage.set("rsiimg", state.rsiImages),
  aliases: (state) => storage.set("aliases", state.aliases),
  resetFleet: () => storage.set("fleet", null),
};

/**
 * Backup of everything the page stores (fleet, plan, marks, edits, settings) as one JSON file, to move it
 * to another device. Only names, quantities and settings – no prices or pledge IDs (they are never stored).
 * Restoring writes the values back and loadState() validates them like any stored value.
 */
export const BACKUP_FORMAT = "flottenmanifest-backup";
const BACKUP_KEYS = ["fleet", "name", "lang", "cmp", "marked", "chosen", "overrides", "melt", "ovdetails", "planner", "ovready", "rsiimg", "aliases"];
export function makeBackup(version) {
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = storage.get(k, null);
    if (v !== null) data[k] = v;
  }
  return { format: BACKUP_FORMAT, version, exported: new Date().toISOString().slice(0, 10), data };
}
/** true if the object is a backup and was written to storage; call loadState() afterwards. */
export function restoreBackup(obj) {
  if (!isObj(obj) || obj.format !== BACKUP_FORMAT || !isObj(obj.data)) return false;
  for (const k of BACKUP_KEYS) if (k in obj.data) storage.set(k, obj.data[k]);
  return true;
}
