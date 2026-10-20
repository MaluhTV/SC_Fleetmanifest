/**
 * Touch screens have no hover, so title texts never show up. There a tap shows the title in a small bubble
 * for a few seconds; the tap still does its normal job (jump to a loop, mark a ship …).
 * Inputs, melt icons, the melt menu and dialogs are left alone. The text is set as plain text, never as HTML.
 */
export function initTapTips() {
  const noHover = window.matchMedia ? matchMedia("(hover: none)") : { matches: false };
  let tip = null, timer, sticky = false; // sticky: the host stays in place while the page scrolls (loop bar)
  const hide = () => { if (tip) { tip.remove(); tip = null; } clearTimeout(timer); };

  document.addEventListener("click", (e) => {
    hide();
    if (!noHover.matches) return;
    const host = e.target.closest("[title]");
    if (!host || host.matches("input, select, textarea, [data-melt]") || host.closest(".fm-melt-menu, dialog")) return;
    const text = host.getAttribute("title");
    if (!text) return;
    sticky = !!host.closest(".fm-bar");
    tip = document.createElement("div");
    tip.className = "fm-tip";
    tip.setAttribute("role", "status");
    tip.textContent = text;
    document.body.append(tip);
    const r = host.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8) + "px";
    tip.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + "px";
    timer = setTimeout(hide, 3500);
  }, true);
  addEventListener("scroll", () => { if (!sticky) hide(); }, { passive: true });
}
