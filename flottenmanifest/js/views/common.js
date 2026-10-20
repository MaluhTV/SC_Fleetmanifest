/** Building blocks shared by several views. They return HTML strings. */
import { ARCHETYPES } from "../shipdb.js";
import { t, fmt, getLang } from "../i18n.js";
import { esc } from "../util.js";

/**
 * One small line icon per gameplay loop (16×16, stroke = currentColor), keyed by the loop ID in data/loops.json.
 * New loop: add an entry here, otherwise LOOP_ICON_FALLBACK (a dot) is shown.
 */
const loopSvg = (inner) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const LOOP_ICONS = {
  cargo: loopSvg('<path d="M2 5l6-3 6 3v6l-6 3-6-3z M2 5l6 3 6-3 M8 8v6"/>'),
  "vehicle-transport": loopSvg('<path d="M1 4h9v7H1z M10 7h3l2 2v2h-5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/>'),
  mining: loopSvg('<path d="M4.5 2h7L15 6l-7 8-7-8z M1 6h14 M6 2 5 6l3 8 3-8-1-4"/>'),
  refining: loopSvg('<path d="M6 1.5h4 M7 1.5v5L3 13.5c-.4.7.1 1.5.9 1.5h8.2c.8 0 1.3-.8.9-1.5L9 6.5v-5 M4.6 11h6.8"/>'),
  passenger: loopSvg('<circle cx="5.5" cy="4.5" r="2"/><circle cx="11.2" cy="5.2" r="1.7"/><path d="M1.5 14v-1.5a4 4 0 0 1 8 0V14 M10.6 9a3.2 3.2 0 0 1 3.9 3.2V14"/>'),
  refuel: loopSvg('<path d="M8 1.5C5.6 4.8 4 7.3 4 9.6a4 4 0 0 0 8 0c0-2.3-1.6-4.8-4-8.1z M6.2 10.2a1.9 1.9 0 0 0 1.8 1.6"/>'),
  construction: loopSvg('<path d="M3.5 15V2.5h9 M3.5 6.5 7.5 2.5 M11.5 2.5V6 M10 6h3v2.6h-3z M1 15h6"/>'),
  interdiction: loopSvg('<circle cx="8" cy="8" r="1.4"/><path d="M5.2 5.2a4 4 0 0 0 0 5.6 M10.8 5.2a4 4 0 0 1 0 5.6 M3 3a7 7 0 0 0 0 10 M13 3a7 7 0 0 1 0 10"/>'),
  bomber: loopSvg('<path d="M8 1.5c1.9 0 3 2.4 3 5.2S9.9 11.5 8 11.5 5 9.5 5 6.7s1.1-5.2 3-5.2z M6.3 11 4.8 14.5h6.4L9.7 11 M8 11.5v3"/>'),
  capital: loopSvg('<path d="M1 9.5 3.5 6h10l1.5 3.5-2 2H3z M5.5 6V3.5h4V6 M1 9.5h14"/>'),
  recon: loopSvg('<path d="M1 8s2.6-4.8 7-4.8S15 8 15 8s-2.6 4.8-7 4.8S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>'),
  salvage: loopSvg('<path d="M3 2v6a5 5 0 0 0 10 0V2 M6 2v6a2 2 0 0 0 4 0V2 M3 5h3 M10 5h3"/>'),
  medical: loopSvg('<path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z"/>'),
  fighter: loopSvg('<circle cx="8" cy="8" r="5"/><path d="M8 1v4 M8 11v4 M1 8h4 M11 8h4"/>'),
  gunship: loopSvg('<path d="M8 1.5 14 4v3.5c0 3.4-2.6 6-6 7-3.4-1-6-3.6-6-7V4z M8 5v5 M5.5 7.5h5"/>'),
  dropship: loopSvg('<path d="M2 7a6 6 0 0 1 12 0z M2 7l6 6 6-6 M8 7v6"/>'),
  exploration: loopSvg('<circle cx="8" cy="8" r="6.5"/><path d="M10.6 5.4 9 9 5.4 10.6 7 7z"/>'),
  support: loopSvg('<path d="M10.2 2.2a3.3 3.3 0 0 0-3.7 4.4L2 11.1 4.9 14l4.5-4.5a3.3 3.3 0 0 0 4.4-3.7l-2 2-2.3-.6-.6-2.3z"/>'),
  touring: loopSvg('<path d="M2 8l6-5.5L14 8 M4 6.5V14h8V6.5 M7 14v-4h2v4"/>'),
  snub: loopSvg('<path d="M8 1.5 11 10 8 8.5 5 10z M3.5 13.5h9"/>'),
  ground: loopSvg('<path d="M2 10h12l-1.5-4.5h-9z"/><circle cx="4.5" cy="12" r="1.7"/><circle cx="11.5" cy="12" r="1.7"/>'),
  racing: loopSvg('<path d="M3 15V2 M3 2.5h10l-2 3 2 3H3"/>'),
};
const LOOP_ICON_FALLBACK = loopSvg('<circle cx="8" cy="8" r="2.5"/>');
export const loopIcon = (loopId) => LOOP_ICONS[loopId] || LOOP_ICON_FALLBACK;
/** Loop icon in front of a card title (same icon as in the loop bar), hidden from screen readers – the title names the loop. */
export const loopIconTitle = (loopId) => `<span class="card-loop-icon" aria-hidden="true">${loopIcon(loopId)}</span>`;

/**
 * Loop bar: one icon + square per gameplay loop, always in the order of data/loops.json.
 * cells = { loopId: { n, level, text } } – n is shown in the square, text is the tooltip (plain text).
 * level: "full" = filled (accent) · "partial" = dashed · "plain" = outline with grey number · "gap" = red dashed ·
 *        "planned" = violet dashed (only planned / unfinished ships) · "" = empty
 * attr = data attribute name for the click (main.js), label = aria label, summary = text next to the bar (HTML),
 * active = loop ID shown as selected (e.g. the ship list filter).
 * The square of the card currently in view is framed while scrolling (main.js → .is-current). cells[id].changed = true adds a dot (something changes there).
 * Used by Coverage, the ship list (fleet coverage), Optimise (overlaps) and Plan (coverage of the plan).
 */
const BAR_LEVELS = { full: " is-filled", partial: " is-partial", plain: " is-plain", gap: " is-gap", planned: " is-planned-only" };
export function loopBar(db, cells, { attr, label, summary, active = null }) {
  // cells and data attributes use the slot key (loop ID, or "snub--combat" for a multi loop inside an archetype)
  const item = (slot) => {
    const key = slot.key;
    const c = cells[key] || { n: 0, level: "", text: slotText(db, key) };
    return `<button type="button" class="cover-item g-${slot.group}${slot.multi ? " is-multi" : ""}${BAR_LEVELS[c.level] || ""}${c.changed ? " is-changed" : ""}${active === key ? " is-active" : ""}" data-${attr}="${esc(key)}" aria-pressed="${active === key}" title="${esc(c.text)}" aria-label="${esc(c.text)}">
      <span class="cover-icon">${loopIcon(slot.id)}</span><span class="cover-cell">${c.n || ""}</span></button>`;
  };
  // group heading = archetype filter (main.js → data-group-pick)
  const groups = ARCHETYPES.map((g) => `<div class="cover-group g-${g}" role="group" aria-label="${esc(t("group_" + g))}"><button type="button" class="cover-group-label" data-group-pick="${g}" title="${esc(t("group_filter_on"))}">${esc(t("group_" + g))}</button><div class="cover-group-cells">${db.slots.filter((s) => s.group === g).map(item).join("")}</div></div>`).join("");
  // phones: one compact row "Kampf 5/6" per archetype; a tap opens the full bar (main.js → data-bar-expand)
  const covered = (c) => c && ["full", "planned", "plain"].includes(c.level);
  const sums = ARCHETYPES.map((g) => {
    const loops = db.slots.filter((s) => s.group === g && !s.multi);
    const n = loops.filter((s) => covered(cells[s.key])).length;
    return `<button type="button" class="cover-summary g-${g}" data-bar-expand aria-expanded="false" title="${esc(t("bar_expand"))}"><span>${esc(t("group_short_" + g))}</span> <b>${n}/${loops.length}</b></button>`;
  }).join("");
  return `<div class="cover-bar" role="group" aria-label="${esc(label)}"><div class="cover-summaries">${sums}</div><div class="cover-cells">${groups}</div><span class="muted cover-sum">${summary}</span></div>`;
}

/** Name of a display slot as plain text: the loop, for a multi loop with its archetype ("Snub / Beiboot · Kampf"). */
export function slotText(db, key) {
  const slot = db.slot(key);
  if (!slot) return loopText(db, key);
  return loopText(db, slot.id) + (slot.multi ? " · " + t("group_" + slot.group) : "");
}
export const slotName = (db, key) => esc(slotText(db, key));

/** Loop name as plain text – for title/aria attributes (escape there with esc()) and the clipboard. */
export function loopText(db, loopId) {
  const loop = db.loops.find((l) => l.id === loopId);
  return loop ? loop[getLang()] || loop.de : String(loopId);
}
/** Loop name ready for HTML (escaped). Never pass this into esc()/icon()/title again – use loopText() there. */
export const loopName = (db, loopId) => esc(loopText(db, loopId));

/** Size class for display ("Ground vehicle" is translated). */
export const sizeLabel = (size) => (size === "Ground vehicle" ? t("size_ground") : size);

export const note = (ship) => (ship.note && (ship.note[getLang()] || ship.note.de)) || "";

/** Role mark ● ○ ◇ */
// Role marks are drawn in CSS (.mk::before), so they are centred regardless of the font.
export const roleMark = (role) => `<span class="mk mk--${role}" role="img" title="${esc(t("legend_" + role))}" aria-label="${esc(t("legend_" + role))}"></span>`;

/** Fighter class label ("Heavy fighter"), empty for ships without one. Classes: FIGHTER_CLASSES in shipdb.js. */
export const fighterClass = (s) => (s.fighterClass ? t("fc_" + s.fighterClass) : "");

export const statusPill = (status) => `<span class="pill pill--${status}">${t("status_" + status)}</span>`;

/** Number, or "–" for missing values. */
export const num = (v) => (v == null || v === 0 ? "–" : fmt(v));
export const dims = (s) => (s.length == null ? "–" : `${num(s.length)} × ${num(s.beam)} × ${num(s.height)}`);
export const crew = (s) => `${s.crewMin}–${s.crewMax}`;

/**
 * Small icons (12×12, colour from CSS via currentColor). In index.html, <span data-icon="name"> is filled by main.js.
 *   warn      exclamation mark in a circle – a hint shown on hover (substitute loses loops, multicrew ship)
 *   hangar    rounded hall with an open gate – "in your fleet" (Plan)
 *   check     check mark – "selected" (Plan)
 *   exchange  two circular arrows – "Exchange" (melt for store credit) possible   } melt / upgrade pair: active = coloured,
 *   upgrade   arrow up – CCU upgrade possible                                      } not possible = grey + struck (.mp--off)
 */
const svg = (inner) => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">${inner}</svg>`;
export const ICONS = {
  warn: svg('<circle cx="6" cy="6" r="5.6" fill="currentColor"/>' +
    '<path d="M6 3.1v3.7" fill="none" class="ic-cut" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="6" cy="8.9" r="0.9" class="ic-dot"/>'),
  hangar: svg('<path d="M.8 11.2V6.6a5.2 5.2 0 0 1 10.4 0v4.6H8.4V7.6H3.6v3.6Z" fill="currentColor"/>'),
  check: svg('<path d="M2.2 6.3 4.9 9l5-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
};
ICONS.exchange = svg('<path d="M2.4 5.2A3.7 3.7 0 0 1 9 3.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
  '<path d="M9.4 1.6v2.3H7.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M9.6 6.8A3.7 3.7 0 0 1 3 8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
  '<path d="M2.6 10.4V8.1h2.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>');
ICONS.upgrade = svg('<path d="M6 10.6V2M2.8 5.2 6 2l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>');

/** [exchange possible, upgrade possible] per melt state (see MELT_STATES in js/analysis.js). */
export const MELT_PAIR = { meltable: [true, true], meltOnly: [true, false], upgrade: [false, true], locked: [false, false] };
/** The two marks as HTML (no wrapper); used for ship icons, legend and menu. */
export const meltPair = (state) => {
  const [x, u] = MELT_PAIR[state];
  return `<span class="mp mp--x${x ? "" : " mp--off"}">${ICONS.exchange}</span><span class="mp mp--u${u ? "" : " mp--off"}">${ICONS.upgrade}</span>`;
};

/** Icon only; the meaning is in the legend, the text appears as tooltip and for screen readers. */
export const icon = (cls, svgIcon, text) => ` <span class="${cls}" title="${esc(text)}" role="img" aria-label="${esc(text)}">${svgIcon}</span>`;

/**
 * Melt status (ship.melt from buildFleet) as the exchange + upgrade pair (meltPair); clickable, main.js opens
 * the choice menu via data-melt. Shown where melting matters: Optimise, Compare and the ship list.
 */
const MELT_TEXT = { meltable: "melt_ok", meltOnly: "melt_only", upgrade: "melt_upgrade_only", locked: "melt_locked" };
export function meltIcon(ship) {
  if (ship.includedOnly) return ""; // comes with its parent ship – cannot be melted on its own
  // unknown (import without melt data): grey "?" pair, so the status can still be set by click (fleet ships only)
  if (!ship.melt) {
    if (!ship.qty) return "";
    const text = t("melt_unknown") + " – " + t("melt_click");
    return ` <span class="melt-icon melt-pair melt-pair--unknown" role="button" tabindex="0" data-melt="${esc(ship.name)}" title="${esc(text)}" aria-label="${esc(text)}"><span class="mp">${ICONS.exchange}</span><span class="mp">${ICONS.upgrade}</span><span class="mp-q">?</span></span>`;
  }
  let text = t(MELT_TEXT[ship.melt]);
  if (ship.notMeltable && ship.notMeltable < ship.qty) text += " · " + t("not_meltable_partial", { n: ship.notMeltable, q: ship.qty });
  if (ship.meltManual) text += " · " + t("melt_manual");
  text += " – " + t("melt_click");
  return ` <span class="melt-icon melt-pair${ship.meltManual ? " is-manual" : ""}" role="button" tabindex="0" data-melt="${esc(ship.name)}" title="${esc(text)}" aria-label="${esc(text)}">${meltPair(ship.melt)}</span>`;
}
/** Ship name with quantity (×2) and the "incl." pill; shipWithMelt() adds the melt status. */
export const shipLabel = (ship) =>
  esc(ship.name) + (ship.qty > 1 ? ` <span class="qty">×${ship.qty}</span>` : "") + includedTag(ship);

/**
 * "incl." pill for vessels that come with a parent ship (buildFleet → includedBy / includedOnly):
 * only included = "incl.", also owned on its own = "+ incl."; the tooltip names the parent ships.
 */
export function includedTag(ship) {
  if (!ship.includedBy || !ship.includedBy.length) return "";
  const parents = ship.includedBy.join(", ");
  const text = t(ship.includedOnly ? "incl_title" : "incl_extra_title", { p: parents });
  return ` <span class="pill pill--incl" title="${esc(text)}">${t(ship.includedOnly ? "incl_tag" : "incl_extra_tag")}</span>`;
}

/**
 * Ship thumbnail from the `image` field in data/ships.json (RSI store image, hot-linked).
 * Without an image an empty box of the same size keeps the rows aligned.
 * size: "xs" (overlap candidate lines), "s" (lists, loop cards, tiles) or "m" (compare table)
 */
export const thumb = (ship, size = "s") =>
  ship.image
    ? `<img class="thumb thumb--${size}" src="${esc(ship.image)}"${ship.imageFallback ? ` data-fallback="${esc(ship.imageFallback)}"` : ""} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="thumb thumb--${size} thumb--empty" aria-hidden="true"></span>`;

/**
 * Clickable ship name for the replacement planning (Optimise and Coverage cards; main.js handles the clicks).
 *   red hatched   = marked "to replace"      (state.marked)
 *   green hatched = chosen as a substitute   (values of state.chosen)
 * Without `choose` the click toggles the red mark (data-mark).
 * With `choose` = name of the ship to replace, the click picks this ship as its substitute (data-choose / data-for).
 */
export function markable(ship, html, { marked, chosen }, choose = null) {
  // included vessels cannot be given away on their own (they leave with the parent) – but can be a substitute
  if (ship.includedOnly && !choose) return `<span class="ship-mark is-included">${html}</span>`;
  const isRed = marked.includes(ship.name);
  const isGreen = Object.values(chosen).includes(ship.name);
  const cls = "ship-mark" + (isRed ? " is-marked" : "") + (isGreen ? " is-chosen" : "");
  // the tooltip names the current state first (the legend is folded away), then what a click does
  const stateText = isRed ? t("legend_marked") + " – " : isGreen ? t("legend_chosen") + " – " : "";
  const action = choose
    ? `data-choose="${esc(ship.name)}" data-for="${esc(choose)}" aria-pressed="${chosen[choose] === ship.name}" title="${esc(stateText + t("choose_title", { s: choose }))}"`
    : `data-mark="${esc(ship.name)}" aria-pressed="${isRed}" title="${esc(stateText + t("mark_title"))}"`;
  return `<button type="button" class="${cls}" ${action}>${html}</button>`;
}

/** Ship name followed by its melt status (grey "?" pair if the import had no melt data). */
export const shipWithMelt = (ship) => shipLabel(ship) + meltIcon(ship);

/** Insurance as text: LTI first, then the longest term. */
export function insuranceText(ship) {
  if (!ship.insurance || !ship.insurance.length) return "–";
  const label = (v) => (/^lti$/i.test(v) ? "LTI" : /^\d+$/.test(v) ? `${v} ${t("months")}` : v);
  return [...ship.insurance]
    .sort((a, b) => /lti/i.test(b) - /lti/i.test(a) || +b - +a)
    .map((v) => esc(label(v))) // values come from import files – always escape
    .join(", ");
}

/** ⇄ toggle to mark a ship for comparison. */
export const compareToggle = (shipName, selected) =>
  `<button type="button" class="cmp-toggle" data-compare="${esc(shipName)}" aria-pressed="${selected}" title="${esc(t("legend_compare"))}" aria-label="${esc(t("legend_compare") + ": " + shipName)}">⇄</button>`;
