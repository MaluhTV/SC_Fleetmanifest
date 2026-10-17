/**
 * "Fleet planner" tab: the user lists what they want to play ("Salvage, crew 1–2", "Salvage, crew 2+"),
 * and each wish gets a card with matching ships from the whole database – owned ships first.
 * Clicking a tile picks the ship for that wish; "My plan" at the top lists all picks with totals
 * and can be copied as text.
 * The matching rule lives in plannerSuggestions() in js/analysis.js; wishes are state.planner (fm_planner).
 * The form (#plannerForm in index.html) and all clicks are wired in main.js.
 */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { plannerSuggestions, effectiveCrew } from "../analysis.js";
import { loopName, sizeLabel, shipLabel, meltBadge, statusPill, compareToggle, crew, thumb, fighterClass, icon, ICONS } from "./common.js";

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

export function renderPlanner(el, ctx) {
  const { state } = ctx;
  if (!state.planner.length) {
    el.innerHTML = `<div class="cards"><article class="is-info"><p>${t("planner_empty")}</p></article></div>`;
    return;
  }
  const owned = new Set(ctx.fleet.ships.map((s) => s.name));
  const rows = planRows(ctx);
  el.innerHTML = (rows.length ? planOverview(rows, owned, ctx) : `<p class="muted plan-hint">${t("planner_pick_hint")}</p>`) +
    state.planner.map((slot, i) => slotCard(slot, i, ctx, owned)).join("");
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
  const rows = planRows(ctx);
  return ctx.state.planner
    .map((slot) => {
      const ships = rows.filter((r) => r.slot === slot).map((r) => r.ship);
      if (!ships.length) return null;
      const head = `${loopName(db, slot.loop)} · ${t("col_crew")} ${crewRange(slot.min, slot.max)}`;
      return head + "\n" + ships.map((s) =>
        `  - ${s.name} (${sizeLabel(s.size)}, ${fmt(s.scu)} SCU, ${t("col_crew")} ${crew(s)}) – ${owned.has(s.name) ? t("planner_in_fleet") : t("planner_missing")}`).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/** "My plan": every picked ship per wish, then totals over the distinct ships. */
function planOverview(rows, owned, { db }) {
  const distinct = [...new Map(rows.map((r) => [r.ship.name, r.ship])).values()];
  const have = distinct.filter((s) => owned.has(s.name));
  const body = rows.map((r, i) => {
    const first = i === 0 || rows[i - 1].slot !== r.slot;
    const isOwned = owned.has(r.ship.name);
    return `<tr${first ? ' class="plan-group"' : ""}>
      <td>${first ? `${loopName(db, r.slot.loop)} <span class="muted">· ${crewRange(r.slot.min, r.slot.max)}</span>` : ""}</td>
      <td class="plan-ov-ship">${thumb(r.ship, "xs")}${shipLabel(r.ship, { lock: false })}${isOwned ? hangarIcon() : ""}</td>
      <td>${sizeLabel(r.ship.size)}</td>
      <td class="num">${fmt(r.ship.scu)}</td>
      <td class="num">${crew(r.ship)}</td>
      <td>${isOwned ? `<span class="good">${t("planner_in_fleet")}</span>` : `<span class="warn">${t("planner_missing")}</span>`}</td>
      <td><button type="button" class="remove" data-plan-pick="${r.index}" data-ship="${esc(r.ship.name)}" title="${esc(t("planner_unpick"))}" aria-label="${esc(t("planner_unpick") + ": " + r.ship.name)}">×</button></td>
    </tr>`;
  }).join("");
  const scu = distinct.reduce((a, s) => a + s.scu, 0);
  return `<article class="plan-card plan-overview">
    <div class="plan-head">
      <h3>${t("planner_plan_title")}</h3>
      <span class="muted">${t("planner_plan_sum", { n: distinct.length, h: have.length, m: distinct.length - have.length })}</span>
      <span class="plan-actions">
        <button type="button" class="btn" data-plan-copy>${t("planner_copy")}</button>
        <button type="button" class="btn" data-plan-clear>${t("planner_unpick_all")}</button>
      </span>
    </div>
    <div class="table-wrap"><table class="plan-table">
      <thead><tr><th>${t("planner_wish")}</th><th>${t("col_ship")}</th><th>${t("filter_size")}</th><th class="num">SCU</th><th class="num">${t("col_crew")}</th><th>${t("col_status")}</th><th></th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td></td><td>${t("planner_plan_ships", { n: distinct.length })}</td><td></td><td class="num"><b>${fmt(scu)}</b></td><td></td><td colspan="2"></td></tr></tfoot>
    </table></div>
    ${distinct.length < rows.length ? `<p class="muted plan-note">${t("planner_plan_dupes")}</p>` : ""}
  </article>`;
}

function slotCard(slot, index, { db, fleet, state }, owned) {
  const ships = plannerSuggestions(db.ships, fleet.ships, slot);
  const mine = ships.filter((s) => owned.has(s.name));
  const picked = new Set(slot.picks);
  const tile = (s) => planTile(s, { index, isOwned: owned.has(s.name), isPicked: picked.has(s.name), inCompare: state.compare.includes(s.name), loopId: slot.loop });
  // picked ships always stay visible, even if they would be folded away
  const shown = [...ships.slice(0, PLAN_VISIBLE), ...ships.slice(PLAN_VISIBLE).filter((s) => picked.has(s.name))];
  const rest = ships.slice(PLAN_VISIBLE).filter((s) => !picked.has(s.name));

  const fleetLine = mine.length
    ? `<p class="plan-owned">${hangarIcon()} ${t("planner_owned", { n: mine.length })} ${mine.map((s) => esc(s.name)).join(", ")}</p>`
    : `<p class="plan-owned warn">${t("planner_none_owned")}</p>`;
  const pickCount = slot.picks.filter((n) => ships.some((s) => s.name === n)).length;

  return `<article class="plan-card">
    <div class="plan-head">
      <h3>${loopName(db, slot.loop)} <span class="muted">· ${t("col_crew")} ${crewRange(slot.min, slot.max)}</span></h3>
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
 * Owned = green hangar icon next to the name.
 */
function planTile(s, { index, isOwned, isPicked, inCompare, loopId }) {
  const extra = [
    s.status !== "flight-ready" ? statusPill(s.status) : "",
    loopId === "fighter" && s.fighterClass ? `<span class="muted">${fighterClass(s)}</span>` : "",
  ].filter(Boolean).join(" ");
  const label = t(isPicked ? "planner_unpick" : "planner_pick") + ": " + s.name;
  return `<div class="plan-tile${isPicked ? " is-picked" : ""}" role="checkbox" tabindex="0" aria-checked="${isPicked}"
      data-plan-pick="${index}" data-ship="${esc(s.name)}" title="${esc(label)}" aria-label="${esc(label)}">
    <span class="plan-check" aria-hidden="true">${ICONS.check}</span>
    ${thumb(s)}
    <div class="plan-name">${shipLabel(s, { lock: false })}${isOwned ? hangarIcon() + meltBadge(s) : ""}</div>
    <dl class="plan-metrics">
      <div><dt>${t("filter_size")}</dt><dd>${sizeLabel(s.size)}</dd></div>
      <div><dt>SCU</dt><dd>${fmt(s.scu)}</dd></div>
      <div><dt>${t("col_crew")}</dt><dd>${crew(s)}${effectiveCrew(s) !== s.crewMin ? icon("icon--warn plan-eff", ICONS.warn, t("planner_eff_hint")) : ""}</dd></div>
    </dl>
    <div class="plan-foot">${extra}${compareToggle(s.name, inCompare)}</div>
  </div>`;
}
