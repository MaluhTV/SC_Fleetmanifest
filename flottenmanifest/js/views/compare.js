/** Tab "Vergleich / Compare" (view id "compare"): up to MAX_COMPARE ships side by side, plus a swap balance. */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { swapBalance } from "../analysis.js";
import { editButton } from "./list.js";
import { loopName, sizeLabel, roleMark, statusPill, fighterClass, meltIcon, num, crew, insuranceText, note, thumb } from "./common.js";

/** Fills the "Add ship" dropdown with every ship in the database (✓ = in fleet). */
export function renderCompareSelect(select, { db, fleet, state }) {
  const owned = new Set(fleet.ships.map((s) => s.name));
  select.innerHTML =
    `<option value="">${t("compare_pick")}</option>` +
    [...db.ships]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${esc(s.name)}" ${state.compare.includes(s.name) ? "disabled" : ""}>${esc(s.name)}${owned.has(s.name) ? " ✓" : ""}</option>`)
      .join("");
}

export function renderCompare(el, { db, fleet, state }) {
  // prefer the fleet ship (it carries quantity, insurance, meltability)
  const ships = state.compare.map((n) => fleet.ships.find((f) => f.name === n) || db.byName(n)).filter(Boolean);
  if (!ships.length) {
    el.innerHTML = `<div class="cards"><article class="is-info"><p>${t("compare_empty")}</p></article></div>`;
    return;
  }
  const owned = (s) => fleet.ships.some((f) => f.name === s.name);
  const maxScu = Math.max(...ships.map((s) => s.scu));
  const minCrew = Math.min(...ships.map((s) => s.crewMin));
  const highlight = (cond, html) => (cond && ships.length > 1 ? `<span class="better">${html}</span>` : html);

  /** Rows of the compare table: [label, cell(ship)] */
  const ROWS = [
    [t("col_size"), (s) => sizeLabel(s.size)],
    ...(ships.some((s) => s.fighterClass) ? [[t("col_fighter_class"), (s) => fighterClass(s) || "–"]] : []),
    [t("col_length"), (s) => num(s.length)],
    [t("col_beam"), (s) => num(s.beam)],
    [t("col_height"), (s) => num(s.height)],
    [t("col_scu"), (s) => highlight(s.scu === maxScu && maxScu > 0, fmt(s.scu))],
    [t("col_crew"), (s) => highlight(s.crewMin === minCrew, crew(s))],
    [t("col_status"), (s) => statusPill(s.status)],
    [t("col_insurance"), (s) => (s.insurance ? insuranceText(s) : "–")],
    [t("col_note"), (s) => esc(note(s)) || "–"],
  ];

  const pics = ships.some((s) => s.image); // same header height for all columns
  const head = ships.map((s) => `<th>${pics ? thumb(s, "m") : ""}${esc(s.name)}${meltIcon(s)}
      <button type="button" class="remove" data-remove="${esc(s.name)}" aria-label="${esc(t("compare_remove") + ": " + s.name)}">×</button> ${editButton(s)}<br>
      <span class="pill ${owned(s) ? "pill--flight-ready" : "pill--in-production"}">${owned(s) ? t("compare_owned") : t("compare_not_owned")}</span></th>`).join("");

  const loopRows = db.loops
    .filter((l) => ships.some((s) => s.loops[l.id]))
    .map((l) => `<tr><td>${loopName(db, l.id)}</td>${ships.map((s) => `<td>${s.loops[l.id] ? roleMark(s.loops[l.id]) : ""}</td>`).join("")}</tr>`)
    .join("");

  let html = `<div class="box"><div class="table-wrap"><table class="compare">
    <thead><tr><th></th>${head}</tr></thead>
    <tbody>
      ${ROWS.map(([label, cell]) => `<tr><td>${label}</td>${ships.map((s) => `<td>${cell(s)}</td>`).join("")}</tr>`).join("")}
      <tr><td colspan="${ships.length + 1}"><b>${t("compare_loops")}</b></td></tr>
      ${loopRows}
    </tbody></table></div></div>`;

  if (ships.length > 1) html += swapSection(ships, fleet, db, owned);
  el.innerHTML = html;
}

/** Swap balance: every further ship against the first one selected. */
function swapSection(ships, fleet, db, owned) {
  const [a, ...others] = ships;
  const names = (ids) => ids.map((id) => loopName(db, id)).join(", ");
  const items = others.map((b) => {
    const r = swapBalance(a, b, fleet.ships);
    let line = `<b>${t("swap_line", { a: esc(a.name), b: esc(b.name) })}</b>: <span class="delta ${r.scuDelta >= 0 ? "delta--plus" : "delta--minus"}">${t("swap_scu", { d: (r.scuDelta > 0 ? "+" : "") + fmt(r.scuDelta) })}</span>`;
    const changes = [r.gained.length && t("swap_gain", { x: names(r.gained) }), r.lost.length && t("swap_lose", { x: names(r.lost) })].filter(Boolean);
    line += "; " + (changes.length ? changes.join("; ") : t("swap_same"));
    if (r.lost.length && owned(a)) {
      const covered = r.coveredBy
        .filter((c) => c.ships.length)
        .map((c) => `${loopName(db, c.loopId)} → ${c.ships.slice(0, 3).map(esc).join(", ")}${c.ships.length > 3 ? " …" : ""}`);
      if (covered.length) line += `<br><span class="muted">${t("swap_covered", { a: esc(a.name), x: covered.join("; ") })}</span>`;
    }
    return `<li>${line}</li>`;
  });
  return `<div class="cards"><article><h3>${t("swap_title")}</h3><ul>${items.join("")}</ul></article></div>`;
}
