/** "Loop matrix" tab: ships as rows, loops as columns. */
import { t, fmt } from "../i18n.js";
import { loopStats } from "../analysis.js";
import { loopName, roleMark, shipLabel, crew, thumb } from "./common.js";

/** hl = loop ID whose column is highlighted (clicked in the loop bar above the matrix). */
export function renderMatrix(el, { db, fleet }, hl = null) {
  const col = (id) => (id === hl ? " col-hl" : "");
  const loops = db.loops;
  const pics = fleet.ships.some((s) => s.image); // image column only if there are images
  const head = `<thead><tr>${pics ? "<th></th>" : ""}<th>${t("col_ship")}</th><th class="num">SCU</th><th class="num">${t("col_crew")}</th>${loops
    .map((l) => `<th class="vertical${col(l.id)}">${loopName(db, l.id)}</th>`)
    .join("")}</tr></thead>`;

  const body = fleet.ships
    .map((s) => `<tr>${pics ? `<td>${thumb(s)}</td>` : ""}<td>${shipLabel(s)}</td><td class="num">${fmt(s.scu)}</td><td class="num">${crew(s)}</td>${loops
      .map((l) => `<td class="center${col(l.id)}">${s.loops[l.id] ? roleMark(s.loops[l.id]) : ""}</td>`)
      .join("")}</tr>`)
    .join("");

  const foot = `<tfoot><tr>${pics ? "<td></td>" : ""}<td>${t("matrix_footer")}</td><td></td><td></td>${loops
    .map((l) => {
      const st = loopStats(fleet.ships, l.id);
      return `<td class="${col(l.id).trim()}">${st.primary.length}/${st.all.length}</td>`;
    })
    .join("")}</tr></tfoot>`;

  el.innerHTML = head + `<tbody>${body}</tbody>` + foot;
}
