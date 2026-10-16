/** Building blocks shared by several views. They return HTML strings. */
import { t, fmt, getLang } from "../i18n.js";
import { esc } from "../util.js";

/** Loop name in the current language (falls back to German). */
export function loopName(db, loopId) {
  const loop = db.loops.find((l) => l.id === loopId);
  return loop ? loop[getLang()] || loop.de : loopId;
}

/** Size class for display ("Ground vehicle" is translated). */
export const sizeLabel = (size) => (size === "Ground vehicle" ? t("size_ground") : size);

export const note = (ship) => (ship.note && (ship.note[getLang()] || ship.note.de)) || "";

/** Role mark ● ○ ◇ */
// Role marks are drawn in CSS (.mk::before), so they are centred regardless of the font.
export const roleMark = (role) => `<span class="mk mk--${role}" role="img" aria-label="${t("legend_" + role)}"></span>`;

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
    '<path d="M6 3.1v3.7" fill="none" style="stroke:var(--panel)" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="6" cy="8.9" r="0.9" style="fill:var(--panel)"/>'),
  lockAlert: svg(LOCK_BODY + '<path d="M4 5.5V3.2a2 2 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6 6.8v2" fill="none" style="stroke:var(--panel)" stroke-width="1.5" stroke-linecap="round"/><circle cx="6" cy="10" r=".75" style="fill:var(--panel)"/>'),
  lockUpgrade: svg(LOCK_BODY + '<path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<path d="M6 10.1V7M4.3 8.7 6 7l1.7 1.7" fill="none" style="stroke:var(--panel)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
};
export const LOCK_ICON = ICONS.lock;

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
    ? `<img class="thumb thumb--${size}" src="${esc(ship.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
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
  const action = choose
    ? `data-choose="${esc(ship.name)}" data-for="${esc(choose)}" aria-pressed="${chosen[choose] === ship.name}" title="${esc(t("choose_title", { s: choose }))}"`
    : `data-mark="${esc(ship.name)}" aria-pressed="${isRed}" title="${esc(t("mark_title"))}"`;
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
    .map(label)
    .join(", ");
}

/** ⇄ toggle to mark a ship for comparison. */
export const compareToggle = (shipName, selected) =>
  `<button type="button" class="cmp-toggle" data-compare="${esc(shipName)}" aria-pressed="${selected}" title="${esc(t("legend_compare"))}" aria-label="${esc(t("legend_compare") + ": " + shipName)}">⇄</button>`;
