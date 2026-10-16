/**
 * Entry point: loads the data, holds the state and wires the controls to the views.
 *
 * Flow:
 *   1. loadShipDb()  – data/ships.json, data/loops.json, data/example-fleet.json
 *   2. loadState()   – saved fleet, language, name, compare selection
 *   3. renderAll()   – builds the fleet (analysis.js) and renders every view (views/*.js)
 * Every user action changes state, saves it (save.*) and re-renders.
 */
import { $, $$, storage } from "./util.js";
import { setLang, t, applyStaticTexts } from "./i18n.js";
import { loadShipDb, createShipDb, applyOverrides } from "./shipdb.js";
import { renderEditor, readEditor, diffFromOriginal, downloadShipsJson } from "./views/editor.js";
import { importFile, importTextList, IMPORTERS } from "./importers.js";
import { buildFleet } from "./analysis.js";
import { loadState, save, exampleItems, MAX_COMPARE, VIEWS } from "./state.js";
import { ICONS, meltPair } from "./views/common.js";
import { renderKpis } from "./views/kpis.js";
import { renderLoops } from "./views/loops.js";
import { renderMatrix } from "./views/matrix.js";
import { renderList, renderListFilters } from "./views/list.js";
import { renderOverlaps, renderOvDetails } from "./views/overlaps.js";
import { renderCompare, renderCompareSelect } from "./views/compare.js";

/** All elements the script uses (IDs from index.html). */
const el = {
  ovDetailsBar: $("#ovDetailsBar"),
  meltMenu: $("#meltMenu"),
  meltMenuTitle: $("#meltMenuTitle"),
  editDialog: $("#editDialog"),
  editForm: $("#editForm"),
  editCount: $("#editCount"),
  editExport: $("#editExport"),
  editDiscard: $("#editDiscard"),
  username: $("#headerUsername"),
  usernameInput: $("#usernameInput"),
  importFile: $("#importFile"),
  pasteToggle: $("#pasteToggle"),
  pasteBox: $("#pasteBox"),
  pasteText: $("#pasteText"),
  pasteApply: $("#pasteApply"),
  pasteCancel: $("#pasteCancel"),
  resetExample: $("#resetExample"),
  dbInfo: $("#dbInfo"),
  banner: $("#banner"),
  toast: $("#toast"),
  kpis: $("#kpis"),
  tabs: $$("#tabs [data-view]"),
  compareBadge: $("#compareBadge"),
  loopCards: $("#loopCards"),
  matrixTable: $("#matrixTable"),
  filterLoop: $("#filterLoop"),
  filterSize: $("#filterSize"),
  filterText: $("#filterText"),
  shipTable: $("#shipTable"),
  overlapCards: $("#overlapCards"),
  compareAdd: $("#compareAdd"),
  compareClear: $("#compareClear"),
  compareBody: $("#compareBody"),
  langButtons: $$(".fm-lang [data-lang]"),
};

let db;      // ship database (shipdb.js)
let state;   // page state (state.js)
let fleet;   // current fleet: { ships, unknown } (analysis.js)

/* ---------- Rendering ---------- */

const ctx = () => ({ db, fleet, state });
const listFilter = () => ({ loop: el.filterLoop.value, size: el.filterSize.value, text: el.filterText.value });

function renderHeader() {
  setLang(state.lang);
  applyStaticTexts();
  el.langButtons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === state.lang));
  el.username.textContent = state.username;
  if (document.activeElement !== el.usernameInput) el.usernameInput.value = state.username;
  el.filterText.placeholder = t("search");
  el.filterText.setAttribute("aria-label", t("search"));
  el.pasteText.placeholder = "Caterpillar\n2x Golem\nStarlancer MAX";
  el.dbInfo.textContent = t("db_info", { n: db.ships.length, date: db.meta.updated });
  el.banner.className = "fm-banner" + (state.ownFleet ? " fm-banner--own" : "");
  el.banner.textContent = state.ownFleet ? t("banner_own", { n: state.items.length }) : t("banner_example");
  $$("[data-icon]").forEach((x) => { x.innerHTML = ICONS[x.dataset.icon] || ""; });
  $$("[data-melt-pair]").forEach((x) => { x.innerHTML = meltPair(x.dataset.meltPair); });
}

function renderCompareArea() {
  el.compareBadge.hidden = !state.compare.length;
  el.compareBadge.textContent = state.compare.length;
  renderCompareSelect(el.compareAdd, ctx());
  renderCompare(el.compareBody, ctx());
}

/** Rebuilds the ship database from ships.json plus the user's local edits (state.overrides). */
function rebuildDb() {
  const { source } = db;
  db = createShipDb(applyOverrides(source.shipsDoc, state.overrides), source.loopsDoc, source.example);
  db.source = source;
}

function renderAll() {
  fleet = buildFleet(state.items, db, state.melt);
  renderHeader();
  const edits = Object.keys(state.overrides).length;
  el.editCount.textContent = edits ? t("edit_count", { n: edits }) : t("edit_count_none");
  el.editExport.disabled = el.editDiscard.disabled = !edits;
  renderKpis(el.kpis, ctx());
  renderLoops(el.loopCards, ctx());
  renderMatrix(el.matrixTable, ctx());
  renderListFilters({ loopSelect: el.filterLoop, sizeSelect: el.filterSize }, ctx());
  renderList(el.shipTable, ctx(), listFilter());
  renderOverlaps(el.overlapCards, ctx());
  renderOvDetails(el.ovDetailsBar, state);
  renderCompareArea();
}

function showView(view) {
  state.view = view;
  save.view(state);
  el.tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
  VIEWS.forEach((v) => { $("#view-" + v).hidden = v !== view; });
  el.ovDetailsBar.hidden = view !== "overlaps"; // chips only belong to the overlaps tab
}

let toastTimer;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.className = "fm-toast" + (isError ? " fm-toast--error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ""; }, 6000);
}

/* ---------- Actions ---------- */

function applyFleet(items, format) {
  state.items = items;
  state.ownFleet = true;
  state.compare = state.compare.filter((n) => db.byName(n));
  state.chosen = {};
  state.marked = [];
  save.marked(state);
  save.fleet(state);
  save.compare(state);
  renderAll();
  toast(t("import_ok", { n: items.length, u: fleet.unknown.length, format }));
}

function toggleCompare(name) {
  const i = state.compare.indexOf(name);
  if (i >= 0) state.compare.splice(i, 1);
  else if (state.compare.length >= MAX_COMPARE) return toast(t("compare_full", { max: MAX_COMPARE }), true);
  else state.compare.push(name);
  save.compare(state);
  $$(".cmp-toggle[data-compare]").forEach((b) => b.setAttribute("aria-pressed", state.compare.includes(b.dataset.compare)));
  renderCompareArea();
}

/* Replacement planning: red = marked to replace (state.marked), green = chosen substitute (state.chosen) */
function setMarks(marked, chosen) {
  state.marked = marked;
  state.chosen = chosen;
  save.marked(state);
  renderLoops(el.loopCards, ctx());
  renderOverlaps(el.overlapCards, ctx());
}
/** Plain click on a name: toggle red. A ship turning red can no longer be anyone's substitute. */
function toggleMark(name) {
  const chosen = { ...state.chosen };
  if (state.marked.includes(name)) {
    delete chosen[name];
    return setMarks(state.marked.filter((n) => n !== name), chosen);
  }
  for (const [from, to] of Object.entries(chosen)) if (to === name) delete chosen[from];
  setMarks([...state.marked, name], chosen);
}
/** Click on a suggested substitute: pick it (green) and mark the replaced ship red; click again to undo. */
function chooseSubstitute(from, to) {
  const chosen = { ...state.chosen };
  if (chosen[from] === to) {
    delete chosen[from];
    return setMarks(state.marked.filter((n) => n !== from), chosen);
  }
  chosen[from] = to;
  // the substitute stays in the fleet: it cannot be red, and it no longer needs a substitute itself
  delete chosen[to];
  setMarks([...new Set([...state.marked.filter((n) => n !== to), from])], chosen);
}

function resetToExample() {
  state.items = exampleItems(db.example);
  state.ownFleet = false;
  state.marked = [];
  state.chosen = {};
  save.marked(state);
  state.username = db.example.username;
  state.compare = [...db.example.compare];
  save.resetFleet();
  save.username(state);
  save.compare(state);
  renderAll();
}

/* ---------- Events ---------- */

/* ---------- Melt status menu ---------- */

let meltShip = null;
let meltMenuScrollY = 0;
/** Opens the small menu next to a clicked lock icon (data-melt="ship name"). */
function openMeltMenu(iconEl) {
  meltShip = iconEl.dataset.melt;
  const ship = fleet.ships.find((s) => s.name === meltShip);
  el.meltMenuTitle.textContent = t("melt_menu_title", { s: meltShip });
  $$("[data-melt-set]", el.meltMenu).forEach((b) =>
    b.setAttribute("aria-checked", b.dataset.meltSet === (ship && ship.meltManual ? ship.melt : "auto")));
  el.meltMenu.hidden = false;
  meltMenuScrollY = scrollY;
  const r = iconEl.getBoundingClientRect();
  const m = el.meltMenu.getBoundingClientRect();
  el.meltMenu.style.left = Math.max(8, Math.min(r.left, innerWidth - m.width - 8)) + "px";
  el.meltMenu.style.top = (r.bottom + m.height + 8 > innerHeight ? r.top - m.height - 4 : r.bottom + 4) + "px";
  el.meltMenu.querySelector("button").focus();
}
function closeMeltMenu() {
  el.meltMenu.hidden = true;
  meltShip = null;
}
function setMelt(name, value) {
  if (value === "auto") delete state.melt[name];
  else state.melt[name] = value;
  save.melt(state);
  closeMeltMenu();
  renderAll();
}

/* ---------- Ship editor ---------- */

function openEditor(name) {
  const ship = db.byName(name);
  if (!ship) return;
  renderEditor(el.editForm, ship, db, !!state.overrides[name]);
  el.editDialog.showModal();
}
/** The entry as it is in ships.json, with the same defaults createShipDb() applies. */
function originalShip(name) {
  const raw = db.source.rawShipsDoc.ships.find((s) => s.name === name);
  return { note: { de: "", en: "" }, beam: null, height: null, length: null, ...raw };
}
function saveOverride(name, diff, message) {
  if (Object.keys(diff).length) state.overrides[name] = diff;
  else delete state.overrides[name];
  save.overrides(state);
  rebuildDb();
  renderAll();
  el.editDialog.close();
  toast(t(message, { s: name }));
}

function wireEvents() {
  // Melt icons sit inside clickable ship names, so they are handled first (capture) and stop the click there
  document.addEventListener("click", (e) => {
    const iconEl = e.target.closest("[data-melt]");
    if (iconEl) { e.preventDefault(); e.stopPropagation(); return openMeltMenu(iconEl); }
    const choice = e.target.closest("[data-melt-set]");
    if (choice && meltShip) return setMelt(meltShip, choice.dataset.meltSet);
    if (!el.meltMenu.hidden && !e.target.closest("#meltMenu")) closeMeltMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.meltMenu.hidden) closeMeltMenu();
    const iconEl = e.target.closest && e.target.closest("[data-melt]");
    if (iconEl && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); openMeltMenu(iconEl); }
  }, true);
  // close the menu when the page is really scrolled (small layout scrolls right after opening are ignored)
  addEventListener("scroll", () => { if (!el.meltMenu.hidden && Math.abs(scrollY - meltMenuScrollY) > 40) closeMeltMenu(); }, { passive: true });

  // Editor: ✎ buttons in the ship list and the compare tab
  [el.shipTable, el.compareBody].forEach((root) => root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]");
    if (b) openEditor(b.dataset.edit);
  }));
  el.editForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.editForm.dataset.ship;
    const result = readEditor(el.editForm);
    const errorBox = el.editForm.querySelector(".ed-error");
    if (result.error) { errorBox.textContent = result.error; errorBox.hidden = false; return; }
    saveOverride(name, diffFromOriginal(originalShip(name), result.values), "edit_saved");
  });
  el.editForm.addEventListener("click", (e) => {
    if (e.target.closest("[data-edit-cancel]")) el.editDialog.close();
    if (e.target.closest("[data-edit-reset]")) saveOverride(el.editForm.dataset.ship, {}, "edit_reverted");
  });
  el.editForm.addEventListener("change", (e) => {
    // colour the role select like the role marks (primary blue, planned purple)
    if (e.target.classList.contains("ed-role")) e.target.className = `ed-role ed-role--${e.target.value || "none"}`;
  });
  el.editExport.addEventListener("click", () => downloadShipsJson(db.source.rawShipsDoc, state.overrides));
  el.editDiscard.addEventListener("click", () => {
    if (!confirm(t("edit_discard_confirm"))) return;
    state.overrides = {};
    save.overrides(state);
    rebuildDb();
    renderAll();
  });

  // Thumbnails that fail to load (offline, blocked) are hidden but keep their space
  // broken thumbnail: try the RSI link once (data-fallback, see thumb()), otherwise hide it
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains("thumb")) return;
    if (img.dataset.fallback) { img.src = img.dataset.fallback; delete img.dataset.fallback; return; }
    img.classList.add("thumb--broken");
  }, true);

  el.langButtons.forEach((b) => b.addEventListener("click", () => {
    state.lang = b.dataset.lang;
    save.lang(state);
    renderAll();
  }));

  el.usernameInput.addEventListener("input", (e) => {
    state.username = e.target.value.trim();
    save.username(state);
    el.username.textContent = state.username;
  });

  el.tabs.forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

  // File import: the format is detected in importers.js
  el.importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let result;
      try { result = importFile(String(reader.result), db); } catch { result = null; }
      if (!result) return toast(t("import_error", { formats: IMPORTERS.map((i) => i.label).join(", ") }), true);
      if (!result.items.length) return toast(t("import_empty"), true);
      if (result.account) { state.username = result.account; save.username(state); }
      applyFleet(result.items, result.format);
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  el.pasteToggle.addEventListener("click", () => {
    el.pasteBox.hidden = !el.pasteBox.hidden;
    if (!el.pasteBox.hidden) el.pasteText.focus();
  });
  el.pasteCancel.addEventListener("click", () => { el.pasteBox.hidden = true; });
  el.pasteApply.addEventListener("click", () => {
    const items = importTextList(el.pasteText.value);
    if (!items.length) return toast(t("import_empty"), true);
    el.pasteBox.hidden = true;
    applyFleet(items, t("import_text"));
  });

  el.resetExample.addEventListener("click", resetToExample);

  // Compare: toggles in the loop cards, dropdown, remove button, clear
  el.loopCards.addEventListener("click", (e) => {
    const b = e.target.closest(".cmp-toggle[data-compare]");
    if (b) toggleCompare(b.dataset.compare);
    const m = e.target.closest("[data-mark]");
    if (m) toggleMark(m.dataset.mark);
  });

  // Overlaps: click a ship name to mark it "to replace"; the analysis is recomputed without it
  // Extra-data chips (sticky bar, overlaps tab)
  el.ovDetailsBar.addEventListener("click", (e) => {
    const d = e.target.closest("[data-ov-detail]");
    if (!d) return;
    const k = d.dataset.ovDetail;
    state.ovDetails = state.ovDetails.includes(k) ? state.ovDetails.filter((x) => x !== k) : [...state.ovDetails, k];
    save.ovDetails(state);
    renderOvDetails(el.ovDetailsBar, state);
    renderOverlaps(el.overlapCards, ctx());
  });
  el.overlapCards.addEventListener("click", (e) => {
    const m = e.target.closest("[data-mark]");
    if (m) toggleMark(m.dataset.mark);
    const c = e.target.closest("[data-choose]");
    if (c) chooseSubstitute(c.dataset.for, c.dataset.choose);
    if (e.target.closest("[data-clear-marks]")) setMarks([], {});

  });
  el.compareAdd.addEventListener("change", (e) => { if (e.target.value) toggleCompare(e.target.value); });
  el.compareBody.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (b) toggleCompare(b.dataset.remove);
  });
  el.compareClear.addEventListener("click", () => {
    state.compare = [];
    save.compare(state);
    renderLoops(el.loopCards, ctx());
    renderCompareArea();
  });

  // Ship list: filters and sorting via click/Enter on the column header
  [el.filterLoop, el.filterSize, el.filterText].forEach((f) => f.addEventListener("input", () => renderList(el.shipTable, ctx(), listFilter())));
  const sortBy = (key) => {
    state.list.sortDir = state.list.sortKey === key ? -state.list.sortDir : 1;
    state.list.sortKey = key;
    renderList(el.shipTable, ctx(), listFilter());
  };
  el.shipTable.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th) sortBy(th.dataset.sort);
  });
  el.shipTable.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset?.sort) sortBy(e.target.dataset.sort);
  });
}

/* ---------- Start ---------- */

async function start() {
  try {
    db = await loadShipDb();
  } catch (err) {
    setLang(location.hash === "#en" ? "en" : storage.get("lang", "de"));
    el.banner.textContent = t("load_error", { msg: err.message });
    return;
  }
  state = loadState(db.example);
  rebuildDb(); // apply local edits from the ship editor
  // #en or #de in the URL sets the language, #loops/#compare … opens a tab
  const hash = location.hash.slice(1);
  if (hash === "de" || hash === "en") state.lang = hash;
  if (VIEWS.includes(hash)) state.view = hash;

  wireEvents();
  renderAll();
  showView(state.view);
}

start();
