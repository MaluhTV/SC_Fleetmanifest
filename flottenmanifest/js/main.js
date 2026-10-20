/**
 * Entry point: loads the data, holds the state and wires the controls to the views.
 *
 * Flow:
 *   1. loadShipDb()  – data/ships.json, loops.json, included.json, example-fleet.json, image-urls.json
 *   2. loadState()   – everything stored in the browser (state.js)
 *   3. renderAll()   – builds the fleet (analysis.js) and renders every view (views/*.js)
 * Every user action changes state, saves it (save.*) and re-renders what changed.
 *
 * Tabs (view ids in state.VIEWS → section #view-<id> in index.html → renderer):
 *   loops     Abdeckung / Coverage     views/loops.js
 *   overlaps  Optimieren / Optimise    views/overlaps.js
 *   planner   Planen / Plan            views/planner.js
 *   compare   Vergleich / Compare      views/compare.js
 *   list      Schiffsliste / Ship list views/list.js (mode "Liste") and views/matrix.js (mode "Matrix")
 *
 * Sections of this file: elements · state · data · rendering · actions · events (wire…) · start.
 * Self-contained page helpers live in js/ui/ (introduction, tap tooltips, sticky area + scroll spy).
 */
import { $, esc, $$, storage, normalizeName } from "./util.js";
import { setLang, t, applyStaticTexts } from "./i18n.js";
import { VERSION } from "./version.js";
import { loadShipDb, createShipDb, applyOverrides, includedIndex } from "./shipdb.js";
import { importFile, importTextList, IMPORTERS } from "./importers.js";
import { buildFleet, plannerSuggestions } from "./analysis.js";
import { loadState, save, exampleItems, MAX_COMPARE, VIEWS, PLANNER_MAX_SLOTS, PLANNER_MAX_PICKS, sanitizeSlot, makeBackup, restoreBackup, BACKUP_FORMAT } from "./state.js";
import { ICONS, meltPair } from "./views/common.js";
import { renderKpis, renderSummary, KPI_FILTERS } from "./views/kpis.js";
import { renderLoops, renderLoopBar } from "./views/loops.js";
import { renderMatrix } from "./views/matrix.js";
import { renderList, renderListFilters, filterRows } from "./views/list.js";
import { renderOverlaps, renderOvDetails, renderOverlapBar } from "./views/overlaps.js";
import { renderCompare, renderCompareSelect } from "./views/compare.js";
import { renderPlanner, renderPlannerForm, planText } from "./views/planner.js";
import { renderEditor, readEditor, diffFromOriginal, downloadShipsJson } from "./views/editor.js";
import { createTour } from "./ui/tour.js";
import { initTapTips } from "./ui/tap-tips.js";
import { initSticky } from "./ui/sticky.js";

/* ---------- Elements (IDs from index.html) ---------- */

const el = {
  // header, toolbar, notices
  langButtons: $$(".fm-lang [data-lang]"),
  username: $("#headerUsername"),
  usernameInput: $("#usernameInput"),
  importOpen: $("#importOpen"),
  importDialog: $("#importDialog"),
  importFile: $("#importFile"),
  importMsg: $("#importMsg"),
  tools: $("#tools"),
  toolsSummary: $("#toolsSummary"),
  pasteToggle: $("#pasteToggle"),
  pasteBox: $("#pasteBox"),
  pasteText: $("#pasteText"),
  pasteApply: $("#pasteApply"),
  pasteCancel: $("#pasteCancel"),
  resetExample: $("#resetExample"),
  imgToggle: $("#imgToggle"),
  imgConsent: $("#imgConsent"),
  dbInfo: $("#dbInfo"),
  banner: $("#banner"),
  toast: $("#toast"),
  mapDialog: $("#mapDialog"),
  // KPIs, tabs, sticky area
  kpis: $("#kpis"),
  fleetSummary: $("#fleetSummary"),
  tabs: $$("#tabs [data-view]"),
  compareBadge: $("#compareBadge"),
  sticky: $(".fm-sticky"),
  bars: $$(".fm-bar[data-bar-for]"),
  loopBar: $("#loopBar"),
  listBar: $("#listBar"),
  overlapBar: $("#overlapBar"),
  plannerBar: $("#plannerBar"),
  ovDetailsBar: $("#ovDetailsBar"),
  // Coverage
  loopCards: $("#loopCards"),
  // Optimise
  overlapCards: $("#overlapCards"),
  // Plan
  plannerForm: $("#plannerForm"),
  plannerLoop: $("#plannerLoop"),
  plannerMin: $("#plannerMin"),
  plannerMax: $("#plannerMax"),
  plannerPresets: $("#plannerPresets"),
  plannerClear: $("#plannerClear"),
  plannerAll: $("#plannerAll"),
  plannerSlots: $("#plannerSlots"),
  // Compare
  compareAdd: $("#compareAdd"),
  compareClear: $("#compareClear"),
  compareBody: $("#compareBody"),
  // Ship list (+ matrix mode, ship editor)
  listMode: $("#listMode"),
  filterLoop: $("#filterLoop"),
  filterSize: $("#filterSize"),
  filterText: $("#filterText"),
  shipBox: $("#shipBox"),
  shipTable: $("#shipTable"),
  matrixBox: $("#matrixBox"),
  matrixTable: $("#matrixTable"),
  editBar: $("#editBar"),
  editCount: $("#editCount"),
  editExport: $("#editExport"),
  editDiscard: $("#editDiscard"),
  editDialog: $("#editDialog"),
  editForm: $("#editForm"),
  // melt status menu
  meltMenu: $("#meltMenu"),
  meltMenuTitle: $("#meltMenuTitle"),
};

/* ---------- State ---------- */

let db;      // ship database (shipdb.js)
let state;   // page state (state.js)
let fleet;   // current fleet: { ships, unknown } (analysis.js)
let spy = { queue() {} }; // sticky area + scroll spy (ui/sticky.js), set in start()

const ctx = () => ({ db, fleet, state });
/** Context for the views the KPI tiles filter (Coverage, ship list): fleet reduced to the tile's ships. */
const viewCtx = () => {
  const keep = KPI_FILTERS[state.kpiFilter];
  return keep ? { db, fleet: { ...fleet, ships: fleet.ships.filter(keep) }, state } : ctx();
};
/** Views that follow the KPI filter; from any other tab a tile click opens the ship list. */
const KPI_VIEWS = ["loops", "list"];
/** Bar square picked in the ship list (a multi slot like "snub--combat" also filters by archetype). */
let listSlot = null;
const listFilter = () => {
  const slot = listSlot && db.slot(listSlot);
  return { loop: el.filterLoop.value, size: el.filterSize.value, text: el.filterText.value, has: slot && slot.id === el.filterLoop.value ? slot.has : null };
};

/* ---------- Data: ship database with local edits and the image setting ---------- */

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // a hangar export is a few KB – refuse huge files instead of freezing the tab
/** Another site's image (RSI) needs consent. Own files (resolved to this origin by loadShipDb) and data: URIs do not. */
const isRemote = (url) => {
  if (typeof url !== "string" || !/^https?:/i.test(url)) return false;
  try { return new URL(url).origin !== location.origin; } catch { return true; }
};

/** Rebuilds the ship database from ships.json plus the user's local edits (state.overrides). */
function rebuildDb() {
  const { source } = db;
  db = createShipDb(applyOverrides(source.shipsDoc, state.overrides), source.loopsDoc, source.example);
  db.source = source;
  db.included = includedIndex(source.includedDoc);
  // Images hotlinked from robertsspaceindustries.com send the visitor's IP address to RSI: they load by default,
  // a notice says so, and the visitor can switch them off (state.rsiImages = false). Local and data: images stay.
  db.hasRemoteImages = db.ships.some((s) => isRemote(s.image) || isRemote(s.imageFallback));
  if (state.rsiImages === false) {
    for (const s of db.ships) {
      if (isRemote(s.imageFallback)) delete s.imageFallback;
      if (isRemote(s.image)) s.image = null;
    }
  }
}

function setRsiImages(on) {
  state.rsiImages = on;
  save.rsiImages(state);
  rebuildDb();
  renderAll();
}

/** Local edits made on an older ships.json (or before 2.22, without a date): they replace the newer roles. */
const staleEdits = () => Object.entries(state.overrides).filter(([name, o]) => db.byName(name) && (!o.base || o.base < db.meta.updated)).map(([name]) => name);
const unknownNames = () => [...new Set(fleet.unknown)];
const nameList = (names) => names.slice(0, 5).join(", ") + (names.length > 5 ? " …" : "");

/* ---------- Rendering ---------- */

function renderAll() {
  fleet = buildFleet(state.items, db, state.melt, state.aliases);
  renderHeader();
  const edits = Object.keys(state.overrides).length;
  el.editCount.textContent = edits ? t("edit_count", { n: edits }) : t("edit_count_none");
  el.editExport.disabled = el.editDiscard.disabled = !edits;
  renderKpis(el.kpis, ctx());
  renderFilterChips();
  renderSummary(el.fleetSummary, ctx());
  renderLoops(el.loopCards, viewCtx());
  renderLoopBar(el.loopBar, viewCtx());
  renderListFilters({ loopSelect: el.filterLoop, sizeSelect: el.filterSize }, ctx());
  renderListArea();
  renderOverlaps(el.overlapCards, ctx());
  renderOverlapBar(el.overlapBar, ctx());
  renderOvDetails(el.ovDetailsBar, state);
  renderCompareArea();
  renderPlannerArea();
}

/** Language, name, toolbar texts, notices and the static icons in index.html. */
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
  // own fleet: the folded toolbar line says it all; example fleet: banner invites to import
  el.banner.hidden = state.ownFleet;
  el.banner.className = "fm-banner";
  el.banner.textContent = state.ownFleet ? "" : t("banner_example");
  el.toolsSummary.textContent = state.ownFleet ? t("tools_summary_own", { n: state.items.length }) : t("tools_summary");
  document.body.classList.toggle("has-own-fleet", state.ownFleet);
  $$("[data-icon]").forEach((x) => { x.innerHTML = ICONS[x.dataset.icon] || ""; });
  $$("[data-melt-pair]").forEach((x) => { x.innerHTML = meltPair(x.dataset.meltPair); });
  $("#appVersion").textContent = `Flottenmanifest ${VERSION}`;
  el.plannerAll.title = t("planner_all_title");
  renderImageConsent();
  renderNotices();
}

/** Notice (until acknowledged) + toolbar switch for the RSI images (only when the data has remote images). */
function renderImageConsent() {
  const on = state.rsiImages !== false;
  el.imgConsent.hidden = !db.hasRemoteImages || state.rsiImages !== null;
  el.imgToggle.hidden = !db.hasRemoteImages;
  el.imgToggle.textContent = t(on ? "img_toggle_on" : "img_toggle_off");
  el.imgToggle.setAttribute("aria-pressed", String(on));
  el.imgToggle.title = t("img_toggle_title");
}

/** "n entries not recognised … Assign" and "n ships use edits from an older database". */
function renderNotices() {
  const unknown = unknownNames();
  $("#unknownNote").hidden = !unknown.length;
  if (unknown.length) $("#unknownText").textContent = t("map_note", { n: unknown.length, list: nameList(unknown) });
  const stale = staleEdits();
  $("#staleNote").hidden = !stale.length;
  if (stale.length) $("#staleText").textContent = t("stale_note", { n: stale.length, list: nameList(stale) });
}

/** Chips "Own ships only ×" / "Only Combat ×" above the filtered views; the archetype filter itself is CSS ([data-group]). */
function renderFilterChips() {
  $$("[data-kpi-clear]").forEach((chip) => {
    chip.hidden = !state.kpiFilter;
    chip.textContent = state.kpiFilter ? t("kpi_filter_chip_" + state.kpiFilter) + " ×" : "";
    chip.title = t("kpi_filter_off");
  });
  if (state.groupFilter) document.body.dataset.groupFilter = state.groupFilter;
  else delete document.body.dataset.groupFilter;
  $$("[data-group-clear]").forEach((chip) => {
    chip.hidden = !state.groupFilter;
    chip.textContent = state.groupFilter ? t("group_chip", { g: t("group_" + state.groupFilter) }) : "";
    chip.title = t("group_filter_off");
  });
  $$("[data-group-pick]").forEach((b) => b.setAttribute("aria-pressed", state.groupFilter === b.dataset.groupPick));
}

/** Ship list tab: table or loop matrix ("Liste | Matrix"); filters, bar and KPI / archetype filters apply to both. */
function renderListArea() {
  const slot = listSlot && db.slot(listSlot);
  const active = slot && slot.id === el.filterLoop.value ? listSlot : el.filterLoop.value || null;
  renderLoopBar(el.listBar, viewCtx(), { attr: "list-filter", active, hint: " · " + t("listbar_hint") });
  const matrix = state.listMode === "matrix";
  el.shipBox.hidden = el.editBar.hidden = matrix;
  el.matrixBox.hidden = !matrix;
  el.listMode.setAttribute("aria-label", t("list_mode"));
  el.listMode.querySelectorAll("[data-list-mode]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.listMode === state.listMode));
  if (matrix) renderMatrix(el.matrixTable, ctx(), filterRows(ctx(), listFilter()), active); // column of the picked square is highlighted
  else renderList(el.shipTable, ctx(), listFilter());
}

function renderPlannerArea() {
  renderPlannerForm({ loopSelect: el.plannerLoop, presets: el.plannerPresets }, ctx());
  el.plannerMax.placeholder = t("planner_open");
  renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
}

function renderCompareArea() {
  el.compareBadge.hidden = !state.compare.length;
  el.compareBadge.textContent = state.compare.length;
  renderCompareSelect(el.compareAdd, ctx());
  renderCompare(el.compareBody, ctx());
}

function showView(view) {
  state.view = view;
  save.view(state);
  el.tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
  VIEWS.forEach((v) => { $("#view-" + v).hidden = v !== view; });
  el.ovDetailsBar.hidden = view !== "overlaps"; // extra-data chips only belong to Optimise
  el.bars.forEach((b) => { b.hidden = b.dataset.barFor !== view; }); // the loop bar of the open tab (sticky quick navigation)
  spy.queue(); // frame the square of the card in view right away
  // phones: the tab row scrolls sideways – bring the active tab into view (without scrolling the page)
  const nav = $("#tabs"), active = el.tabs.find((b) => b.dataset.view === view);
  if (nav && active && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }
}

/** Opens a folded Optimise card (accordion) and scrolls to it. */
function openOverlapCard(card) {
  if (!card) return;
  const d = card.querySelector("details[data-ov-acc]");
  if (d && !d.open) { d.open = true; state.ovOpen.set(d.dataset.ovAcc, true); }
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Phones: which loop bars the user opened (compact row → full bar); re-applied after every render (spy frame). */
const barExpanded = {};
function restoreBarExpanded() {
  el.bars.forEach((b) => {
    const bar = b.querySelector(".cover-bar");
    if (!bar || !barExpanded[b.id]) return;
    bar.classList.add("is-expanded");
    bar.querySelectorAll("[data-bar-expand]").forEach((x) => x.setAttribute("aria-expanded", "true"));
  });
}

let toastTimer;
function toast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.className = "fm-toast" + (isError ? " fm-toast--error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.textContent = ""; }, 6000);
}

/* ---------- Actions ---------- */

/* Fleet: import, example, backup */

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
  if (el.importDialog.open) el.importDialog.close();
  toast(t("import_ok", { n: items.length, u: fleet.unknown.length, format }));
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

/** Import problem: shown in the open import dialog and as a toast. */
function importError(message) {
  el.importMsg.textContent = message;
  el.importMsg.hidden = false;
  toast(message, true);
}

const readJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

/** Everything stored, as one JSON file (move to another device). */
function saveBackup() {
  const blob = new Blob([JSON.stringify(makeBackup(VERSION), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `flottenmanifest-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/** Restores a backup object; returns false if it is none. */
function loadBackup(obj) {
  if (!restoreBackup(obj)) return false;
  state = loadState(db.example);
  rebuildDb();
  renderAll();
  if (el.importDialog.open) el.importDialog.close();
  toast(t("backup_loaded"));
  return true;
}

/* Unknown entries: own assignment to a database ship (state.aliases, fm_aliases) */

/** Best guess for an unknown name: the database ship sharing the most words (name or alias), or "". */
function guessShip(name) {
  const words = new Set(normalizeName(name).split(" ").filter((w) => w.length > 1));
  let best = "", score = 0;
  for (const s of db.ships) {
    for (const label of [s.name, ...s.aliases]) {
      const w = normalizeName(label).split(" ").filter((x) => x.length > 1);
      const hits = w.filter((x) => words.has(x)).length;
      const sc = hits / Math.max(w.length, words.size);
      if (sc > score) { score = sc; best = s.name; }
    }
  }
  return score >= 0.3 ? best : "";
}
function openMapDialog() {
  const options = [...db.ships].sort((a, b) => a.name.localeCompare(b.name));
  const select = (name, value) => `<select data-map-name="${esc(name)}"><option value="">${esc(t("map_none"))}</option>${options.map((s) => `<option value="${esc(s.name)}"${s.name === value ? " selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
  const names = unknownNames();
  $("#mapRows").innerHTML = names.length
    ? names.map((n) => `<label class="map-row"><span>${esc(n)}</span>${select(n, guessShip(n))}</label>`).join("")
    : `<p class="muted">${esc(t("map_all_known"))}</p>`;
  const saved = Object.entries(state.aliases);
  $("#mapSaved").innerHTML = saved.length
    ? `<p><b>${esc(t("map_saved"))}</b></p>` + saved.map(([from, to]) => `<div class="map-row"><span>${esc(from)} → ${esc(to)}</span><button type="button" class="btn btn--icon" data-map-remove="${esc(from)}" title="${esc(t("map_remove"))}" aria-label="${esc(t("map_remove"))}">×</button></div>`).join("")
    : "";
  el.mapDialog.showModal();
}
function applyMapDialog() {
  $$("#mapRows [data-map-name]").forEach((sel) => {
    if (sel.value && db.byName(sel.value)) state.aliases[sel.dataset.mapName] = sel.value;
  });
  save.aliases(state);
  el.mapDialog.close();
  renderAll();
}

/* Filters: KPI tiles (owned / flight-ready / included) and archetype */

function setKpiFilter(filter) {
  state.kpiFilter = filter;
  renderKpis(el.kpis, ctx());
  renderLoops(el.loopCards, viewCtx());
  renderLoopBar(el.loopBar, viewCtx());
  renderListArea();
  renderFilterChips();
  spy.queue();
}
/** Archetype filter (fleet profile, bar group heading, Coverage heading; "Nur Kampf ×" chip clears it). */
function setGroupFilter(group) {
  state.groupFilter = group;
  renderKpis(el.kpis, ctx());
  renderLoops(el.loopCards, viewCtx());
  renderListArea();
  renderFilterChips();
  spy.queue();
}

/* Compare */

function toggleCompare(name) {
  const i = state.compare.indexOf(name);
  if (i >= 0) state.compare.splice(i, 1);
  else if (state.compare.length >= MAX_COMPARE) return toast(t("compare_full", { max: MAX_COMPARE }), true);
  else state.compare.push(name);
  save.compare(state);
  $$(".cmp-toggle[data-compare]").forEach((b) => b.setAttribute("aria-pressed", state.compare.includes(b.dataset.compare)));
  renderCompareArea();
}

/* Plan: wishes { loop, min, max, picks } (state.planner, fm_planner) */

function renderPlannerOnly() { renderPlanner(el.plannerSlots, ctx(), el.plannerBar); }

function togglePick(index, name) {
  const slot = state.planner[index];
  if (!slot || !name) return;
  const i = slot.picks.indexOf(name);
  if (i >= 0) slot.picks.splice(i, 1);
  else if (slot.picks.length >= PLANNER_MAX_PICKS) return toast(t("planner_picks_full", { max: PLANNER_MAX_PICKS }), true);
  else slot.picks.push(name);
  save.planner(state);
  const y = scrollY;
  renderPlannerOnly();
  scrollTo(0, y); // the overview may appear above – keep the tile where it was clicked
  const again = el.plannerSlots.querySelector(`.plan-tile[data-plan-pick="${index}"][data-ship="${CSS.escape(name)}"]`);
  if (again) again.focus({ preventScroll: true });
}

/** Wish for `loop` with the crew range from the form; null (with a toast) if the range is invalid. */
function plannerWish(loop) {
  const max = el.plannerMax.value === "" ? null : Number(el.plannerMax.value);
  const range = sanitizeSlot({ loop, min: Number(el.plannerMin.value), max });
  if (!range || (max !== null && range.max === null)) { toast(t("planner_bad_crew"), true); return null; }
  return range;
}
function addPlannerSlot() {
  const slot = plannerWish(el.plannerLoop.value);
  if (!slot) return;
  if (state.planner.length >= PLANNER_MAX_SLOTS) return toast(t("planner_full", { max: PLANNER_MAX_SLOTS }), true);
  state.planner.push({ ...slot, picks: [] });
  save.planner(state);
  renderPlannerOnly();
}
/**
 * "All categories": one wish per gameplay loop with the crew range from the form (default 1 – open = every ship),
 * in loop order. Loops that already have a wish with that range, or no matching ship, are skipped.
 */
function addAllPlannerSlots() {
  const range = plannerWish(db.loops[0].id); // only the crew range is used
  if (!range) return;
  const has = (loop) => state.planner.some((s) => s.loop === loop && s.min === range.min && s.max === range.max);
  const todo = db.loops.map((l) => l.id)
    .filter((loop) => !has(loop) && plannerSuggestions(db.ships, fleet.ships, { loop, min: range.min, max: range.max }).length);
  if (!todo.length) return toast(t("planner_all_none"));
  const room = PLANNER_MAX_SLOTS - state.planner.length;
  if (room <= 0) return toast(t("planner_full", { max: PLANNER_MAX_SLOTS }), true);
  todo.slice(0, room).forEach((loop) => state.planner.push({ loop, min: range.min, max: range.max, picks: [] }));
  save.planner(state);
  renderPlannerOnly();
  toast(todo.length > room ? t("planner_all_partial", { n: room, max: PLANNER_MAX_SLOTS }) : t("planner_all_added", { n: todo.length }), todo.length > room);
}
/** Copies "My plan" as plain text; falls back to a hidden text area where the Clipboard API is not allowed. */
async function copyPlan() {
  const text = planText(ctx());
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed"; area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast(t("planner_copied"));
}

/* Replacement planning: red = marked to replace (state.marked), green = chosen substitute (state.chosen) */

function setMarks(marked, chosen) {
  state.marked = marked;
  state.chosen = chosen;
  save.marked(state);
  renderLoops(el.loopCards, viewCtx());
  renderOverlaps(el.overlapCards, ctx());
  renderOverlapBar(el.overlapBar, ctx()); // marked ships change overlaps and gaps
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

/* Melt status menu (state.melt, fm_melt) */

let meltShip = null;
let meltMenuScrollY = 0;
/** Opens the small menu next to a clicked melt icon (data-melt="ship name"). */
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

/* Ship editor (state.overrides, fm_overrides) */

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
/** Saves an edit (empty diff = back to the database values); `base` remembers the database date it was made on. */
function saveOverride(name, diff, message) {
  if (Object.keys(diff).length) state.overrides[name] = { ...diff, base: db.meta.updated };
  else delete state.overrides[name];
  save.overrides(state);
  rebuildDb();
  renderAll();
  el.editDialog.close();
  toast(t(message, { s: name }));
}
function dropOverrides(names) {
  names.forEach((n) => delete state.overrides[n]);
  save.overrides(state);
  rebuildDb();
  renderAll();
}

/* ---------- Events (event delegation: views only render, the handlers live here) ---------- */

function wireEvents(tour) {
  initTapTips();
  wireHeader(tour);
  wireImport();
  wireFilters();
  wireCoverage();
  wireOptimise();
  wirePlan();
  wireCompare();
  wireShipList();
  wireMeltMenu();
  wireEditor();
  // broken thumbnail: try the RSI link once (data-fallback, see thumb()), otherwise hide it but keep its space
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains("thumb")) return;
    if (img.dataset.fallback) { img.src = img.dataset.fallback; delete img.dataset.fallback; return; }
    img.classList.add("thumb--broken");
  }, true);
}

/** Language, name, tabs, "Weitere Optionen" (example, introduction, backup, images), notices. */
function wireHeader(tour) {
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
  el.resetExample.addEventListener("click", resetToExample);

  $("#tourStart").addEventListener("click", () => { el.tools.open = false; tour.show(0); });
  addEventListener("resize", tour.place);
  addEventListener("scroll", tour.place, { passive: true });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && tour.isOpen()) tour.end(); });

  $("#backupSave").addEventListener("click", saveBackup);
  $("#backupFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return toast(t("import_too_big", { mb: MAX_IMPORT_BYTES / 1024 / 1024 }), true);
    const reader = new FileReader();
    reader.onload = () => { if (!loadBackup(readJson(String(reader.result)))) toast(t("backup_bad"), true); };
    reader.readAsText(file);
  });

  $("#imgConsentYes").addEventListener("click", () => setRsiImages(true));
  $("#imgConsentNo").addEventListener("click", () => setRsiImages(false));
  el.imgToggle.addEventListener("click", () => setRsiImages(state.rsiImages === false));

  // notice "n entries not recognised" → assignment dialog
  $("#unknownMap").addEventListener("click", openMapDialog);
  $("#mapCancel").addEventListener("click", () => el.mapDialog.close());
  $("#mapApply").addEventListener("click", applyMapDialog);
  el.mapDialog.addEventListener("click", (e) => {
    if (e.target === el.mapDialog) return el.mapDialog.close(); // click on the backdrop
    const r = e.target.closest("[data-map-remove]");
    if (r) { delete state.aliases[r.dataset.mapRemove]; save.aliases(state); renderAll(); openMapDialog(); }
  });
  // notice "edits from an older database": show them in the ship list, or drop only those
  $("#staleShow").addEventListener("click", () => {
    state.listMode = "list";
    showView("list");
    renderListArea();
    el.editBar.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#staleDiscard").addEventListener("click", () => {
    const names = staleEdits();
    if (names.length && confirm(t("stale_discard_confirm", { n: names.length }))) dropOverrides(names);
  });
}

/** Import dialog (file picker + where the files come from), file import, pasted list. */
function wireImport() {
  el.importOpen.addEventListener("click", () => {
    el.importMsg.hidden = true;
    el.importDialog.showModal();
  });
  $("#importClose").addEventListener("click", () => el.importDialog.close());
  el.importDialog.addEventListener("click", (e) => { if (e.target === el.importDialog) el.importDialog.close(); }); // backdrop
  $("#importPaste").addEventListener("click", () => {
    el.importDialog.close();
    el.pasteBox.hidden = false;
    el.pasteText.focus();
  });

  // the format is detected in importers.js; a backup file chosen here is restored as such
  el.importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { e.target.value = ""; return importError(t("import_too_big", { mb: MAX_IMPORT_BYTES / 1024 / 1024 })); }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      if (text.includes(BACKUP_FORMAT) && loadBackup(readJson(text))) return;
      let result;
      try { result = importFile(text, db); } catch { result = null; }
      if (!result) return importError(t("import_error", { formats: IMPORTERS.map((i) => i.label).join(", ") }));
      if (!result.items.length) return importError(t("import_empty"));
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
}

/** KPI tiles, archetype picks, filter chips, the short summary and the phone bar – they appear in several tabs. */
function wireFilters() {
  // KPI tiles filter Coverage and the ship list (second click or a "… ×" chip clears it);
  // from Optimise, Plan or Compare a click opens the ship list
  el.kpis.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-kpi-filter]");
    if (!tile) return;
    setKpiFilter(state.kpiFilter === tile.dataset.kpiFilter ? null : tile.dataset.kpiFilter);
    if (state.kpiFilter && !KPI_VIEWS.includes(state.view)) showView("list");
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-kpi-clear]")) setKpiFilter(null);
    if (e.target.closest("[data-group-clear]")) setGroupFilter(null);
    const g = e.target.closest("[data-group-pick]");
    if (g) setGroupFilter(state.groupFilter === g.dataset.groupPick ? null : g.dataset.groupPick);
    // phones: the compact bar row ("Kampf 5/6") opens the full bar
    const x = e.target.closest("[data-bar-expand]");
    if (x) {
      const bar = x.closest(".cover-bar");
      const on = !bar.classList.contains("is-expanded");
      bar.classList.toggle("is-expanded", on);
      bar.querySelectorAll("[data-bar-expand]").forEach((b) => b.setAttribute("aria-expanded", on));
      barExpanded[bar.closest(".fm-bar")?.id] = on;
    }
    // short summary: "9 overlaps …" opens the tab (and the gaps card)
    const go = e.target.closest("[data-goto]");
    if (go) {
      showView(go.dataset.goto);
      const target = go.dataset.gotoTarget && document.getElementById(go.dataset.gotoTarget);
      if (target) openOverlapCard(target);
      else el.tabs.find((b) => b.dataset.view === go.dataset.goto).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

/** Coverage: bar jumps to the card, ⇄ compare toggles, red marks, "+ n more in a secondary role". */
function wireCoverage() {
  el.loopBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-loop-jump]");
    const card = b && document.getElementById("loop-" + b.dataset.loopJump);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  el.loopCards.addEventListener("click", (e) => {
    const b = e.target.closest(".cmp-toggle[data-compare]");
    if (b) toggleCompare(b.dataset.compare);
    const m = e.target.closest("[data-mark]");
    if (m) toggleMark(m.dataset.mark);
    const more = e.target.closest("[data-loop-expand]");
    if (more) {
      const key = more.dataset.loopExpand, card = more.closest(".loop-card");
      const on = !state.loopExpanded.has(key);
      if (on) state.loopExpanded.add(key); else state.loopExpanded.delete(key);
      card.classList.toggle("is-expanded", on);
      more.setAttribute("aria-expanded", on);
      more.textContent = on ? t("loop_less") : t("loop_more", { n: card.querySelectorAll("tr.row--secondary").length });
    }
  });
}

/** Optimise: extra-data chips, bar and result-card jumps, red marks / green substitutes, folded cards. */
function wireOptimise() {
  el.ovDetailsBar.addEventListener("click", (e) => {
    if (e.target.closest('[data-ov-option="readyFirst"]')) {
      state.ovReadyFirst = !state.ovReadyFirst;
      save.ovReadyFirst(state);
    } else {
      const d = e.target.closest("[data-ov-detail]");
      if (!d) return;
      const k = d.dataset.ovDetail;
      state.ovDetails = state.ovDetails.includes(k) ? state.ovDetails.filter((x) => x !== k) : [...state.ovDetails, k];
      save.ovDetails(state);
    }
    renderOvDetails(el.ovDetailsBar, state);
    renderOverlaps(el.overlapCards, ctx());
  });
  const jump = (b) => openOverlapCard(document.getElementById("ov-" + b.dataset.ovJump) || (b.classList.contains("is-gap") && document.getElementById("ov-gaps")));
  el.overlapBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ov-jump]");
    if (b) jump(b);
  });
  el.overlapCards.addEventListener("click", (e) => {
    const j = e.target.closest("[data-ov-jump]"); // loop bar inside the "result after the changes" card
    if (j) return jump(j);
    const m = e.target.closest("[data-mark]");
    if (m) toggleMark(m.dataset.mark);
    const c = e.target.closest("[data-choose]");
    if (c) chooseSubstitute(c.dataset.for, c.dataset.choose);
    if (e.target.closest("[data-clear-marks]")) setMarks([], {});
    const all = e.target.closest("[data-ov-all]");
    if (all) {
      const on = all.dataset.ovAll === "open";
      el.overlapCards.querySelectorAll("details[data-ov-acc]").forEach((d) => { d.open = on; state.ovOpen.set(d.dataset.ovAcc, on); });
    }
  });
  // remember open / closed across re-renders ("toggle" does not bubble – capture)
  el.overlapCards.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.dataset && d.dataset.ovAcc) state.ovOpen.set(d.dataset.ovAcc, d.open);
  }, true);
}

/** Plan: add a wish (one or all categories), crew presets, remove, pick tiles, copy, bar. */
function wirePlan() {
  el.plannerForm.addEventListener("submit", (e) => { e.preventDefault(); addPlannerSlot(); });
  el.plannerPresets.addEventListener("click", (e) => {
    const b = e.target.closest("[data-crew-preset]");
    if (!b) return;
    const [min, max] = b.dataset.crewPreset.split("-");
    el.plannerMin.value = min;
    el.plannerMax.value = max;
  });
  el.plannerAll.addEventListener("click", addAllPlannerSlots);
  el.plannerClear.addEventListener("click", () => {
    if (!state.planner.length || !confirm(t("planner_clear_confirm"))) return;
    state.planner = [];
    save.planner(state);
    renderPlannerOnly();
  });
  el.plannerSlots.addEventListener("click", (e) => {
    const r = e.target.closest("[data-planner-remove]");
    if (r) {
      state.planner.splice(Number(r.dataset.plannerRemove), 1);
      save.planner(state);
      return renderPlannerOnly();
    }
    const b = e.target.closest(".cmp-toggle[data-compare]");
    if (b) return toggleCompare(b.dataset.compare);
    if (e.target.closest("[data-plan-copy]")) return copyPlan();
    if (e.target.closest("[data-plan-clear]")) {
      state.planner.forEach((slot) => { slot.picks = []; });
      save.planner(state);
      return renderPlannerOnly();
    }
    const p = e.target.closest("[data-plan-pick]");
    if (p) return togglePick(Number(p.dataset.planPick), p.dataset.ship);
  });
  // tiles are checkboxes: Enter / Space toggle them
  el.plannerSlots.addEventListener("keydown", (e) => {
    const p = e.target.closest && e.target.closest(".plan-tile[data-plan-pick]");
    if (!p || e.target !== p || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    togglePick(Number(p.dataset.planPick), p.dataset.ship);
  });
  // bar: pick that loop in the form and jump to its first wish (or to the form)
  el.plannerBar.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cover-loop]");
    if (!c) return;
    const loopId = (db.slot(c.dataset.coverLoop) || { id: c.dataset.coverLoop }).id; // "snub--combat" → snub
    el.plannerLoop.value = loopId;
    const card = el.plannerSlots.querySelector(`.plan-card[data-loop="${CSS.escape(loopId)}"]`);
    (card || el.plannerForm).scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/** Compare: add from the dropdown, remove, clear. */
function wireCompare() {
  el.compareAdd.addEventListener("change", (e) => { if (e.target.value) toggleCompare(e.target.value); });
  el.compareBody.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (b) toggleCompare(b.dataset.remove);
  });
  el.compareClear.addEventListener("click", () => {
    state.compare = [];
    save.compare(state);
    renderLoops(el.loopCards, viewCtx());
    renderCompareArea();
  });
}

/** Ship list: "Liste | Matrix", filters, bar (filter; in the matrix also the column), sorting. */
function wireShipList() {
  el.listMode.addEventListener("click", (e) => {
    const b = e.target.closest("[data-list-mode]");
    if (!b || b.dataset.listMode === state.listMode) return;
    state.listMode = b.dataset.listMode;
    save.listMode(state);
    renderListArea();
  });
  [el.filterLoop, el.filterSize, el.filterText].forEach((f) => f.addEventListener("input", () => { if (f === el.filterLoop) listSlot = null; renderListArea(); }));
  el.listBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-list-filter]");
    if (!b) return;
    const key = b.dataset.listFilter, slot = db.slot(key);
    listSlot = listSlot === key ? null : key; // second click clears
    el.filterLoop.value = listSlot ? slot.id : "";
    renderListArea();
    const th = state.listMode === "matrix" && el.matrixTable.querySelector("th.col-hl");
    if (th) th.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
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

/** Melt icons sit inside clickable ship names, so they are handled first (capture) and stop the click there. */
function wireMeltMenu() {
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
}

/** Ship editor: ✎ buttons (ship list, compare), save / reset / cancel, export as ships.json, discard all. */
function wireEditor() {
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
    if (confirm(t("edit_discard_confirm"))) dropOverrides(Object.keys(state.overrides));
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
  if (hash === "matrix") { state.view = "list"; state.listMode = "matrix"; } // old link to the matrix tab (up to 2.21)

  spy = initSticky({ sticky: el.sticky, tabs: $("#tabs"), bars: el.bars, view: () => state.view, onFrame: restoreBarExpanded });
  const tour = createTour([
    { target: () => el.importOpen, text: "tour_import" },
    { target: () => el.bars.find((b) => !b.hidden) || $("#tabs"), text: "tour_bar" },
    { target: () => $("#tabs"), text: "tour_overlaps" },
  ]);
  wireEvents(tour);
  renderAll();
  if (!storage.get("tour", false)) setTimeout(() => tour.show(0), 400); // first visit
  showView(state.view);
}

start();
