/**
 * Tab "Planen / Plan" (view id "planner"): the user lists what they want to play ("Salvage, crew 1–2", "Salvage, crew 2+"),
 * and each wish gets a card with matching ships from the whole database – owned ships first.
 * Clicking a tile picks the ship for that wish; "My plan" at the top lists all picks with totals
 * and can be copied as text.
 * The matching rule lives in plannerSuggestions() in js/analysis.js; wishes are state.planner (fm_planner).
 * The form (#plannerForm in index.html) and all clicks are wired in main.js.
 */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { plannerSuggestions, effectiveCrew } from "../analysis.js";
import { loopName, loopText, slotText, loopBar, loopIconTitle, sizeLabel, shipLabel, statusPill, compareToggle, crew, thumb, fighterClass, icon, ICONS } from "./common.js";

/** Tiles shown per wish before the rest is folded away (picked ships are always visible). */
const PLAN_VISIBLE = 12;

/** Ready-made crew ranges for the buttons in the form: [min, max] (null = open). */
export const PLANNER_PRESETS = [[1, 1], [1, 2], [2, 4], [4, null], [8, null]];

export const crewRange = (min, max) => (max == null ? `${min}+` : min === max ? `${min}` : `${min}–${max}`);

/** Green hangar = the ship is in your fleet (planner tiles, plan overview, legend). */
export const hangarIcon = () => icon("icon--hangar", ICONS.hangar, t("planner_in_fleet"));

/** Fills the loop dropdown and the crew preset buttons of the form (keeps the current selection). */
export function renderPlannerForm({ loopSelect, presets }, { db }) {
  const keep = loopSelect.value;
  loopSelect.innerHTML = db.loops.map((l) => `<option value="${esc(l.id)}">${loopName(db, l.id)}</option>`).join("");
  if (keep) loopSelect.value = keep;
  presets.innerHTML = PLANNER_PRESETS.map(([a, b]) =>
    `<button type="button" class="chip" data-crew-preset="${a}-${b ?? ""}">${crewRange(a, b)}</button>`).join("");
}

/** barEl = the planner's loop bar in the sticky area (#plannerBar). */
export function renderPlanner(el, ctx, barEl = null) {
  const { state } = ctx;
  const rows = planRows(ctx);
  if (barEl) barEl.innerHTML = coverageBar(rows, ctx);
  if (!state.planner.length) {
    el.innerHTML = `<div class="cards"><article class="is-info"><p>${t("planner_empty")}</p></article></div>`;
    return;
  }
  const owned = new Set(ctx.fleet.ships.map((s) => s.name));
  const byShip = groupByShip(rows);
  const loopPos = new Map(ctx.db.loops.map((l, i) => [l.id, i]));
  el.innerHTML =
    (rows.length ? planOverview(byShip, owned, ctx) : `<p class="muted plan-hint">${t("planner_pick_hint")}</p>`) +
    // wish cards in the fixed loop order of data/loops.json (same as the bar and the other tabs);
    // wishes of the same loop keep their entry order, the index stays the slot's position in state
    state.planner.map((slot, i) => ({ slot, i, pos: loopPos.get(slot.loop) ?? Infinity }))
      .sort((a, b) => a.pos - b.pos || a.i - b.i)
      .map(({ slot, i }) => slotCard(slot, i, ctx, owned, byShip)).join("");
}

/**
 * One square per display slot (gameplay loop, snub / ground vehicle once per archetype), fixed positions.
 * Filled = at least one ship is selected for a wish of that loop; the number = distinct ships.
 * Clicking a square picks that loop in the form (main.js → data-cover-loop).
 */
function coverageBar(rows, { db, state }) {
  const cells = {};
  for (const slot of db.slots) {
    // a snub / ground vehicle square only counts the picked ships of its archetype
    const n = new Set(rows.filter((r) => r.slot.loop === slot.id && slot.has(r.ship)).map((r) => r.ship.name)).size;
    const name = slotText(db, slot.key); // plain text – loopBar escapes the tooltip
    cells[slot.key] = { multi: slot.multi, n, level: n ? "full" : "", text: `${name}: ${n ? t(n === 1 ? "planner_cover_one" : "planner_cover_n", { n }) : t("planner_cover_none")}` };
  }
  const loops = Object.values(cells).filter((c) => !c.multi);
  const covered = loops.filter((c) => c.n).length;
  return loopBar(db, cells, { attr: "cover-loop", label: t("planner_cover_title"), summary: t("planner_cover_sum", { n: covered, total: loops.length }) });
}

/** Short name of a wish, e.g. "Bergung (Salvage) · 1–2": wishText = plain text, wishLabel = escaped for HTML. */
const wishText = (db, slot) => `${loopText(db, slot.loop)} · ${crewRange(slot.min, slot.max)}`;
const wishLabel = (db, slot) => esc(wishText(db, slot));

/** Picks grouped by ship: Map name → { ship, wishes: [{ slot, index }] }, in the order of first selection. */
function groupByShip(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.ship.name)) map.set(r.ship.name, { ship: r.ship, wishes: [] });
    map.get(r.ship.name).wishes.push({ slot: r.slot, index: r.index });
  }
  return map;
}

/** All picks as rows { slot, index, ship }, in wish order; picks that no longer match a wish are dropped. */
function planRows({ db, fleet, state }) {
  return state.planner.flatMap((slot, index) => {
    const ships = plannerSuggestions(db.ships, fleet.ships, slot);
    return slot.picks.map((n) => ships.find((s) => s.name === n)).filter(Boolean).map((ship) => ({ slot, index, ship }));
  });
}

/** Plain-text version of the plan for the clipboard (main.js → data-plan-copy). */
export function planText(ctx) {
  const { db } = ctx;
  const owned = new Set(ctx.fleet.ships.map((s) => s.name));
  const lines = [...groupByShip(planRows(ctx)).values()].map(({ ship: s, wishes }) =>
    `- ${s.name} (${sizeLabel(s.size)}, ${fmt(s.scu)} SCU, ${t("col_crew")} ${crew(s)}) – ${owned.has(s.name) ? t("planner_in_fleet") : t("planner_missing")}\n` +
    `    ${t("planner_for")}: ${wishes.map((w) => wishText(db, w.slot)).join("; ")}`);
  return `${t("planner_plan_title")}\n\n${lines.join("\n")}`;
}

/** "My plan": one row per selected ship with the scenarios it was chosen for, then the number of ships. */
function planOverview(byShip, owned, { db }) {
  const entries = [...byShip.values()];
  const have = entries.filter((e) => owned.has(e.ship.name));
  const body = entries.map(({ ship, wishes }) => {
    const isOwned = owned.has(ship.name);
    const chips = wishes.map((w) =>
      `<span class="plan-wish">${wishLabel(db, w.slot)}<button type="button" data-plan-pick="${w.index}" data-ship="${esc(ship.name)}" title="${esc(t("planner_unpick"))}" aria-label="${esc(t("planner_unpick") + ": " + ship.name + " – " + wishText(db, w.slot))}">×</button></span>`).join("");
    return `<tr>
      <td class="plan-ov-ship">${thumb(ship, "xs")}${shipLabel(ship)}${isOwned ? hangarIcon() : ""}</td>
      <td><div class="plan-ov-wishes">${chips}</div></td>
      <td>${sizeLabel(ship.size)}</td>
      <td class="num">${fmt(ship.scu)}</td>
      <td class="num">${crew(ship)}</td>
      <td>${isOwned ? `<span class="good">${t("planner_in_fleet")}</span>` : `<span class="warn">${t("planner_missing")}</span>`}</td>
    </tr>`;
  }).join("");
  return `<article class="plan-card plan-overview">
    <div class="plan-head">
      <h3>${t("planner_plan_title")}</h3>
      <span class="muted">${t("planner_plan_sum", { n: entries.length, h: have.length, m: entries.length - have.length })}</span>
      <span class="plan-actions">
        <button type="button" class="btn" data-plan-copy>${t("planner_copy")}</button>
        <button type="button" class="btn" data-plan-clear>${t("planner_unpick_all")}</button>
      </span>
    </div>
    <div class="table-wrap"><table class="plan-table">
      <thead><tr><th>${t("col_ship")}</th><th>${t("planner_for")}</th><th>${t("filter_size")}</th><th class="num">SCU</th><th class="num">${t("col_crew")}</th><th>${t("col_status")}</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="6">${t("planner_plan_ships", { n: entries.length })}</td></tr></tfoot>
    </table></div>
  </article>`;
}

function slotCard(slot, index, { db, fleet, state }, owned, byShip) {
  const ships = plannerSuggestions(db.ships, fleet.ships, slot);
  const mine = ships.filter((s) => owned.has(s.name));
  const picked = new Set(slot.picks);
  // other wishes this ship is already selected for (shown hatched with "Already planned: …")
  const elsewhere = (s) => (byShip.get(s.name)?.wishes || []).filter((w) => w.index !== index).map((w) => wishLabel(db, w.slot));
  const tile = (s) => planTile(s, { index, isOwned: owned.has(s.name), isPicked: picked.has(s.name), elsewhere: elsewhere(s), inCompare: state.compare.includes(s.name), loopId: slot.loop });
  // picked ships always stay visible, even if they would be folded away
  const shown = [...ships.slice(0, PLAN_VISIBLE), ...ships.slice(PLAN_VISIBLE).filter((s) => picked.has(s.name))];
  const rest = ships.slice(PLAN_VISIBLE).filter((s) => !picked.has(s.name));

  const fleetLine = mine.length
    ? `<p class="plan-owned">${hangarIcon()} ${t("planner_owned", { n: mine.length })} ${mine.map((s) => esc(s.name)).join(", ")}</p>`
    : `<p class="plan-owned warn">${t("planner_none_owned")}</p>`;
  const pickCount = slot.picks.filter((n) => ships.some((s) => s.name === n)).length;

  return `<article class="plan-card" data-loop="${esc(slot.loop)}">
    <div class="plan-head">
      <h3>${loopIconTitle(slot.loop)}${loopName(db, slot.loop)} <span class="muted">· ${t("col_crew")} ${crewRange(slot.min, slot.max)}</span></h3>
      <span class="muted">${ships.length === 1 ? t("planner_count_one") : t("planner_count", { n: ships.length })}${pickCount ? ` · <b class="plan-picked-count">${t("planner_picked", { n: pickCount })}</b>` : ""}</span>
      <button type="button" class="remove" data-planner-remove="${index}" title="${esc(t("planner_remove"))}" aria-label="${esc(t("planner_remove"))}">×</button>
    </div>
    ${ships.length ? fleetLine : `<p class="muted">${t("planner_no_match")}</p>`}
    ${ships.length ? `<div class="plan-tiles">${shown.map(tile).join("")}</div>` : ""}
    ${rest.length ? `<details class="plan-more"><summary>${t("planner_more", { n: rest.length })}</summary><div class="plan-tiles">${rest.map(tile).join("")}</div></details>` : ""}
  </article>`;
}

/**
 * One suggestion: image, name, metrics (size, SCU, crew), status, compare toggle.
 * The whole tile is a checkbox (data-plan-pick, handled in main.js): picked = orange frame with a check mark.
 * Owned = green hangar icon next to the name. Selected for another wish = green hatching and "Already planned: …".
 */
function planTile(s, { index, isOwned, isPicked, elsewhere, inCompare, loopId }) {
  const extra = [
    s.status !== "flight-ready" ? statusPill(s.status) : "",
    loopId === "fighter" && s.fighterClass ? `<span class="muted">${fighterClass(s)}</span>` : "",
  ].filter(Boolean).join(" ");
  const label = t(isPicked ? "planner_unpick" : "planner_pick") + ": " + s.name;
  const planned = elsewhere.length ? `<div class="plan-elsewhere">${t("planner_elsewhere")}: ${elsewhere.join("; ")}</div>` : "";
  return `<div class="plan-tile${isPicked ? " is-picked" : ""}${elsewhere.length ? " is-planned" : ""}" role="checkbox" tabindex="0" aria-checked="${isPicked}"
      data-plan-pick="${index}" data-ship="${esc(s.name)}" title="${esc(label)}" aria-label="${esc(label)}">
    <span class="plan-check" aria-hidden="true">${ICONS.check}</span>
    ${thumb(s)}
    <div class="plan-name">${shipLabel(s)}${isOwned ? hangarIcon() : ""}</div>
    <dl class="plan-metrics">
      <div><dt>${t("filter_size")}</dt><dd>${sizeLabel(s.size)}</dd></div>
      <div><dt>SCU</dt><dd>${fmt(s.scu)}</dd></div>
      <div><dt>${t("col_crew")}</dt><dd>${crew(s)}${effectiveCrew(s) !== s.crewMin ? icon("icon--warn plan-eff", ICONS.warn, t("planner_eff_hint")) : ""}</dd></div>
    </dl>
    ${planned}
    <div class="plan-foot">${extra}${compareToggle(s.name, inCompare)}</div>
  </div>`;
}
