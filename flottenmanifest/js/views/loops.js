/** "By gameplay loop" tab: one card per loop with every fleet ship in it. */
import { t, fmt } from "../i18n.js";
import { ROLE_ORDER } from "../shipdb.js";
import { loopStats } from "../analysis.js";
import { ROLE } from "../shipdb.js";
import { loopName, loopText, loopBar, sizeLabel, roleMark, shipLabel, compareToggle, crew, markable, thumb, fighterClass } from "./common.js";

export function renderLoops(el, { db, fleet, state }) {
  // thumbnail column only if at least one fleet ship has an image (data/ships.json → image)
  const thumbs = fleet.ships.some((s) => s.image);
  el.innerHTML = db.loops.map(({ id }) => loopCard(id, db, fleet.ships, state, thumbs)).join("");
}

function loopCard(loopId, db, ships, state, thumbs) {
  const { compare } = state;
  const st = loopStats(ships, loopId);
  const head = `<div class="loop-card__head"><h3>${loopName(db, loopId)}</h3><span class="muted loop-card__count">${st.all.length} ${t("ships")}</span></div>`;
  if (!st.all.length) return `<div class="loop-card" id="loop-${loopId}">${head}<p class="muted">${t("loop_empty")}</p></div>`;

  // Sort: primary, planned, secondary; within each by SCU and crew, descending
  const rows = [...st.all]
    .sort((a, b) => ROLE_ORDER[a.loops[loopId]] - ROLE_ORDER[b.loops[loopId]] || b.scu - a.scu || b.crewMax - a.crewMax)
    .map((s) => {
      const role = s.loops[loopId];
      return `<tr class="row--${role}">
        <td>${roleMark(role)}</td>
        ${thumbs ? `<td class="thumb-cell">${thumb(s)}</td>` : ""}
        <td class="ship-name">${markable(s, shipLabel(s), state)}</td>
        <td>${sizeLabel(s.size)}${loopId === "fighter" && s.fighterClass ? `<br><span class="muted fc-label">${fighterClass(s)}</span>` : ""}</td>
        <td class="num">${fmt(s.scu)}</td>
        <td class="num">${crew(s)}</td>
        <td>${compareToggle(s.name, compare.includes(s.name))}</td>
      </tr>`;
    })
    .join("");

  const stats = `<div class="loop-card__stats">
    <span>${t("stat_primary")} <b>${st.primary.length}</b></span>
    <span>${t("stat_secondary")} <b>${st.secondaryCount}</b></span>
    <span>${t("stat_planned")} <b>${st.planned.length}</b></span>
    <span>${t("stat_crew")} <b>${st.crewMinPrimary}–${st.crewMaxPrimary}</b></span>
    ${loopId === "cargo" ? `<span>${t("stat_scu")} <b>${fmt(st.scuPrimary)}</b></span>` : ""}
  </div>`;

  return `<div class="loop-card" id="loop-${loopId}">${head}${stats}
    <div class="table-wrap"><table>
      <thead><tr><th></th>${thumbs ? "<th></th>" : ""}<th>${t("col_ship")}</th><th>${t("col_size")}</th><th class="num">SCU</th><th class="num">${t("col_crew")}</th><th><span class="visually-hidden">${t("legend_compare")}</span></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>`;
}

/**
 * Fleet coverage per loop for the loop bar (loopBar() in common.js), shared by the loop tab, matrix and ship list.
 * Filled = ships in a primary role (number = how many), dashed = only secondary or planned roles, empty = none.
 */
export function fleetLoopCells(db, fleet) {
  const cells = {};
  for (const { id } of db.loops) {
    const st = loopStats(fleet.ships, id);
    const secondary = st.all.filter((s) => s.loops[id] === ROLE.SECONDARY).length;
    const parts = [
      st.primary.length && t("loopbar_primary", { n: st.primary.length }),
      secondary && t("loopbar_secondary", { n: secondary }),
      st.planned.length && t("loopbar_planned", { n: st.planned.length }),
    ].filter(Boolean);
    cells[id] = {
      n: st.primary.length || st.all.length,
      level: st.primary.length ? "full" : st.all.length ? "partial" : "",
      text: `${loopText(db, id)}: ${parts.length ? parts.join(", ") : t("loop_empty")}`,
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
  const full = Object.values(cells).filter((c) => c.level === "full").length;
  el.innerHTML = loopBar(db, cells, { attr, active, label: t("loopbar_title"), summary: t("loopbar_sum", { n: full, total: db.loops.length }) + hint });
}
