/**
 * Page state and its persistence in the browser.
 * Only ship name, quantity, insurance and meltability are stored – no prices or IDs.
 */
import { storage } from "./util.js";
import { sanitizeOverride } from "./shipdb.js";
import { MELT_STATES } from "./analysis.js";

export const MAX_COMPARE = 4;
export const VIEWS = ["loops", "matrix", "list", "overlaps", "compare"];

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
    ovDetails: strList(ovDetails), // extra data shown in the overlaps tab, e.g. ["scu"]
    melt: strMap(melt, (x) => MELT_STATES.includes(x)), // melt status chosen by click: { ship: "meltable"|"upgrade"|"locked" }
    list: { sortKey: "name", sortDir: 1 },
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
  resetFleet: () => storage.set("fleet", null),
};
