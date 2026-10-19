/**
 * KPI tiles above the tabs: number of ships and how many of them are flight-ready.
 * (SCU, crew seats, LTI and melt counts were removed in 2.11 – they added no value for users.)
 * New tile: add [value, "i18n_key", filter] to `tiles`, the text to js/i18n.js and the filter to KPI_FILTERS.
 * Every tile is a toggle: a click shows only those entries in the ship list (main.js → data-kpi-filter).
 */
import { esc } from "../util.js";
import { t } from "../i18n.js";
import { sum } from "../util.js";
import { isFlightReady, ownedOnly } from "../analysis.js";
import { ARCHETYPES } from "../shipdb.js";

/** KPI filters for the ship list: key → test (state.kpiFilter, used by js/views/list.js). */
export const KPI_FILTERS = {
  owned: (s) => !s.includedOnly,
  ready: (s) => !s.includedOnly && isFlightReady(s),
  included: (s) => !!s.includedOnly,
};

/**
 * Fleet profile: share of the own ships per archetype (db.archetypesOf – archetype of the primary roles,
 * or the one set for snubs / ground vehicles). A ship in two archetypes counts half in each.
 */
function profileTile(db, owned) {
  const share = { combat: 0, supply: 0, explore: 0 };
  let total = 0;
  for (const s of owned) {
    const groups = db.archetypesOf(s);
    if (!groups.length) continue;
    groups.forEach((g) => { share[g] += s.qty / groups.length; });
    total += s.qty;
  }
  if (!total) return "";
  // whole percent that add up to 100 (largest remainder)
  const raw = ARCHETYPES.map((g) => (share[g] / total) * 100);
  const pctList = raw.map(Math.floor);
  raw.map((v, i) => [v - pctList[i], i]).sort((x, y) => y[0] - x[0]).slice(0, 100 - pctList.reduce((a, b) => a + b, 0)).forEach(([, i]) => pctList[i]++);
  const pct = Object.fromEntries(ARCHETYPES.map((g, i) => [g, pctList[i]]));
  const text = ARCHETYPES.map((g) => `${t("group_" + g)} ${pct[g]} %`).join(" · ");
  return `<div class="fm-kpi fm-kpi--profile" title="${esc(t("kpi_profile_title"))}">
    <div class="profile-bar" role="img" aria-label="${esc(text)}">${ARCHETYPES.map((g) => `<i class="g-${g}" data-pct="${pct[g]}"></i>`).join("")}</div>
    <div class="profile-legend">${ARCHETYPES.map((g) => `<span class="g-${g}">${esc(t("group_" + g))} <b>${pct[g]} %</b></span>`).join("")}</div>
    <span>${t("kpi_profile")}</span></div>`;
}

export function renderKpis(el, { db, fleet, state }) {
  const count = (list) => sum(list, (s) => s.qty);
  const owned = ownedOnly(fleet.ships);
  const included = fleet.ships.filter((s) => s.includedOnly).length;
  const tiles = [
    [count(owned), "kpi_ships", "owned"],
    [count(owned.filter(isFlightReady)), "kpi_flight_ready", "ready"],
    ...(included ? [[included, "kpi_included", "included"]] : []), // snubs and rovers that come with a parent ship
  ];
  el.innerHTML = tiles.map(([value, key, filter]) => {
    const on = state.kpiFilter === filter;
    const title = t(on ? "kpi_filter_off" : "kpi_filter_on");
    return `<button type="button" class="fm-kpi" data-kpi-filter="${filter}" aria-pressed="${on}" title="${esc(title)}"><b>${value}</b><span>${t(key)}</span></button>`;
  }).join("") + profileTile(db, owned);
  // widths via CSSOM – the Content Security Policy allows no style="…" attributes
  el.querySelectorAll(".profile-bar > i").forEach((i) => { i.style.width = i.dataset.pct + "%"; });
}
