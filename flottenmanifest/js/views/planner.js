/**
 * "Fleet planner" tab: the user lists what they want to play ("Salvage, crew 1–2", "Salvage, crew 2+"),
 * and each wish gets a card with matching ships from the whole database – owned ships first.
 * The matching rule lives in plannerSuggestions() in js/analysis.js; wishes are state.planner (fm_planner).
 * The form (#plannerForm in index.html) is wired in main.js.
 */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { plannerSuggestions, effectiveCrew } from "../analysis.js";
import { loopName, sizeLabel, shipLabel, meltBadge, statusPill, compareToggle, crew, thumb, fighterClass } from "./common.js";

/** Tiles shown per wish before the rest is folded away. */
const PLAN_VISIBLE = 12;

/** Ready-made crew ranges for the buttons in the form: [min, max] (null = open). */
export const PLANNER_PRESETS = [[1, 1], [1, 2], [2, 4], [4, null], [8, null]];

export const crewRange = (min, max) => (max == null ? `${min}+` : min === max ? `${min}` : `${min}–${max}`);

/** Fills the loop dropdown and the crew preset buttons of the form (keeps the current selection). */
export function renderPlannerForm({ loopSelect, presets }, { db }) {
  const keep = loopSelect.value;
  loopSelect.innerHTML = db.loops.map((l) => `<option value="${esc(l.id)}">${loopName(db, l.id)}</option>`).join("");
  if (keep) loopSelect.value = keep;
  presets.innerHTML = PLANNER_PRESETS.map(([a, b]) =>
    `<button type="button" class="chip" data-crew-preset="${a}-${b ?? ""}">${crewRange(a, b)}</button>`).join("");
}

export function renderPlanner(el, { db, fleet, state }) {
  if (!state.planner.length) {
    el.innerHTML = `<div class="cards"><article class="is-info"><p>${t("planner_empty")}</p></article></div>`;
    return;
  }
  const owned = new Set(fleet.ships.map((s) => s.name));
  el.innerHTML = state.planner.map((slot, i) => slotCard(slot, i, { db, fleet, state, owned })).join("");
}

function slotCard(slot, index, { db, fleet, state, owned }) {
  const ships = plannerSuggestions(db.ships, fleet.ships, slot);
  const mine = ships.filter((s) => owned.has(s.name));
  const tile = (s) => planTile(s, owned.has(s.name), state.compare.includes(s.name), slot.loop);
  const visible = ships.slice(0, PLAN_VISIBLE).map(tile).join("");
  const rest = ships.slice(PLAN_VISIBLE);

  const fleetLine = mine.length
    ? `<p class="plan-owned good">${t("planner_owned", { n: mine.length })} ${mine.map((s) => esc(s.name)).join(", ")}</p>`
    : `<p class="plan-owned warn">${t("planner_none_owned")}</p>`;

  return `<article class="plan-card">
    <div class="plan-head">
      <h3>${loopName(db, slot.loop)} <span class="muted">· ${t("col_crew")} ${crewRange(slot.min, slot.max)}</span></h3>
      <span class="muted">${ships.length === 1 ? t("planner_count_one") : t("planner_count", { n: ships.length })}</span>
      <button type="button" class="remove" data-planner-remove="${index}" title="${esc(t("planner_remove"))}" aria-label="${esc(t("planner_remove"))}">×</button>
    </div>
    ${ships.length ? fleetLine : `<p class="muted">${t("planner_no_match")}</p>`}
    ${ships.length ? `<div class="plan-tiles">${visible}</div>` : ""}
    ${rest.length ? `<details class="plan-more"><summary>${t("planner_more", { n: rest.length })}</summary><div class="plan-tiles">${rest.map(tile).join("")}</div></details>` : ""}
  </article>`;
}

/** One suggestion: image, name, metrics (size, SCU, crew), "in fleet" / status, compare toggle. */
function planTile(s, isOwned, inCompare, loopId) {
  const extra = [
    isOwned ? `<span class="pill pill--flight-ready">${t("compare_owned")}</span>` : "",
    s.status !== "flight-ready" ? statusPill(s.status) : "",
    loopId === "fighter" && s.fighterClass ? `<span class="muted">${fighterClass(s)}</span>` : "",
  ].filter(Boolean).join(" ");
  return `<div class="plan-tile${isOwned ? " is-owned" : ""}">
    ${thumb(s)}
    <div class="plan-name">${shipLabel(s, { lock: false })}${isOwned ? meltBadge(s) : ""}</div>
    <dl class="plan-metrics">
      <div><dt>${t("filter_size")}</dt><dd>${sizeLabel(s.size)}</dd></div>
      <div><dt>SCU</dt><dd>${fmt(s.scu)}</dd></div>
      <div><dt>${t("col_crew")}</dt><dd>${crew(s)}${effectiveCrew(s) !== s.crewMin ? `<span class="plan-eff" title="${esc(t("planner_eff_hint"))}">${t("planner_eff", { n: effectiveCrew(s) })}</span>` : ""}</dd></div>
    </dl>
    <div class="plan-foot">${extra}${compareToggle(s.name, inCompare)}</div>
  </div>`;
}
