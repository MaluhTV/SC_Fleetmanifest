/**
 * KPI tiles above the tabs: number of ships and how many of them are flight-ready.
 * (SCU, crew seats, LTI and melt counts were removed in 2.11 – they added no value for users.)
 * New tile: add [value, "i18n_key"] to `tiles` and the text to js/i18n.js.
 */
import { t } from "../i18n.js";
import { sum } from "../util.js";
import { isFlightReady } from "../analysis.js";

export function renderKpis(el, { fleet }) {
  const count = (list) => sum(list, (s) => s.qty);
  const tiles = [
    [count(fleet.ships), "kpi_ships"],
    [count(fleet.ships.filter(isFlightReady)), "kpi_flight_ready"],
  ];
  el.innerHTML = tiles.map(([value, key]) => `<div class="fm-kpi"><b>${value}</b><span>${t(key)}</span></div>`).join("");
}
