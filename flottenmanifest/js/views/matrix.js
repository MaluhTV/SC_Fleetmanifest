/** Loop matrix (ship list tab, "Matrix" mode): ships as rows, display slots as columns, grouped by archetype. */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { ARCHETYPES } from "../shipdb.js";
import { loopStats } from "../analysis.js";
import { loopText, roleMark, shipLabel, crew, slotText } from "./common.js";

/**
 * rows = the ships that pass the list filters (list.js → filterRows), hl = slot key whose column is highlighted
 * (the square picked in the loop bar). Multi loops (snub, ground vehicle) get one column per archetype.
 */
export function renderMatrix(el, { db }, rows, hl = null) {
  const slots = ARCHETYPES.flatMap((g) => db.slots.filter((s) => s.group === g));
  const col = (slot) => ` g-${slot.group}${slot.key === hl ? " col-hl" : ""}${slot === slots.find((x) => x.group === slot.group) ? " g-first" : ""}`;
  // no image column: the matrix is the dense overview, the ship name stays fixed on the left while scrolling
  const lead = 3;
  const groupRow = `<tr class="matrix-groups"><th colspan="${lead}"></th>${ARCHETYPES.map((g) => {
    const n = slots.filter((s) => s.group === g).length;
    return `<th colspan="${n}" class="g-${g} g-first">${esc(t("group_" + g))}</th>`;
  }).join("")}</tr>`;
  const head = `<thead>${groupRow}<tr><th>${t("col_ship")}</th><th class="num">SCU</th><th class="num">${t("col_crew")}</th>${slots
    .map((sl) => `<th class="vertical${col(sl)}" title="${esc(slotText(db, sl.key))}">${esc(loopText(db, sl.id))}</th>`)
    .join("")}</tr></thead>`;

  const cell = (s, sl) => (sl.has(s) && s.loops[sl.id] ? roleMark(s.loops[sl.id]) : "");
  const body = rows
    .map((s) => `<tr><td>${shipLabel(s)}</td><td class="num">${fmt(s.scu)}</td><td class="num">${crew(s)}</td>${slots
      .map((sl) => `<td class="center${col(sl)}">${cell(s, sl)}</td>`)
      .join("")}</tr>`)
    .join("");

  const foot = `<tfoot><tr><td>${t("matrix_footer")}</td><td></td><td></td>${slots
    .map((sl) => {
      const st = loopStats(rows.filter(sl.has), sl.id);
      return `<td class="center${col(sl)}">${st.all.length ? `${st.primary.length}/${st.all.length}` : ""}</td>`;
    })
    .join("")}</tr></tfoot>`;

  el.innerHTML = head + `<tbody>${body || `<tr><td colspan="${lead + slots.length}" class="muted">${t("list_none")}</td></tr>`}</tbody>` + foot;
}
