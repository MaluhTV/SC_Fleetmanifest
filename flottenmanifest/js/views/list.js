/** "Ship list" tab: filterable, sortable table of the fleet. */
import { t, fmt } from "../i18n.js";
import { esc, sum } from "../util.js";
import { ROLE_ORDER } from "../shipdb.js";
import { loopName, sizeLabel, roleMark, statusPill, shipLabel, dims, crew, insuranceText, note, thumb, meltIcon, fighterClass, loanerText } from "./common.js";

/**
 * Table columns. No sortValue = column is not sortable.
 * New column: add an entry here and its heading in js/i18n.js.
 */
const COLUMNS = [
  { key: "image", label: "col_image", cell: (s) => thumb(s) },
  { key: "name", label: "col_ship", cell: (s, db, state) => shipLabel(s, { lock: false }) + meltIcon(s, true) + editedTag(s, state), sortValue: (s) => s.name }, // shows all three melt states, so every ship can be changed here
  { key: "size", label: "col_size", cell: (s) => sizeLabel(s.size), sortValue: (s) => s.size },
  { key: "fighterClass", label: "col_fighter_class", cell: (s) => fighterClass(s), sortValue: (s) => fighterClass(s) || "~" },
  { key: "dims", label: "col_dims", numeric: true, cell: (s) => dims(s), sortValue: (s) => s.length ?? -1 },
  { key: "scu", label: "col_scu", numeric: true, cell: (s) => fmt(s.scu), sortValue: (s) => s.scu },
  { key: "crew", label: "col_crew", numeric: true, cell: (s) => crew(s), sortValue: (s) => s.crewMax },
  { key: "status", label: "col_status", cell: (s) => statusPill(s.status), sortValue: (s) => s.status },
  { key: "loaners", label: "col_loaners", wrap: true, cell: (s) => `<span class="muted">${esc(loanerText(s))}</span>`, sortValue: (s) => loanerText(s) || "~" },
  { key: "insurance", label: "col_insurance", cell: (s) => insuranceText(s), sortValue: (s) => insuranceText(s) },
  { key: "loops", label: "col_loops", wrap: true, cell: (s, db) => loopList(s, db) },
  { key: "note", label: "col_note", wrap: true, cell: (s) => `<span class="muted">${esc(note(s))}</span>` },
  { key: "edit", label: "col_edit", cell: (s) => editButton(s) },
];

/** Pencil button that opens the editor (js/views/editor.js); main.js listens for data-edit. */
export const editButton = (s) =>
  `<button type="button" class="btn btn--icon" data-edit="${esc(s.name)}" title="${esc(t("edit_title", { s: s.name }))}" aria-label="${esc(t("edit_title", { s: s.name }))}">✎</button>`;
const editedTag = (s, state) => (state.overrides[s.name] ? ` <span class="pill pill--edited">${t("edit_mark")}</span>` : "");

const loopList = (s, db) =>
  Object.entries(s.loops)
    .sort((a, b) => ROLE_ORDER[a[1]] - ROLE_ORDER[b[1]])
    .map(([id, role]) => `${roleMark(role)} ${loopName(db, id)}`)
    .join("<br>");

/** Fills the loop and size dropdowns (keeps the current selection). */
export function renderListFilters({ loopSelect, sizeSelect }, { db, fleet }) {
  const keep = [loopSelect.value, sizeSelect.value];
  loopSelect.innerHTML = `<option value="">${t("all")}</option>` + db.loops.map((l) => `<option value="${l.id}">${loopName(db, l.id)}</option>`).join("");
  const sizes = [...new Set(fleet.ships.map((s) => s.size))].sort();
  sizeSelect.innerHTML = `<option value="">${t("all")}</option>` + sizes.map((z) => `<option value="${esc(z)}">${sizeLabel(z)}</option>`).join("");
  loopSelect.value = keep[0];
  sizeSelect.value = sizes.includes(keep[1]) ? keep[1] : "";
}

export function renderList(table, { db, fleet, state }, filter) {
  const { sortKey, sortDir } = state.list;
  const q = filter.text.toLowerCase();
  const rows = fleet.ships.filter(
    (s) => (!filter.loop || s.loops[filter.loop]) && (!filter.size || s.size === filter.size) && (!q || s.name.toLowerCase().includes(q)),
  );
  // the image column is left out if no fleet ship has an image
  // optional columns only appear when at least one fleet ship has a value
  const has = (k) => fleet.ships.some((s) => s[k]);
  const cols = COLUMNS.filter((c) => (c.key !== "image" || has("image")) && (c.key !== "fighterClass" || has("fighterClass")) &&
    (c.key !== "loaners" || fleet.ships.some((s) => s.loaners && s.loaners.length)));
  const col = cols.find((c) => c.key === sortKey && c.sortValue) || cols.find((c) => c.sortValue);
  rows.sort((a, b) => {
    const x = col.sortValue(a), y = col.sortValue(b);
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * sortDir;
  });

  const head = cols.map((c) => {
    const cls = [c.numeric && "num", c.sortValue && "sortable"].filter(Boolean).join(" ");
    const arrow = c.key === sortKey ? (sortDir > 0 ? " ▲" : " ▼") : "";
    const attrs = c.sortValue ? ` data-sort="${c.key}" tabindex="0"` : "";
    return `<th class="${cls}"${attrs}>${t(c.label)}${arrow}</th>`;
  }).join("");

  const body = rows
    .map((s) => `<tr>${cols.map((c) => `<td class="${[c.numeric && "num", c.wrap && "wrap"].filter(Boolean).join(" ")}">${c.cell(s, db, state)}</td>`).join("")}</tr>`)
    .join("");

  const foot = `<tr>${cols[0].key === "image" ? "<td></td>" : ""}<td>${sum(rows, (s) => s.qty)} ${t("ships")}</td><td></td><td></td>
    <td class="num"><b>${fmt(sum(rows, (s) => s.scu * s.qty))}</b></td>
    <td class="num"><b>${sum(rows, (s) => s.crewMin * s.qty)}–${sum(rows, (s) => s.crewMax * s.qty)}</b></td>
    <td colspan="${cols.length - 5 - (cols[0].key === "image" ? 1 : 0)}"></td></tr>`;
  // (the edit column is part of cols, so the colspan above already covers it)

  table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
}
