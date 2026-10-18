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
import { loadShipDb, createShipDb, applyOverrides , includedIndex } from "./shipdb.js";
import { renderEditor, readEditor, diffFromOriginal, downloadShipsJson } from "./views/editor.js";
import { importFile, importTextList, IMPORTERS } from "./importers.js";
import { buildFleet, plannerSuggestions } from "./analysis.js";
import { loadState, save, exampleItems, MAX_COMPARE, VIEWS, PLANNER_MAX_SLOTS, PLANNER_MAX_PICKS, sanitizeSlot } from "./state.js";
import { ICONS, meltPair } from "./views/common.js";
import { renderKpis } from "./views/kpis.js";
import { renderLoops, renderLoopBar } from "./views/loops.js";
import { renderMatrix } from "./views/matrix.js";
import { renderList, renderListFilters } from "./views/list.js";
import { renderOverlaps, renderOvDetails, renderOverlapBar } from "./views/overlaps.js";
import { renderCompare, renderCompareSelect } from "./views/compare.js";
import { renderPlanner, renderPlannerForm, planText } from "./views/planner.js";

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
  imgConsent: $("#imgConsent"),
  tools: $("#tools"),
  importDialog: $("#importDialog"),
  importMsg: $("#importMsg"),
  toolsSummary: $("#toolsSummary"),
  imgToggle: $("#imgToggle"),
  dbInfo: $("#dbInfo"),
  banner: $("#banner"),
  toast: $("#toast"),
  kpis: $("#kpis"),
  tabs: $$("#tabs [data-view]"),
  compareBadge: $("#compareBadge"),
  loopCards: $("#loopCards"),
  loopBar: $("#loopBar"),
  matrixBar: $("#matrixBar"),
  listBar: $("#listBar"),
  overlapBar: $("#overlapBar"),
  plannerBar: $("#plannerBar"),
  sticky: $(".fm-sticky"),
  bars: $$(".fm-bar[data-bar-for]"),
  plannerForm: $("#plannerForm"),
  plannerLoop: $("#plannerLoop"),
  plannerMin: $("#plannerMin"),
  plannerMax: $("#plannerMax"),
  plannerPresets: $("#plannerPresets"),
  plannerClear: $("#plannerClear"),
  plannerAll: $("#plannerAll"),
  plannerSlots: $("#plannerSlots"),
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
  // own fleet: the folded toolbar line says it all; example fleet: banner invites to import
  el.banner.hidden = state.ownFleet;
  el.banner.className = "fm-banner";
  el.banner.textContent = state.ownFleet ? "" : t("banner_example");
  el.toolsSummary.textContent = state.ownFleet ? t("tools_summary_own", { n: state.items.length }) : t("tools_summary");
  document.body.classList.toggle("has-own-fleet", state.ownFleet);
  $$("[data-icon]").forEach((x) => { x.innerHTML = ICONS[x.dataset.icon] || ""; });
  renderImageConsent();
  el.plannerAll.title = t("planner_all_title");
  $$("[data-melt-pair]").forEach((x) => { x.innerHTML = meltPair(x.dataset.meltPair); });
}

function renderCompareArea() {
  el.compareBadge.hidden = !state.compare.length;
  el.compareBadge.textContent = state.compare.length;
  renderCompareSelect(el.compareAdd, ctx());
  renderCompare(el.compareBody, ctx());
}

/** Rebuilds the ship database from ships.json plus the user's local edits (state.overrides). */
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
// another site's image (RSI): needs consent. Own files (resolved to this origin by loadShipDb) and data: URIs do not.
const isRemote = (url) => {
  if (typeof url !== "string" || !/^https?:/i.test(url)) return false;
  try { return new URL(url).origin !== location.origin; } catch { return true; }
};

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

/** Notice (until acknowledged) + toolbar switch for the RSI images (only when the data has remote images). */
function renderImageConsent() {
  const show = db.hasRemoteImages;
  const on = state.rsiImages !== false;
  el.imgConsent.hidden = !show || state.rsiImages !== null;
  el.imgToggle.hidden = !show;
  el.imgToggle.textContent = t(on ? "img_toggle_on" : "img_toggle_off");
  el.imgToggle.setAttribute("aria-pressed", String(on));
  el.imgToggle.title = t("img_toggle_title");
}

/** Import problem: shown in the open import dialog and as a toast. */
function importError(message) {
  el.importMsg.textContent = message;
  el.importMsg.hidden = false;
  toast(message, true);
}

function setRsiImages(on) {
  state.rsiImages = on;
  save.rsiImages(state);
  rebuildDb();
  renderAll();
}

function renderAll() {
  fleet = buildFleet(state.items, db, state.melt);
  renderHeader();
  const edits = Object.keys(state.overrides).length;
  el.editCount.textContent = edits ? t("edit_count", { n: edits }) : t("edit_count_none");
  el.editExport.disabled = el.editDiscard.disabled = !edits;
  renderKpis(el.kpis, ctx());
  renderLoops(el.loopCards, ctx());
  renderLoopBar(el.loopBar, ctx());
  renderMatrixArea();
  renderListFilters({ loopSelect: el.filterLoop, sizeSelect: el.filterSize }, ctx());
  renderListArea();
  renderOverlaps(el.overlapCards, ctx());
  renderOverlapBar(el.overlapBar, ctx());
  renderOvDetails(el.ovDetailsBar, state);
  renderCompareArea();
  renderPlannerArea();
}

/* Loop bars above the matrix (highlight a column) and the ship list (filter by loop) */
let matrixHl = null;
function renderMatrixArea() {
  renderLoopBar(el.matrixBar, ctx(), { attr: "matrix-hl", active: matrixHl });
  renderMatrix(el.matrixTable, ctx(), matrixHl);
}
function renderListArea() {
  const chip = $("#kpiFilterChip");
  chip.hidden = !state.kpiFilter;
  chip.textContent = state.kpiFilter ? t("kpi_filter_chip_" + state.kpiFilter) + " ×" : "";
  chip.title = t("kpi_filter_off");
  renderLoopBar(el.listBar, ctx(), { attr: "list-filter", active: el.filterLoop.value || null, hint: " · " + t("listbar_hint") });
  renderList(el.shipTable, ctx(), listFilter());
}

function renderPlannerArea() {
  renderPlannerForm({ loopSelect: el.plannerLoop, presets: el.plannerPresets }, ctx());
  el.plannerMax.placeholder = t("planner_open");
  renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
}

function showView(view) {
  state.view = view;
  save.view(state);
  el.tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
  VIEWS.forEach((v) => { $("#view-" + v).hidden = v !== view; });
  el.ovDetailsBar.hidden = view !== "overlaps"; // chips only belong to the overlaps tab
  el.bars.forEach((b) => { b.hidden = b.dataset.barFor !== view; }); // the loop bar of the open tab (sticky quick navigation)
  queueSpy(); // frame the square of the card in view right away
  // phones: the tab row scrolls sideways – bring the active tab into view (without scrolling the page)
  const nav = $("#tabs"), active = el.tabs.find((b) => b.dataset.view === view);
  if (nav && active && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }
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
  if (el.importDialog.open) el.importDialog.close();
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

/* Fleet planner: wishes { loop, min, max, picks } (state.planner, fm_planner) */
function togglePick(index, name) {
  const slot = state.planner[index];
  if (!slot || !name) return;
  const i = slot.picks.indexOf(name);
  if (i >= 0) slot.picks.splice(i, 1);
  else if (slot.picks.length >= PLANNER_MAX_PICKS) return toast(t("planner_picks_full", { max: PLANNER_MAX_PICKS }), true);
  else slot.picks.push(name);
  save.planner(state);
  const y = scrollY;
  renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
  scrollTo(0, y); // the overview may appear above – keep the tile where it was clicked
  const again = el.plannerSlots.querySelector(`.plan-tile[data-plan-pick="${index}"][data-ship="${CSS.escape(name)}"]`);
  if (again) again.focus({ preventScroll: true });
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
function addPlannerSlot() {
  const max = el.plannerMax.value === "" ? null : Number(el.plannerMax.value);
  const slot = sanitizeSlot({ loop: el.plannerLoop.value, min: Number(el.plannerMin.value), max });
  if (!slot || (max !== null && slot.max === null)) return toast(t("planner_bad_crew"), true);
  if (state.planner.length >= PLANNER_MAX_SLOTS) return toast(t("planner_full", { max: PLANNER_MAX_SLOTS }), true);
  state.planner.push({ ...slot, picks: [] });
  save.planner(state);
  renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
}

/**
 * "All categories": one wish per gameplay loop with the crew range from the form (default 1 – open = every ship),
 * in loop order. Loops that already have a wish with that range, or no matching ship, are skipped.
 */
function addAllPlannerSlots() {
  const max = el.plannerMax.value === "" ? null : Number(el.plannerMax.value);
  const range = sanitizeSlot({ loop: "x", min: Number(el.plannerMin.value), max });
  if (!range || (max !== null && range.max === null)) return toast(t("planner_bad_crew"), true);
  const has = (loop) => state.planner.some((s) => s.loop === loop && s.min === range.min && s.max === range.max);
  const todo = db.loops.map((l) => l.id)
    .filter((loop) => !has(loop) && plannerSuggestions(db.ships, fleet.ships, { loop, min: range.min, max: range.max }).length);
  if (!todo.length) return toast(t("planner_all_none"));
  const room = PLANNER_MAX_SLOTS - state.planner.length;
  if (room <= 0) return toast(t("planner_full", { max: PLANNER_MAX_SLOTS }), true);
  todo.slice(0, room).forEach((loop) => state.planner.push({ loop, min: range.min, max: range.max, picks: [] }));
  save.planner(state);
  renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
  toast(todo.length > room ? t("planner_all_partial", { n: room, max: PLANNER_MAX_SLOTS }) : t("planner_all_added", { n: todo.length }), todo.length > room);
}

/* Replacement planning: red = marked to replace (state.marked), green = chosen substitute (state.chosen) */
function setMarks(marked, chosen) {
  state.marked = marked;
  state.chosen = chosen;
  save.marked(state);
  renderLoops(el.loopCards, ctx());
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

/**
 * Scroll spy: frames the loop-bar square of the card currently at the top of the view
 * (loop tab, overlaps, planner – tabs whose cards belong to one loop each).
 */
const SPY = {
  loops: { cards: "#loopCards .loop-card[id^='loop-']", id: (c) => c.id.slice(5), bar: "loopBar", attr: "loopJump" },
  overlaps: { cards: "#overlapCards article[id^='ov-']:not(#ov-gaps)", id: (c) => c.id.slice(3), bar: "overlapBar", attr: "ovJump" },
  planner: { cards: "#plannerSlots .plan-card[data-loop]", id: (c) => c.dataset.loop, bar: "plannerBar", attr: "coverLoop" },
};
/** Height of what stays fixed at the top: the whole sticky block, or on phones (display: contents) tabs + loop bar. */
function stickyArea() {
  if (getComputedStyle(el.sticky).display !== "contents") return el.sticky.offsetHeight;
  const bar = el.bars.find((b) => !b.hidden);
  return $("#tabs").offsetHeight + (bar ? bar.offsetHeight : 0);
}
/** Viewport y of the lower edge of the fixed top area. */
function stickyBottom() {
  if (getComputedStyle(el.sticky).display !== "contents") return el.sticky.getBoundingClientRect().bottom;
  const bar = el.bars.find((b) => !b.hidden);
  return Math.max($("#tabs").getBoundingClientRect().bottom, bar ? bar.getBoundingClientRect().bottom : 0);
}

function spyCurrent() {
  const spy = SPY[state.view];
  if (!spy) return;
  const line = stickyBottom() + 24;
  const cards = $$(spy.cards);
  // the last row of cards whose top has passed the line under the sticky area (otherwise the first card);
  // cards side by side share a row – then the one picked in the bar wins, else the leftmost
  let rowTop = null;
  for (const c of cards) { const top = c.getBoundingClientRect().top; if (top <= line && (rowTop === null || top > rowTop)) rowTop = top; }
  const row = rowTop === null ? cards.slice(0, 1) : cards.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 2);
  const current = row.find((c) => spy.id(c) === spyPicked) || row[0];
  const id = current ? spy.id(current) : null;
  el[spy.bar].querySelectorAll(".cover-item").forEach((b) => b.classList.toggle("is-current", b.dataset[spy.attr] === id));
}
let spyPicked = null; // loop last clicked in a bar
let spyQueued = false;
const queueSpy = () => { if (!spyQueued) { spyQueued = true; requestAnimationFrame(() => { spyQueued = false; spyCurrent(); }); } };

function wireEvents() {
  addEventListener("scroll", queueSpy, { passive: true });
  document.addEventListener("click", (e) => {
    const item = e.target.closest(".fm-bar .cover-item");
    const spy = SPY[state.view];
    if (item && spy) spyPicked = item.dataset[spy.attr];
  }, true);
  // bars are re-rendered often – frame the current square again afterwards
  new MutationObserver(queueSpy).observe(el.sticky, { childList: true, subtree: true });
  // height of the sticky area (tabs, legend, loop bar) as --fm-sticky-h, so jump targets land below it;
  // on phones only the tabs and the loop bar stick (CSS), the tab height positions the bar below them
  const stickyHeight = () => {
    const root = document.documentElement.style;
    root.setProperty("--fm-tabs-h", $("#tabs").offsetHeight + "px");
    root.setProperty("--fm-sticky-h", stickyArea() + "px");
  };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(stickyHeight);
    [el.sticky, $("#tabs"), ...el.bars].forEach((x) => ro.observe(x));
  }
  stickyHeight();

  // Touch screens have no hover, so title texts never show up: a tap shows them in a small bubble instead
  // (the tap still does its normal job, e.g. jump to a loop or mark a ship)
  const noHover = window.matchMedia ? matchMedia("(hover: none)") : { matches: false };
  let tip = null, tipTimer, tipSticky = false; // tipSticky: host stays in place while the page scrolls (loop bar)
  const hideTip = () => { if (tip) { tip.remove(); tip = null; } clearTimeout(tipTimer); };
  document.addEventListener("click", (e) => {
    hideTip();
    if (!noHover.matches) return;
    const host = e.target.closest("[title]");
    if (!host || host.matches("input, select, textarea, [data-melt]") || host.closest(".fm-melt-menu, dialog")) return;
    const text = host.getAttribute("title");
    if (!text) return;
    tipSticky = !!host.closest(".fm-bar");
    tip = document.createElement("div");
    tip.className = "fm-tip";
    tip.setAttribute("role", "status");
    tip.textContent = text; // plain text – never parsed as HTML
    document.body.append(tip);
    const r = host.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const top = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    tipTimer = setTimeout(hideTip, 3500);
  }, true);
  addEventListener("scroll", () => { if (!tipSticky) hideTip(); }, { passive: true });

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
    // a hangar export is a few KB – refuse huge files instead of freezing the tab
    if (file.size > MAX_IMPORT_BYTES) { e.target.value = ""; return importError(t("import_too_big", { mb: MAX_IMPORT_BYTES / 1024 / 1024 })); }
    const reader = new FileReader();
    reader.onload = () => {
      let result;
      try { result = importFile(String(reader.result), db); } catch { result = null; }
      if (!result) return importError(t("import_error", { formats: IMPORTERS.map((i) => i.label).join(", ") }));
      if (!result.items.length) return importError(t("import_empty"));
      if (result.account) { state.username = result.account; save.username(state); }
      applyFleet(result.items, result.format);
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // Import dialog: file picker + where the files come from
  el.importOpen = $("#importOpen");
  el.importOpen.addEventListener("click", () => {
    el.importMsg.hidden = true;
    el.importDialog.showModal();
  });
  $("#importClose").addEventListener("click", () => el.importDialog.close());
  el.importDialog.addEventListener("click", (e) => { if (e.target === el.importDialog) el.importDialog.close(); }); // click on the backdrop
  $("#importPaste").addEventListener("click", () => {
    el.importDialog.close();
    el.pasteBox.hidden = false;
    el.pasteText.focus();
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
  // KPI tiles filter the ship list (second click or the chip in the list clears it)
  el.kpis.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-kpi-filter]");
    if (!tile) return;
    state.kpiFilter = state.kpiFilter === tile.dataset.kpiFilter ? null : tile.dataset.kpiFilter;
    renderKpis(el.kpis, ctx());
    renderListArea();
    if (state.kpiFilter) {
      showView("list");
      $("#view-list").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("#kpiFilterChip").addEventListener("click", () => {
    state.kpiFilter = null;
    renderKpis(el.kpis, ctx());
    renderListArea();
  });
  $("#imgConsentYes").addEventListener("click", () => setRsiImages(true));
  $("#imgConsentNo").addEventListener("click", () => setRsiImages(false));
  el.imgToggle.addEventListener("click", () => setRsiImages(state.rsiImages === false));

  // Loop bar: jump to the card of that loop
  el.loopBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-loop-jump]");
    const card = b && document.getElementById("loop-" + b.dataset.loopJump);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
    if (e.target.closest('[data-ov-option="readyFirst"]')) {
      state.ovReadyFirst = !state.ovReadyFirst;
      save.ovReadyFirst(state);
      renderOvDetails(el.ovDetailsBar, state);
      renderOverlaps(el.overlapCards, ctx());
      return;
    }
    const d = e.target.closest("[data-ov-detail]");
    if (!d) return;
    const k = d.dataset.ovDetail;
    state.ovDetails = state.ovDetails.includes(k) ? state.ovDetails.filter((x) => x !== k) : [...state.ovDetails, k];
    save.ovDetails(state);
    renderOvDetails(el.ovDetailsBar, state);
    renderOverlaps(el.overlapCards, ctx());
  });
  el.overlapCards.addEventListener("click", (e) => {
    // loop bar inside the "result after the changes" card: jump like the bar above the tab
    const j = e.target.closest("[data-ov-jump]");
    if (j) {
      const card = document.getElementById("ov-" + j.dataset.ovJump) || (j.classList.contains("is-gap") && document.getElementById("ov-gaps"));
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const m = e.target.closest("[data-mark]");
    if (m) toggleMark(m.dataset.mark);
    const c = e.target.closest("[data-choose]");
    if (c) chooseSubstitute(c.dataset.for, c.dataset.choose);
    if (e.target.closest("[data-clear-marks]")) setMarks([], {});

  });
  // Fleet planner: add a wish, crew presets, remove, compare toggles on the tiles
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
    renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
  });
  el.plannerSlots.addEventListener("click", (e) => {
    const r = e.target.closest("[data-planner-remove]");
    if (r) {
      state.planner.splice(Number(r.dataset.plannerRemove), 1);
      save.planner(state);
      return renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
    }
    const b = e.target.closest(".cmp-toggle[data-compare]");
    if (b) return toggleCompare(b.dataset.compare);
    if (e.target.closest("[data-plan-copy]")) return copyPlan();
    if (e.target.closest("[data-plan-clear]")) {
      state.planner.forEach((slot) => { slot.picks = []; });
      save.planner(state);
      return renderPlanner(el.plannerSlots, ctx(), el.plannerBar);
    }
    const p = e.target.closest("[data-plan-pick]");
    if (p) return togglePick(Number(p.dataset.planPick), p.dataset.ship);
  });
  // planner loop bar: pick that loop in the form and jump to its first wish (or to the form)
  el.plannerBar.addEventListener("click", (e) => {
    const c = e.target.closest("[data-cover-loop]");
    if (!c) return;
    el.plannerLoop.value = c.dataset.coverLoop;
    const card = el.plannerSlots.querySelector(`.plan-card[data-loop="${CSS.escape(c.dataset.coverLoop)}"]`);
    (card || el.plannerForm).scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // tiles are checkboxes: Enter / Space toggle them
  el.plannerSlots.addEventListener("keydown", (e) => {
    const p = e.target.closest && e.target.closest(".plan-tile[data-plan-pick]");
    if (!p || e.target !== p || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    togglePick(Number(p.dataset.planPick), p.dataset.ship);
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
  [el.filterLoop, el.filterSize, el.filterText].forEach((f) => f.addEventListener("input", renderListArea));
  // loop bars: matrix = highlight the column, ship list = filter (second click clears), overlaps = jump to the card
  el.matrixBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-matrix-hl]");
    if (!b) return;
    matrixHl = matrixHl === b.dataset.matrixHl ? null : b.dataset.matrixHl;
    renderMatrixArea();
    const th = el.matrixTable.querySelector("th.col-hl");
    if (th) th.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  el.listBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-list-filter]");
    if (!b) return;
    el.filterLoop.value = el.filterLoop.value === b.dataset.listFilter ? "" : b.dataset.listFilter;
    renderListArea();
  });
  el.overlapBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ov-jump]");
    if (!b) return;
    const card = document.getElementById("ov-" + b.dataset.ovJump) || (b.classList.contains("is-gap") && document.getElementById("ov-gaps"));
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
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
