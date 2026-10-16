/**
 * Page state and its persistence in the browser.
 * Only ship name, quantity, insurance and meltability are stored – no prices or IDs.
 */
import { storage } from "./util.js";

export const MAX_COMPARE = 4;
export const VIEWS = ["loops", "matrix", "list", "overlaps", "compare"];

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
    username: storage.get("name", null) ?? example.username,
    ownFleet: !!(items && saved.own),
    items: items || exampleItems(example),
    compare: Array.isArray(compare) ? compare : [...example.compare],
    view: VIEWS.includes(view) ? view : "loops",
    marked: Array.isArray(marked) ? marked.map(String) : [], // ships marked "to replace" in the overlaps tab (red)
    chosen: chosen && typeof chosen === "object" && !Array.isArray(chosen) ? chosen : {}, // { shipToReplace: substitute } (green)
    overrides: overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {}, // edits from the in-page editor
    ovDetails: Array.isArray(ovDetails) ? ovDetails : [], // extra data shown in the overlaps tab, e.g. ["scu"]
    melt: melt && typeof melt === "object" && !Array.isArray(melt) ? melt : {}, // melt status chosen by click: { ship: "meltable"|"upgrade"|"locked" }
    list: { sortKey: "name", sortDir: 1 },
  };
}

export function exampleItems(example) {
  return example.ships.map((s) => ({ name: s.name, qty: s.qty || 1 }));
}

/** Keep only allowed fields (older saved states may contain more). */
function sanitizeItem(i) {
  const meltable = i.meltable ?? i.melt;
  return {
    name: String(i.name || ""),
    qty: +i.qty || 1,
    insurance: typeof i.insurance === "string" ? i.insurance : typeof i.ins === "string" ? i.ins : "",
    meltable: meltable === false || meltable === "false" ? false : meltable === true || meltable === "true" ? true : null,
  };
}

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
