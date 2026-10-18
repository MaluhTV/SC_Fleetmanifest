/**
 * KPI tiles above the tabs: number of ships and how many of them are flight-ready.
 * (SCU, crew seats, LTI and melt counts were removed in 2.11 – they added no value for users.)
 * New tile: add [value, "i18n_key"] to `tiles` and the text to js/i18n.js.
 */
import { t } from "../i18n.js";
import { sum } from "../util.js";
import { isFlightReady, ownedOnly } from "../analysis.js";

export function renderKpis(el, { fleet }) {
  const count = (list) => sum(list, (s) => s.qty);
  const owned = ownedOnly(fleet.ships);
  const included = fleet.ships.filter((s) => s.includedOnly).length;
  const tiles = [
    [count(owned), "kpi_ships"],
    [count(owned.filter(isFlightReady)), "kpi_flight_ready"],
    ...(included ? [[included, "kpi_included"]] : []), // snubs and rovers that come with a parent ship
  ];
  el.innerHTML = tiles.map(([value, key]) => `<div class="fm-kpi"><b>${value}</b><span>${t(key)}</span></div>`).join("");
}
