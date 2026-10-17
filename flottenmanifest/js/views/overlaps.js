/** "Overlaps" tab: rule-based analysis from js/analysis.js, with ships the user marked "to replace". */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { sizeRank } from "../shipdb.js";
import { analyseOverlaps } from "../analysis.js";
import { loopName, loopText, sizeLabel, shipLabel, shipWithMelt, markable, icon, ICONS, thumb, dims, crew, fighterClass } from "./common.js";

/** From this total crew upwards, the crew requirement of an overlap is mentioned. */
const CREW_HINT_FROM = 12;

/** Further substitutes shown in brackets; longer lists are cut and end with "+n". */
const ALSO_MAX = 3;
const alsoList = (ships, toButton) =>
  ships.slice(0, ALSO_MAX).map(toButton).join(", ") + (ships.length > ALSO_MAX ? ` +${ships.length - ALSO_MAX}` : "");

/** With images, candidate rows show up to this many further substitutes as tiles, then "+n". */
const ALSO_TILES = 6;

const list = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;

/**
 * Optional extra data next to the ship names, switched on with the chips at the top of the tab
 * (state.ovDetails, localStorage fm_ovdetails). New detail: add an entry here and its label key in js/i18n.js.
 */
export const OV_DETAILS = {
  scu: { label: "ov_detail_scu", value: (s) => `${fmt(s.scu)} SCU` },
  crew: { label: "ov_detail_crew", value: (s) => `${t("col_crew")} ${crew(s)}` },
  dims: { label: "ov_detail_dims", value: (s) => (s.length == null ? "" : `${dims(s)} m`) },
  status: { label: "ov_detail_status", value: (s) => t("status_" + s.status) },
};
const detailsOf = (s, keys, loopId) => {
  const parts = keys.map((k) => OV_DETAILS[k] && OV_DETAILS[k].value(s)).filter(Boolean);
  // fighter card: the class is always shown, because the substitute rule depends on it
  if (loopId === "fighter" && s.fighterClass) parts.unshift(fighterClass(s));
  // each value in its own span so it never breaks inside ("Crew 1–4"); tiles put them on separate lines
  return parts.length ? ` <span class="ship-meta">${parts.map((p) => `<span>${esc(p)}</span>`).join('<span class="sep"> · </span>')}</span>` : "";
};

/** Yellow (!) with a tooltip listing the loops the substitute does not cover. */
function lostHint(c, db) {
  if (!c.lost.length) return "";
  const names = (items) => items.map((l) => loopText(db, l.loopId)).join(", "); // plain text: icon() escapes the tooltip
  const uncovered = c.lost.filter((l) => !l.coveredElsewhere);
  let text = t("ov_lost", { o: c.replacement.name, x: names(c.lost) });
  if (uncovered.length) text += " " + t("ov_lost_uncovered", { x: names(uncovered) });
  return icon("icon--warn", ICONS.warn, text);
}

/** Chips that switch the extra data on/off; rendered into the sticky bar (#ovDetailsBar in index.html). */
export function renderOvDetails(el, state) {
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", t("ov_details"));
  el.innerHTML = `<span class="muted">${t("ov_details")}</span>` + Object.entries(OV_DETAILS).map(([k, d]) =>
    `<button type="button" class="chip" data-ov-detail="${k}" aria-pressed="${state.ovDetails.includes(k)}">${t(d.label)}</button>`).join("");
}

export function renderOverlaps(el, { db, fleet, state }) {
  const inFleet = (n) => fleet.ships.some((s) => s.name === n);
  const marked = state.marked.filter(inFleet);
  const chosen = Object.fromEntries(Object.entries(state.chosen).filter(([a, b]) => inFleet(a) && inFleet(b)));
  const result = analyseOverlaps(fleet.ships, db.loops, marked, chosen);
  const sel = { marked, chosen };
  const mark = (s, html) => markable(s, html, sel);
  const choose = (s, forShip) => markable(s, esc(s.name), sel, forShip.name);
  // with images: size groups become tiles (image + name), candidate lines get small thumbnails
  const pics = fleet.ships.some((s) => s.image);
  const keys = Object.keys(OV_DETAILS).filter((k) => state.ovDetails.includes(k)); // fixed order
  let loopId = ""; // set per overlap card below
  const meta = (s) => detailsOf(s, keys, loopId);
  const tile = (s) => mark(s, `<span class="ship-tile">${thumb(s)}<span>${shipWithMelt(s)}</span>${meta(s)}</span>`);
  const small = (s) => (pics ? thumb(s, "xs") : "");

  // Melt note: explain the locks, or say that the import had no melt information
  const hasMeltInfo = fleet.ships.some((s) => s.melt);
  const meltNote = hasMeltInfo ? t("ov_melt_hint") : state.ownFleet ? t("ov_melt_unknown") : "";
  // explanation folded away by default – one line, opens on click
  const parts = [`<details class="ov-help"><summary>${t("ov_help")}</summary><p>${t("ov_intro")}</p><p>${t("ov_mark_hint")}</p>${meltNote ? `<p>${meltNote}</p>` : ""}</details>`];

  if (marked.length) {
    // summary: "A → B" for chosen substitutes, plain name for ships marked without a pick
    const items = marked.map((n) => mark({ name: n }, esc(n)) + (chosen[n] ? ` → ${mark({ name: chosen[n] }, esc(chosen[n]))}` : ""));
    parts.push(`<article class="is-marked-summary"><p><b>${t("ov_marked_title", { n: marked.length })}</b> ${items.join(", ")}
      <button type="button" class="btn" data-clear-marks>${t("ov_marked_clear")}</button></p></article>`);
  }

  if (fleet.unknown.length) {
    parts.push(`<article class="is-gap"><h3>${t("unknown_title")}</h3><p>${t("unknown_text")}</p>${list(fleet.unknown.map(esc))}</article>`);
  }

  if (!result.overlaps.length) parts.push(`<article><p>${t("ov_no_overlap")}</p></article>`);
  for (const o of result.overlaps) {
    loopId = o.loopId;
    // group ships by size class, largest first
    const groups = new Map();
    [...o.primary].sort((a, b) => sizeRank(b.size) - sizeRank(a.size)).forEach((s) => {
      const key = sizeLabel(s.size);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(pics ? tile(s) : mark(s, shipWithMelt(s) + meta(s)));
    });
    // With images: one grid row per candidate – ship | arrow + label | substitute | further substitutes,
    // every ship as a tile (image above the name), so the columns line up across all rows.
    const subTile = (s, c, extra = "") =>
      markable(s, `<span class="ship-tile">${thumb(s)}<span>${shipLabel(s, { lock: false })}${extra}</span>${meta(s)}</span>`, sel, c.ship.name);
    const candidateRow = (c) => {
      const from = `<div class="cand-from">${tile(c.ship)}</div>`;
      if (!c.replacement) return `<div class="cand-row">${from}<div class="cand-arrow">→</div><div class="cand-none bad">${t("ov_no_substitute")}</div></div>`;
      const label = t(c.chosen ? "ov_replaced_by" : "ov_covered_by", { o: "" }).trim();
      const alts = c.alternatives.slice(0, ALSO_TILES).map((a) => subTile(a, c)).join("") +
        (c.alternatives.length > ALSO_TILES ? `<span class="cand-more muted">+${c.alternatives.length - ALSO_TILES}</span>` : "");
      return `<div class="cand-row">${from}
        <div class="cand-arrow">→<small class="muted">${label}</small></div>
        <div class="cand-to">${subTile(c.replacement, c, lostHint(c, db))}</div>
        ${c.alternatives.length ? `<div class="cand-also"><small class="muted">${t("ov_also", { x: "" }).trim()}</small><div class="tiles">${alts}</div></div>` : ""}
      </div>`;
    };
    // Without images: one text line per candidate.
    // Candidate first with its melt status (melt or only upgrade), then the substitute (stays, so no melt icon)
    const candidates = pics ? o.candidates.map(candidateRow) : o.candidates.map((c) => {
      const who = mark(c.ship, small(c.ship) + shipWithMelt(c.ship) + meta(c.ship));
      if (!c.replacement) return `${who} → <span class="bad">${t("ov_no_substitute")}</span>`;
      // substitute and alternatives are clickable: picking one marks it green and the candidate red
      const sub = markable(c.replacement, small(c.replacement) + shipLabel(c.replacement, { lock: false }) + meta(c.replacement), sel, c.ship.name);
      return `${who} → ${t(c.chosen ? "ov_replaced_by" : "ov_covered_by", { o: sub })}${lostHint(c, db)}` +
        (c.alternatives.length ? ` <span class="muted">(${t("ov_also", { x: alsoList(c.alternatives, (a) => choose(a, c.ship)) })})</span>` : "");
    });
    const title = t("ov_overlap_title", { loop: loopName(db, o.loopId), n: o.primary.length }) +
      (o.markedCount ? ` <span class="muted">· ${t("ov_marked_count", { n: o.markedCount })}</span>` : "");
    parts.push(`<article>
      <h3>${title}</h3>
      <p class="muted">${t("ov_by_size")}</p>${pics
        ? `<div class="size-groups">${[...groups].map(([size, tiles]) => `<div class="size-group"><b>${size}</b><div class="tiles">${tiles.join("")}</div></div>`).join("")}</div>`
        : list([...groups].map(([size, names]) => `<b>${size}</b>: ${names.join(", ")}`))}
      ${o.crewMax >= CREW_HINT_FROM ? `<p>${t("ov_crew", { n: o.crewMax })}</p>` : ""}
      <p class="muted">${candidates.length ? t("ov_candidates") : t("ov_no_candidates")}</p>${!candidates.length ? "" : pics ? `<div class="cand-rows">${candidates.join("")}</div>` : list(candidates)}
    </article>`);
  }

  // Gaps and orphan snubs are computed without the marked ships
  let gaps = `<article class="is-gap"><h3>${t("ov_gaps_title")}${marked.length ? ` <span class="muted">· ${t("ov_without_marked")}</span>` : ""}</h3>`;
  gaps += result.gaps.length
    ? `<p>${t("ov_gaps_none")}</p>${list(result.gaps.map((id) => loopName(db, id)))}`
    : `<p>${t("ov_gaps_ok")}</p>`;
  parts.push(gaps + "</article>");

  if (result.orphanSnubs.length) {
    parts.push(`<article class="is-gap"><h3>${t("ov_snubs_title")}</h3>${list(result.orphanSnubs.map((s) =>
      t("ov_snub", { s: mark(s, shipWithMelt(s)), m: s.motherships.map(esc).join(" / ") })))}</article>`);
  }

  el.innerHTML = parts.join("");
}
