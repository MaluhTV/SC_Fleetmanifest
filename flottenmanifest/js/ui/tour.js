/**
 * First-visit introduction: a few short hints one after another, each pointing at an element of the page.
 * Finished or skipped = stored as fm_tour, so it shows only once ("Einführung zeigen" under "Weitere Optionen" restarts it).
 *
 *   const tour = createTour([{ target: () => element, text: "i18n_key" }, …]);
 *   tour.show(0) · tour.place() (after scroll / resize) · tour.end() · tour.isOpen()
 */
import { $$, esc, storage } from "../util.js";
import { t } from "../i18n.js";

export function createTour(steps) {
  let step = -1, box = null;

  function show(n) {
    step = n;
    if (!box) {
      box = document.createElement("div");
      box.className = "fm-tour";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-live", "polite");
      box.addEventListener("click", (e) => {
        if (e.target.closest("[data-tour-next]")) return step + 1 < steps.length ? show(step + 1) : end();
        if (e.target.closest("[data-tour-skip]")) end();
      });
      document.body.append(box);
    }
    const s = steps[n];
    const last = n === steps.length - 1;
    box.innerHTML = `<p><small class="muted">${n + 1} / ${steps.length}</small><br>${esc(t(s.text))}</p>
    <div class="fm-row"><button type="button" class="btn btn--primary" data-tour-next>${esc(t(last ? "tour_done" : "tour_next"))}</button>${last ? "" : `<button type="button" class="btn" data-tour-skip>${esc(t("tour_skip"))}</button>`}</div>`;
    const target = s.target();
    $$(".is-tour-target").forEach((x) => x.classList.remove("is-tour-target"));
    target.classList.add("is-tour-target");
    target.scrollIntoView({ block: "center" });
    place();
    box.querySelector("[data-tour-next]").focus({ preventScroll: true });
  }

  /** Puts the hint below its target (or above it when there is no room); positions via CSSOM – the CSP allows no style="…". */
  function place() {
    if (!box || step < 0) return;
    const r = steps[step].target().getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = Math.min(Math.max(8, r.left), innerWidth - w - 8) + "px";
    box.style.top = r.bottom + 10 + h < innerHeight ? r.bottom + 10 + "px" : Math.max(8, r.top - h - 10) + "px";
  }

  function end() {
    step = -1;
    if (box) { box.remove(); box = null; }
    $$(".is-tour-target").forEach((x) => x.classList.remove("is-tour-target"));
    storage.set("tour", true);
  }

  return { show, place, end, isOpen: () => step >= 0 };
}
