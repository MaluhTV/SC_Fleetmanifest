/** Building blocks shared by several views. They return HTML strings. */
import { t, fmt, getLang } from "../i18n.js";
import { esc } from "../util.js";

/** Loop name in the current language (falls back to German). */
/**
 * One small line icon per gameplay loop (16×16, stroke = currentColor), keyed by the loop ID in data/loops.json.
 * New loop: add an entry here, otherwise LOOP_ICON_FALLBACK (a dot) is shown.
 */
const loopSvg = (inner) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const LOOP_ICONS = {
  cargo: loopSvg('<path d="M2 5l6-3 6 3v6l-6 3-6-3z M2 5l6 3 6-3 M8 8v6"/>'),
  "vehicle-transport": loopSvg('<path d="M1 4h9v7H1z M10 7h3l2 2v2h-5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/>'),
  mining: loopSvg('<path d="M4.5 2h7L15 6l-7 8-7-8z M1 6h14 M6 2 5 6l3 8 3-8-1-4"/>'),
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
 * Used by the loop tab, matrix, ship list, overlaps (coverage of the fleet) and the fleet planner (coverage of the plan).
 */
const BAR_LEVELS = { full: " is-filled", partial: " is-partial", plain: " is-plain", gap: " is-gap", planned: " is-planned-only" };
export function loopBar(db, cells, { attr, label, summary, active = null }) {
  const items = db.loops.map(({ id }) => id).map((id) => {
    const c = cells[id] || { n: 0, level: "", text: loopText(db, id) };
    return `<button type="button" class="cover-item${BAR_LEVELS[c.level] || ""}${c.changed ? " is-changed" : ""}${active === id ? " is-active" : ""}" data-${attr}="${esc(id)}" aria-pressed="${active === id}" title="${esc(c.text)}" aria-label="${esc(c.text)}">
      <span class="cover-icon">${loopIcon(id)}</span><span class="cover-cell">${c.n || ""}</span></button>`;
  }).join("");
  return `<div class="cover-bar" role="group" aria-label="${esc(label)}"><div class="cover-cells">${items}</div><span class="muted cover-sum">${summary}</span></div>`;
}

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
 * Lock icons (12×12, same body and shackle; colour comes from CSS via currentColor).
 *   lock          closed, red   – neither meltable nor upgradeable
 *   lockOpen      open, green   – meltable
 *   lockAlert     open with an exclamation mark, orange – meltable, but not upgradeable
 *   lockUpgrade   closed with an up arrow, yellow – not meltable, upgrade (CCU) only
 *   warn          exclamation mark in a yellow circle – a hint shown on hover
 * In index.html, <span data-icon="lock|lockOpen|lockUpgrade"> is filled by main.js.
 */
const svg = (inner) => `<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">${inner}</svg>`;
const LOCK_BODY = '<rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor"/>';
export const ICONS = {
  lock: svg(LOCK_BODY + '<path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
  lockOpen: svg(LOCK_BODY + '<path d="M4 5.5V3.2a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
  warn: svg('<circle cx="6" cy="6" r="5.6" fill="currentColor"/>' +
    '<path d="M6 3.1v3.7" fill="none" class="ic-cut" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="6" cy="8.9" r="0.9" class="ic-dot"/>'),
  lockAlert: svg(LOCK_BODY + '<path d="M4 5.5V3.2a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6 6.8v2" fill="none" class="ic-cut" stroke-width="1.5" stroke-linecap="round"/><circle cx="6" cy="10" r=".75" class="ic-dot"/>'),
  lockUpgrade: svg(LOCK_BODY + '<path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6 10.1V7M4.3 8.7 6 7l1.7 1.7" fill="none" class="ic-cut" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
};
export const LOCK_ICON = ICONS.lock;
/** Hangar (rounded hall with an open gate) – "in your fleet"; check mark – "selected" (fleet planner). */
ICONS.hangar = svg('<path d="M.8 11.2V6.6a5.2 5.2 0 0 1 10.4 0v4.6H8.4V7.6H3.6v3.6Z" fill="currentColor"/>');
ICONS.check = svg('<path d="M2.2 6.3 4.9 9l5-5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>');

/**
 * Melt / upgrade pair (two independent yes/no marks):
 *   exchange  two circular arrows – "Exchange" (melt for store credit) possible
 *   upgrade   arrow up            – CCU upgrade possible
 * Active = coloured (green / blue), not possible = grey and struck through (CSS .mp--off).
 */
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
 * Melt status icon (ship.melt from buildFleet): clickable, main.js opens the choice menu via data-melt.
 *   shown as a pair: exchange mark + upgrade mark, each active or struck through (meltPair)
 * showMeltable: false in the general lists (only problems are shown), true in the overlaps tab.
 */
const MELT_TEXT = { meltable: "melt_ok", meltOnly: "melt_only", upgrade: "melt_upgrade_only", locked: "melt_locked" };
export function meltIcon(ship, showMeltable = false) {
  // unknown (import without melt data): grey "?" pair, so the status can still be set by click –
  // only for fleet ships (they have qty) and only where all states are shown
  if (!ship.melt) {
    if (!showMeltable || !ship.qty) return "";
    const text = t("melt_unknown") + " – " + t("melt_click");
    return ` <span class="melt-icon melt-pair melt-pair--unknown" role="button" tabindex="0" data-melt="${esc(ship.name)}" title="${esc(text)}" aria-label="${esc(text)}"><span class="mp">${ICONS.exchange}</span><span class="mp">${ICONS.upgrade}</span><span class="mp-q">?</span></span>`;
  }
  if (ship.melt === "meltable" && !showMeltable) return "";
  let text = t(MELT_TEXT[ship.melt]);
  if (ship.notMeltable && ship.notMeltable < ship.qty) text += " · " + t("not_meltable_partial", { n: ship.notMeltable, q: ship.qty });
  if (ship.meltManual) text += " · " + t("melt_manual");
  text += " – " + t("melt_click");
  return ` <span class="melt-icon melt-pair${ship.meltManual ? " is-manual" : ""}" role="button" tabindex="0" data-melt="${esc(ship.name)}" title="${esc(text)}" aria-label="${esc(text)}">${meltPair(ship.melt)}</span>`;
}
/** Older names, kept for the views: lists show only problems, the overlaps tab shows all three states. */
// All tabs show every melt state (incl. "exchange + upgrade possible"), so a ship looks the same everywhere.
export const meltTag = (ship) => meltIcon(ship, true);
export const meltBadge = (ship) => meltIcon(ship, true);

/** Ship name with quantity (×2) and lock icon (lock: false when a meltBadge follows anyway). */
export const shipLabel = (ship, { lock = true } = {}) =>
  esc(ship.name) + (ship.qty > 1 ? ` <span class="qty">×${ship.qty}</span>` : "") + (lock ? meltTag(ship) : "");

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
 * Clickable ship name for the replacement planning (overlaps tab and loop cards; main.js handles the clicks).
 *   red hatched   = marked "to replace"      (state.marked)
 *   green hatched = chosen as a substitute   (values of state.chosen)
 * Without `choose` the click toggles the red mark (data-mark).
 * With `choose` = name of the ship to replace, the click picks this ship as its substitute (data-choose / data-for).
 */
export function markable(ship, html, { marked, chosen }, choose = null) {
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

/** Ship name followed by its melt badge; falls back to the lock icon if meltability is unknown. */
export const shipWithMelt = (ship) => shipLabel(ship, { lock: false }) + meltBadge(ship);

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
