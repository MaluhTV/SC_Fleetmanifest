/** Tab "Optimieren / Optimise" (view id "overlaps"): rule-based analysis from js/analysis.js, with ships the user marked "to replace". */
import { t, fmt } from "../i18n.js";
import { esc } from "../util.js";
import { sizeRank } from "../shipdb.js";
import { analyseOverlaps, loopStats, isPending, isFlightReady, remainingAfter, ownedOnly } from "../analysis.js";
import { fleetLoopCells } from "./loops.js";
import { loopText, slotName, slotText, loopBar, loopIconTitle, sizeLabel, shipLabel, shipWithMelt, markable, icon, ICONS, thumb, dims, crew, fighterClass } from "./common.js";

/** RSI's list of loaner ships for ships that are not flight-ready – linked from the "covered only by planned ships" card. */
const LOANER_MATRIX_URL = "https://support.robertsspaceindustries.com/hc/en-us/articles/360003093114-Loaner-Ship-Matrix";

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
/**
 * Why a ship is not usable today in this loop – one reason only:
 * not released yet → its status ("Konzept" / "In Produktion"); released, but the role is planned → "function planned".
 */
const pendingParts = (s, loopId) =>
  !loopId || !isPending(s, loopId) ? []
    : [!isFlightReady(s) ? t("status_" + s.status) : t("ov_role_planned")];

const detailsOf = (s, keys, loopId) => {
  const parts = keys.map((k) => OV_DETAILS[k] && OV_DETAILS[k].value(s)).filter(Boolean);
  // fighter card: the class is always shown, because the substitute rule depends on it
  if (loopId === "fighter" && s.fighterClass) parts.unshift(fighterClass(s));
  // one span per value, so it never breaks inside ("Crew 1–4") and tiles can put each on its own line
  const html = [...pendingParts(s, loopId).map((p) => `<span class="ov-pending">${esc(p)}</span>`), ...parts.map((p) => `<span>${esc(p)}</span>`)];
  return html.length ? ` <span class="ship-meta">${html.join('<span class="sep"> · </span>')}</span>` : "";
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
    `<button type="button" class="chip" data-ov-detail="${k}" aria-pressed="${state.ovDetails.includes(k)}">${t(d.label)}</button>`).join("") +
    // option for the substitute order (state.ovReadyFirst, off by default)
    `<span class="muted ov-opt-sep">${t("ov_options")}</span><button type="button" class="chip" data-ov-option="readyFirst" aria-pressed="${state.ovReadyFirst}" title="${esc(t("ov_opt_ready_first_hint"))}">${t("ov_opt_ready_first")}</button>`;
}

/** Marks and picks that still refer to fleet ships, and the analysis for them (shared by the cards and the bar). */
function analyse({ db, fleet, state }) {
  const inFleet = (n) => fleet.ships.some((s) => s.name === n);
  const marked = state.marked.filter(inFleet);
  const chosen = Object.fromEntries(Object.entries(state.chosen).filter(([a, b]) => inFleet(a) && inFleet(b)));
  return { marked, chosen, result: analyseOverlaps(fleet.ships, db.slots, marked, chosen, { readyFirst: state.ovReadyFirst }) };
}

/**
 * Loop bar above the overlaps tab: filled = overlap (number = ships in a primary role), red dashed = gap,
 * outline = covered without overlap. Click jumps to the overlap card or the gaps card (main.js → data-ov-jump).
 */
export function renderOverlapBar(el, ctx) {
  const { db, fleet } = ctx;
  const { marked, result } = analyse(ctx);
  const overlap = new Map(result.overlaps.map((o) => [o.key, o]));
  const remaining = fleet.ships.filter((s) => !marked.includes(s.name));
  const cells = {};
  for (const slot of db.slots) {
    const key = slot.key, id = slot.id;
    const name = slotText(db, key);
    const primary = remaining.filter((s) => slot.has(s) && (s.loops[id] === "primary" || s.loops[id] === "planned")).length;
    const po = result.plannedOnly.find((x) => x.key === key);
    if (overlap.has(key)) cells[key] = { n: overlap.get(key).primary.length, level: "full", text: `${name}: ${t("ovbar_overlap", { n: overlap.get(key).primary.length })}` };
    else if (result.gaps.includes(key)) cells[key] = { n: 0, level: "gap", text: `${name}: ${t("ovbar_gap")}` };
    else if (po) cells[key] = { n: po.ships.length, level: "planned", text: `${name}: ${t("ovbar_planned", { n: po.ships.length })}` };
    else if (slot.multi && !primary) cells[key] = { n: 0, level: "", text: `${name}: ${t("loop_empty")}` }; // no snub of this archetype – not a gap
    else cells[key] = { n: primary, level: "plain", text: `${name}: ${t("ovbar_ok", { n: primary })}` };
  }
  el.innerHTML = loopBar(db, cells, { attr: "ov-jump", label: t("loopbar_title"),
    summary: t("ovbar_sum", { o: result.overlaps.length, g: result.gaps.length, p: result.plannedOnly.length }) });
}

/**
 * "Result after the changes": shown as soon as ships are marked red. Compares the fleet now with the fleet
 * without the marked ships – ship count, what the given-away ships can do (exchange / CCU only), new or
 * closed gaps, a loop bar of the result (changed loops carry a dot) and a table of every loop that changes.
 * The swap list "A → B" with the button to clear all marks is part of it.
 */
function resultCard({ db, fleet }, marked, chosen, result, mark) {
  const markedSet = new Set(marked);
  const remaining = remainingAfter(fleet.ships, marked); // included vessels leave with their parent
  const gone = ownedOnly(fleet.ships).filter((s) => markedSet.has(s.name));
  const copies = (list) => list.reduce((a, s) => a + s.qty, 0);
  const exchange = gone.filter((s) => s.melt === "meltable" || s.melt === "meltOnly").length;
  const ccuOnly = gone.filter((s) => s.melt === "upgrade" || s.melt === "locked").length;
  const unknown = gone.length - exchange - ccuOnly;
  const before = analyseOverlaps(fleet.ships, db.slots, [], {});
  const gapsBefore = before.gaps;
  const newGaps = result.gaps.filter((key) => !gapsBefore.includes(key));
  const overlapBefore = new Set(before.overlaps.map((o) => o.key));
  const overlapAfter = new Set(result.overlaps.map((o) => o.key));

  // per display slot: primary and secondary/planned before → after
  const changes = db.slots.map((slot) => {
    const key = slot.key;
    const a = loopStats(fleet.ships.filter(slot.has), slot.id), b = loopStats(remaining.filter(slot.has), slot.id);
    const note = newGaps.includes(key) ? `<span class="bad">${t("res_new_gap")}</span>`
      : overlapBefore.has(key) && !overlapAfter.has(key) ? `<span class="good">${t("res_overlap_solved")}</span>` : "";
    return { id: key, p0: a.primary.length, p1: b.primary.length, o0: a.all.length - a.primary.length, o1: b.all.length - b.primary.length, note };
  }).filter((c) => c.p0 !== c.p1 || c.o0 !== c.o1);

  // loop bar of the result; changed loops get a dot and "before → after" in the tooltip
  const cells = fleetLoopCells(db, { ships: remaining });
  for (const c of changes) {
    cells[c.id].changed = true;
    cells[c.id].text = `${slotText(db, c.id)}: ${t("res_bar_change", { a: c.p0, b: c.p1 })}`;
  }
  for (const id of result.gaps) cells[id] = { ...cells[id], level: "gap" };

  const arrow = (a, b) => (a === b ? `${a}` : `${a} → <b class="${b < a ? "warn" : "good"}">${b}</b>`);
  const rows = changes.map((c) => `<tr><td>${slotName(db, c.id)}</td><td class="num">${arrow(c.p0, c.p1)}</td><td class="num">${arrow(c.o0, c.o1)}</td><td>${c.note}</td></tr>`).join("");
  const swaps = marked.map((n) => mark({ name: n }, esc(n)) + (chosen[n] ? ` → ${mark({ name: chosen[n] }, esc(chosen[n]))}` : ""));
  const meltLine = [exchange && t("res_exchange", { n: exchange }), ccuOnly && t("res_ccu", { n: ccuOnly }), unknown && t("res_unknown", { n: unknown })].filter(Boolean).join(", ");

  return `<article class="is-marked-summary res-card">
    <h3>${t("res_title")}</h3>
    <p class="res-head"><b>${t("res_ships", { a: copies(ownedOnly(fleet.ships)), b: copies(ownedOnly(remaining)) })}</b> · ${t("res_gone", { n: copies(gone) })}${meltLine ? ` (${meltLine})` : ""} ·
      ${newGaps.length ? `<span class="bad">${t("res_gaps_new", { n: newGaps.length })}</span>` : `<span class="good">${t("res_gaps_none")}</span>`}</p>
    ${loopBar(db, cells, { attr: "ov-jump", label: t("res_title"), summary: t("res_bar_sum") })}
    ${rows ? `<div class="table-wrap"><table class="res-table"><thead><tr><th>${t("filter_loop")}</th><th class="num">${t("legend_primary")}</th><th class="num">${t("res_other_roles")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
    <p><b>${t("ov_marked_title", { n: marked.length })}</b> ${swaps.join(", ")}
      <button type="button" class="btn" data-clear-marks>${t("ov_marked_clear")}</button></p>
  </article>`;
}

export function renderOverlaps(el, ctx) {
  const { db, fleet, state } = ctx;
  const { marked, chosen, result } = analyse(ctx);
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

  if (marked.length) parts.push(resultCard({ db, fleet }, marked, chosen, result, mark));

  if (fleet.unknown.length) {
    parts.push(`<article class="is-gap"><h3>${t("unknown_title")}</h3><p>${t("unknown_text")}</p>${list(fleet.unknown.map(esc))}</article>`);
  }

  // ships grouped by size (Small, Medium, Large, Capital …), largest first – "S5 Large" and "Large" (no S class
  // known yet, mostly concepts) land in the same group; the heading lists the S classes in it.
  // Map size word → { classes: Set, items: tiles (or text with images off) }
  const sizeWord = (size) => String(size).replace(/^S\d+\s+/, "");
  const sizeGroups = (ships) => {
    const groups = new Map();
    [...ships].sort((a, b) => sizeRank(b.size) - sizeRank(a.size)).forEach((s) => {
      const key = sizeWord(s.size);
      if (!groups.has(key)) groups.set(key, { classes: new Set(), items: [] });
      const g = groups.get(key);
      g.classes.add((String(s.size).match(/^S\d+/) || [t("size_no_class")])[0]);
      g.items.push(pics ? tile(s) : mark(s, shipWithMelt(s) + meta(s)));
    });
    return groups;
  };
  const groupHead = (word, g) => `<b>${sizeLabel(word)}</b>${g.classes.size > 1 || !g.classes.has(t("size_no_class")) && word !== "Ground vehicle" ? ` <small class="muted">${[...g.classes].map(esc).join(" · ")}</small>` : ""}`;
  const groupsHtml = (groups) => pics
    ? `<div class="size-groups">${[...groups].map(([word, g]) => `<div class="size-group"><div class="size-head">${groupHead(word, g)}</div><div class="tiles">${g.items.join("")}</div></div>`).join("")}</div>`
    : list([...groups].map(([word, g]) => `${groupHead(word, g)}: ${g.items.join(", ")}`));

  // overlap cards are folded: the heading says loop, ship and candidate count; a click (or a bar square) opens it.
  // state.ovOpen (not stored) remembers which cards are open across re-renders (main.js keeps it up to date).
  const open = state.ovOpen || new Map();
  const isOpen = (key, byDefault) => (open.has(key) ? open.get(key) : byDefault);
  const accordion = (key, cls, head, body, on) => `<article class="ov-acc ${cls}" id="ov-${esc(key)}" data-group="${(db.slot(key) || {}).group || ""}">
      <details data-ov-acc="${esc(key)}"${on ? " open" : ""}><summary><h3>${head}</h3></summary>${body}</details></article>`;
  if (!result.overlaps.length) parts.push(`<article><p>${t("ov_no_overlap")}</p></article>`);
  else parts.push(`<div class="ov-acc-tools"><button type="button" class="btn btn--small" data-ov-all="open">${t("ov_open_all")}</button><button type="button" class="btn btn--small" data-ov-all="close">${t("ov_close_all")}</button></div>`);
  // loop cards (overlaps and "planned only") are collected per loop and output in the fixed order of
  // data/loops.json – the same order as the loop bar and the other tabs
  const loopCards = new Map();
  const addCard = (id, html) => { if (!loopCards.has(id)) loopCards.set(id, []); loopCards.get(id).push(html); };
  for (const o of result.overlaps) {
    loopId = o.loopId;
    // group ships by size class, largest first
    const groups = sizeGroups(o.primary);
    // With images: one grid row per candidate – ship | arrow + label | substitute | further substitutes,
    // every ship as a tile (image above the name), so the columns line up across all rows.
    const subTile = (s, c, extra = "") =>
      markable(s, `<span class="ship-tile">${thumb(s)}<span>${shipLabel(s)}${extra}</span>${meta(s)}</span>`, sel, c.ship.name);
    const candidateRow = (c) => {
      const from = `<div class="cand-from">${tile(c.ship)}</div>`;
      // own copy of a vessel a parent ship already brings along
      if (c.includedBy) return `<div class="cand-row">${from}<div class="cand-arrow">→<small class="muted">${t("ov_included_by")}</small></div><div class="cand-incl">${c.includedBy.map(esc).join("<br>")}<small class="muted">${t("ov_included_extra")}</small></div></div>`;
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
      if (c.includedBy) return `${who} → ${t("ov_included_by")} ${c.includedBy.map(esc).join(", ")} <span class="muted">(${t("ov_included_extra")})</span>`;
      if (!c.replacement) return `${who} → <span class="bad">${t("ov_no_substitute")}</span>`;
      // substitute and alternatives are clickable: picking one marks it green and the candidate red
      const sub = markable(c.replacement, small(c.replacement) + shipLabel(c.replacement) + meta(c.replacement), sel, c.ship.name);
      return `${who} → ${t(c.chosen ? "ov_replaced_by" : "ov_covered_by", { o: sub })}${lostHint(c, db)}` +
        (c.alternatives.length ? ` <span class="muted">(${t("ov_also", { x: alsoList(c.alternatives, (a) => choose(a, c.ship)) })})</span>` : "");
    });
    const title = t("ov_overlap_title", { loop: slotName(db, o.key), n: o.primary.length }) +
      ` <span class="muted ov-acc-count">· ${t("ov_cand_count", { n: o.candidates.length })}</span>` +
      (o.markedCount ? ` <span class="muted">· ${t("ov_marked_count", { n: o.markedCount })}</span>` : "");
    addCard(o.key, accordion(o.key, "", `${loopIconTitle(o.loopId)}${title}`, `
      <p class="muted">${t("ov_by_size")}</p>${groupsHtml(groups)}
      ${o.crewMax >= CREW_HINT_FROM ? `<p>${t("ov_crew", { n: o.crewMax })}</p>` : ""}
      <p class="muted">${candidates.length ? t("ov_candidates") : t("ov_no_candidates")}</p>${!candidates.length ? "" : pics ? `<div class="cand-rows">${candidates.join("")}</div>` : list(candidates)}`,
      isOpen(o.key, o.markedCount > 0)));
  }

  // Loops covered only by ships that are not usable today (planned role or not flight-ready):
  // same card layout as an overlap (tiles by size, violet notes), without candidates
  for (const x of result.plannedOnly) {
    loopId = x.loopId;
    addCard(x.key, accordion(x.key, "is-planned-only", `${loopIconTitle(x.loopId)}${t("ov_planned_card_title", { loop: slotName(db, x.key), n: x.ships.length })}`, `
      <p class="muted">${t("ov_by_size")}</p>${groupsHtml(sizeGroups(x.ships))}
      <p class="muted plan-note-planned">${t("ov_planned_text")} ${t("ov_loaner_hint", { link: `<a href="${LOANER_MATRIX_URL}" target="_blank" rel="noopener">RSI Loaner Ship Matrix</a>` })}</p>`,
      isOpen(x.key, false)));
  }

  for (const { key } of db.slots) parts.push(...(loopCards.get(key) || []));

  // Gaps and orphan snubs are computed without the marked ships
  let gaps = `<article class="is-gap" id="ov-gaps"><h3>${t("ov_gaps_title")}${marked.length ? ` <span class="muted">· ${t("ov_without_marked")}</span>` : ""}</h3>`;
  gaps += result.gaps.length
    ? `<p>${t("ov_gaps_none")}</p>${list(result.gaps.map((key) => slotName(db, key)))}`
    : `<p>${t("ov_gaps_ok")}</p>`;
  parts.push(gaps + "</article>");

  if (result.orphanSnubs.length) {
    parts.push(`<article class="is-gap"><h3>${t("ov_snubs_title")}</h3>${list(result.orphanSnubs.map((s) =>
      t("ov_snub", { s: mark(s, shipWithMelt(s)), m: s.motherships.map(esc).join(" / ") })))}</article>`);
  }

  el.innerHTML = parts.join("");
}
