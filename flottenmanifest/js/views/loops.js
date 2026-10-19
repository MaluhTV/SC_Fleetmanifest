/** "By gameplay loop" tab: one card per loop with every fleet ship in it. */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { ROLE_ORDER, ARCHETYPES } from "../shipdb.js";
import { loopStats, isPending } from "../analysis.js";
import { ROLE } from "../shipdb.js";
import { slotName, slotText, loopText, loopBar, loopIconTitle, sizeLabel, roleMark, shipLabel, compareToggle, crew, markable, thumb, fighterClass } from "./common.js";

export function renderLoops(el, { db, fleet, state }) {
  // thumbnail column only if at least one fleet ship has an image (data/ships.json → image)
  const thumbs = fleet.ships.some((s) => s.image);
  // one section per archetype; snub and ground vehicle appear in every archetype with that archetype's ships
  // empty slots are not drawn as empty cards but named in one "Not covered: …" line per archetype
  el.innerHTML = ARCHETYPES.map((g) => {
    const slots = db.slots.filter((s) => s.group === g);
    const empty = slots.filter((slot) => !fleet.ships.some((s) => slot.has(s) && s.loops[slot.id]));
    const cards = slots.filter((slot) => !empty.includes(slot)).map((slot) => loopCard(slot, db, fleet.ships.filter(slot.has), state, thumbs)).join("");
    const none = empty.length
      ? `<p class="loop-uncovered g-${g}" data-group="${g}"><b>${t("loop_uncovered")}</b> ${empty.map((slot) => `<span class="loop-uncovered__item" id="loop-${slot.key}">${loopIconTitle(slot.id)}${esc(loopText(db, slot.id))}</span>`).join("")}</p>`
      : "";
    return `<h2 class="loop-group-head g-${g}" id="loopgroup-${g}" data-group="${g}"><button type="button" class="group-pick" data-group-pick="${g}" aria-pressed="${state.groupFilter === g}" title="${esc(t(state.groupFilter === g ? "group_filter_off" : "group_filter_on"))}">${t("group_" + g)}</button></h2>` + none + cards;
  }).join("");
}

/** Secondary roles are folded behind "+ n more" as long as the card also has primary or announced ships. */
const FOLD_MIN_ROWS = 4;

function loopCard(slot, db, ships, state, thumbs) {
  const { compare } = state;
  const loopId = slot.id;
  const st = loopStats(ships, loopId);
  const head = `<div class="loop-card__head"><h3>${loopIconTitle(loopId)}${slotName(db, slot.key)}</h3><span class="muted loop-card__count">${st.all.length} ${t("ships")}</span></div>`;
  const secondary = st.all.filter((s) => s.loops[loopId] === ROLE.SECONDARY).length;
  const fold = secondary && secondary < st.all.length && st.all.length >= FOLD_MIN_ROWS;
  const expanded = state.loopExpanded && state.loopExpanded.has(slot.key);

  // Sort: primary, planned, secondary; within each by SCU and crew, descending
  const rows = [...st.all]
    .sort((a, b) => ROLE_ORDER[a.loops[loopId]] - ROLE_ORDER[b.loops[loopId]] || b.scu - a.scu || b.crewMax - a.crewMax)
    .map((s) => {
      const role = s.loops[loopId];
      return `<tr class="row--${role}">
        <td class="c-mark">${roleMark(role)}</td>
        ${thumbs ? `<td class="thumb-cell">${thumb(s)}</td>` : ""}
        <td class="ship-name">${markable(s, shipLabel(s), state)}</td>
        <td class="c-size">${sizeLabel(s.size)}${loopId === "fighter" && s.fighterClass ? `<br><span class="muted fc-label">${fighterClass(s)}</span>` : ""}</td>
        <td class="num c-scu" data-label="SCU">${fmt(s.scu)}</td>
        <td class="num c-crew" data-label="${esc(t("col_crew"))}">${crew(s)}</td>
        <td class="c-cmp">${compareToggle(s.name, compare.includes(s.name))}</td>
      </tr>`;
    })
    .join("");

  const stats = `<div class="loop-card__stats">
    <span>${t("stat_primary")} <b>${st.primary.length}</b></span>
    <span>${t("stat_secondary")} <b>${st.secondaryCount}</b></span>
    <span>${t("stat_planned")} <b>${st.planned.length}</b></span>
    <span>${t("stat_crew")} <b>${st.primary.length ? `${st.crewMinPrimary}–${st.crewMaxPrimary}` : "–"}</b></span>
    ${loopId === "cargo" ? `<span>${t("stat_scu")} <b>${fmt(st.scuPrimary)}</b></span>` : ""}
  </div>`;

  const more = fold
    ? `<button type="button" class="loop-more" data-loop-expand="${esc(slot.key)}" aria-expanded="${!!expanded}">${expanded ? t("loop_less") : t("loop_more", { n: secondary })}</button>`
    : "";
  return `<div class="loop-card g-${slot.group}${fold ? " is-foldable" : ""}${expanded ? " is-expanded" : ""}" id="loop-${slot.key}" data-group="${slot.group}">${head}${stats}
    <div class="table-wrap"><table>
      <thead><tr><th></th>${thumbs ? "<th></th>" : ""}<th>${t("col_ship")}</th><th>${t("col_size")}</th><th class="num">SCU</th><th class="num">${t("col_crew")}</th><th><span class="visually-hidden">${t("legend_compare")}</span></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>${more}</div>`;
}

/**
 * Fleet coverage per loop for the loop bar (loopBar() in common.js), shared by the loop tab, matrix and ship list.
 * Same meaning as in the overlaps tab: filled = ships in a primary or announced role (number = how many),
 * violet dashed = only announced / not yet playable ships (isPending), dashed = secondary roles only, empty = none.
 */
export function fleetLoopCells(db, fleet) {
  const cells = {};
  for (const slot of db.slots) {
    const id = slot.id;
    const st = loopStats(fleet.ships.filter(slot.has), id);
    const secondary = st.all.filter((s) => s.loops[id] === ROLE.SECONDARY).length;
    const parts = [
      st.primary.length && t("loopbar_primary", { n: st.primary.length }),
      secondary && t("loopbar_secondary", { n: secondary }),
      st.planned.length && t("loopbar_planned", { n: st.planned.length }),
    ].filter(Boolean);
    const core = st.all.filter((s) => s.loops[id] === ROLE.PRIMARY || s.loops[id] === ROLE.PLANNED);
    cells[slot.key] = {
      multi: slot.multi,
      n: core.length || st.all.length,
      level: !core.length ? (st.all.length ? "partial" : "") : core.every((s) => isPending(s, id)) ? "planned" : "full",
      text: `${slotText(db, slot.key)}: ${parts.length ? parts.join(", ") : t("loop_empty")}`,
    };
  }
  return cells;
}

/**
 * Fleet loop bar above a tab. attr = click attribute handled in main.js
 * (loop tab: jump to the card · matrix: highlight the column · ship list: filter), active = selected loop.
 */
export function renderLoopBar(el, { db, fleet }, { attr = "loop-jump", active = null, hint = "" } = {}) {
  const cells = fleetLoopCells(db, fleet);
  // the summary counts gameplay loops; snub / ground vehicle are vehicle types across all archetypes
  const loops = Object.values(cells).filter((c) => !c.multi);
  const full = loops.filter((c) => c.level === "full").length;
  const planned = loops.filter((c) => c.level === "planned").length;
  const summary = t("loopbar_sum", { n: full, total: loops.length }) + (planned ? " · " + t("loopbar_sum_planned", { n: planned }) : "");
  el.innerHTML = loopBar(db, cells, { attr, active, label: t("loopbar_title"), summary: summary + hint });
}
