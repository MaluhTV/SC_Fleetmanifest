/**
 * The sticky area (tabs, legend, loop bar) and the scroll spy.
 *
 * - Sticky height: written to the CSS variables --fm-tabs-h and --fm-sticky-h, so jump targets land below the
 *   sticky area (scroll-margin-top in the CSS). On phones .fm-sticky is display: contents and only the tabs and the
 *   loop bar stick – then the height is tabs + bar.
 * - Scroll spy: frames the loop-bar square (.is-current) of the card at the top of the view, in the tabs whose
 *   cards belong to one loop each (SPY). Cards side by side share a row – then the square last clicked wins.
 *
 *   const spy = initSticky({ sticky, tabs, bars, view: () => state.view, onFrame });
 *   spy.queue()  – call after anything that moves cards or re-renders a bar (runs once per animation frame)
 */
import { $$ } from "../util.js";

/** Per view: the cards, how to read their slot key, the bar element id and the bar's data attribute (dataset name). */
const SPY = {
  loops: { cards: "#loopCards .loop-card[id^='loop-']", key: (c) => c.id.slice(5), bar: "loopBar", attr: "loopJump" },
  overlaps: { cards: "#overlapCards article[id^='ov-']:not(#ov-gaps)", key: (c) => c.id.slice(3), bar: "overlapBar", attr: "ovJump" },
  planner: { cards: "#plannerSlots .plan-card[data-loop]", key: (c) => c.dataset.loop, bar: "plannerBar", attr: "coverLoop" },
};

export function initSticky({ sticky, tabs, bars, view, onFrame = () => {} }) {
  const phoneLayout = () => getComputedStyle(sticky).display === "contents";
  const openBar = () => bars.find((b) => !b.hidden);
  /** Height of what stays fixed at the top. */
  const area = () => (phoneLayout() ? tabs.offsetHeight + (openBar()?.offsetHeight || 0) : sticky.offsetHeight);
  /** Viewport y of the lower edge of the fixed top area. */
  const bottom = () => (phoneLayout()
    ? Math.max(tabs.getBoundingClientRect().bottom, openBar()?.getBoundingClientRect().bottom || 0)
    : sticky.getBoundingClientRect().bottom);

  let picked = null; // slot key last clicked in a bar
  function frameCurrent() {
    const spy = SPY[view()];
    if (!spy) return;
    const line = bottom() + 24;
    const cards = $$(spy.cards).filter((c) => c.offsetParent); // hidden cards (filters) do not count
    // the last row of cards whose top has passed the line under the sticky area (otherwise the first card)
    let rowTop = null;
    for (const c of cards) { const top = c.getBoundingClientRect().top; if (top <= line && (rowTop === null || top > rowTop)) rowTop = top; }
    const row = rowTop === null ? cards.slice(0, 1) : cards.filter((c) => Math.abs(c.getBoundingClientRect().top - rowTop) < 2);
    const current = row.find((c) => spy.key(c) === picked) || row[0];
    const key = current ? spy.key(current) : null;
    document.getElementById(spy.bar).querySelectorAll(".cover-item").forEach((b) => b.classList.toggle("is-current", b.dataset[spy.attr] === key));
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; frameCurrent(); onFrame(); });
  };

  addEventListener("scroll", queue, { passive: true });
  document.addEventListener("click", (e) => {
    const item = e.target.closest(".fm-bar .cover-item");
    const spy = SPY[view()];
    if (item && spy) picked = item.dataset[spy.attr];
  }, true);
  // the bars are re-rendered often – frame the current square again afterwards
  new MutationObserver(queue).observe(sticky, { childList: true, subtree: true });

  const writeHeights = () => {
    const root = document.documentElement.style;
    root.setProperty("--fm-tabs-h", tabs.offsetHeight + "px");
    root.setProperty("--fm-sticky-h", area() + "px");
  };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(writeHeights);
    [sticky, tabs, ...bars].forEach((x) => ro.observe(x));
  }
  writeHeights();

  return { queue };
}
