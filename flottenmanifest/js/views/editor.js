/**
 * In-page editor for ship entries (dialog #editDialog in index.html).
 *
 * Changes are not written to data/ships.json directly (a static page cannot do that). They are kept as
 * "overrides" in the browser (state.overrides, localStorage fm_overrides) and laid over ships.json
 * (applyOverrides in js/shipdb.js). "Export" downloads a complete ships.json with all changes, which a
 * developer copies to data/ships.json and checks with: node tools/validate-ships.mjs --format
 */
import { t } from "../i18n.js";
import { esc } from "../util.js";
import { EDITABLE_FIELDS, FIGHTER_CLASSES, applyOverrides } from "../shipdb.js";
import { loopName } from "./common.js";

const STATUSES = ["flight-ready", "in-production", "concept"];
const ROLES = ["", "primary", "secondary", "planned"];
const SIZE_PATTERN = /^(S[1-6] (Snub|Small|Medium|Large|Capital)|Snub|Small|Medium|Large|Capital|Ground vehicle)$/;

const field = (label, input) => `<label class="ed-field"><span>${label}</span>${input}</label>`;
const numInput = (name, value, step = "any") =>
  `<input type="number" name="${name}" min="0" step="${step}" value="${value ?? ""}">`;

/** Fills the dialog form for one ship. `ship` = current values (incl. overrides), `edited` = has overrides. */
export function renderEditor(form, ship, db, edited) {
  const roleSelect = (loopId) => {
    const current = ship.loops[loopId] || "";
    return `<select name="loop:${esc(loopId)}" class="ed-role ed-role--${current || "none"}">${ROLES.map((r) =>
      `<option value="${r}" ${r === current ? "selected" : ""}>${r ? t("legend_" + r) : "–"}</option>`).join("")}</select>`;
  };
  form.innerHTML = `
    <h3>${t("edit_title", { s: esc(ship.name) })}</h3>
    <p class="muted">${t("edit_hint")}</p>
    <div class="ed-grid">
      ${field(t("col_size"), `<input name="size" value="${esc(ship.size)}" list="edSizes" required>`)}
      ${field(t("col_status"), `<select name="status">${STATUSES.map((s) => `<option value="${s}" ${s === ship.status ? "selected" : ""}>${t("status_" + s)}</option>`).join("")}</select>`)}
      ${field(t("col_length"), numInput("length", ship.length))}
      ${field(t("col_beam"), numInput("beam", ship.beam))}
      ${field(t("col_height"), numInput("height", ship.height))}
      ${field("SCU", numInput("scu", ship.scu))}
      ${field(t("edit_crew_min"), numInput("crewMin", ship.crewMin, "1"))}
      ${field(t("edit_crew_max"), numInput("crewMax", ship.crewMax, "1"))}
      ${field(t("col_fighter_class"), `<select name="fighterClass">${["", ...FIGHTER_CLASSES].map((c) =>
        `<option value="${c}" ${c === (ship.fighterClass || "") ? "selected" : ""}>${c ? t("fc_" + c) : "–"}</option>`).join("")}</select>`)}
    </div>
    <datalist id="edSizes">${["S1 Snub", "S1 Small", "S2 Small", "S3 Medium", "S4 Large", "S5 Large", "S6 Capital", "Capital", "Ground vehicle"].map((s) => `<option value="${s}">`).join("")}</datalist>
    <h4>${t("edit_loops")}</h4>
    <div class="ed-loops">${db.loops.map((l) => field(loopName(db, l.id), roleSelect(l.id))).join("")}</div>
    <div class="ed-grid ed-grid--notes">
      ${field(t("edit_note_de"), `<input name="note.de" value="${esc(ship.note.de)}">`)}
      ${field(t("edit_note_en"), `<input name="note.en" value="${esc(ship.note.en)}">`)}
    </div>
    <p class="ed-error bad" hidden></p>
    <div class="ed-actions">
      <button type="submit" class="btn btn--primary" value="save">${t("edit_save")}</button>
      <button type="button" class="btn" data-edit-cancel>${t("edit_cancel")}</button>
      ${edited ? `<button type="button" class="btn" data-edit-reset>${t("edit_reset")}</button>` : ""}
    </div>`;
  form.dataset.ship = ship.name;
}

/**
 * Reads the form and returns { values } or { error }. values contains every editable field.
 */
export function readEditor(form) {
  const f = new FormData(form);
  const num = (k) => (f.get(k) === "" ? null : Number(f.get(k)));
  const values = {
    size: String(f.get("size")).trim(),
    status: f.get("status"),
    length: num("length"), beam: num("beam"), height: num("height"),
    scu: num("scu") ?? 0,
    crewMin: num("crewMin"), crewMax: num("crewMax"),
    loops: {},
    fighterClass: f.get("fighterClass") || null,
    note: { de: String(f.get("note.de")).trim(), en: String(f.get("note.en")).trim() },
  };
  for (const [k, v] of f.entries()) if (k.startsWith("loop:") && v) values.loops[k.slice(5)] = v;

  if (!SIZE_PATTERN.test(values.size)) return { error: t("edit_err_size") };
  if (!Number.isInteger(values.crewMin) || !Number.isInteger(values.crewMax) || values.crewMin < 1 || values.crewMin > values.crewMax) return { error: t("edit_err_crew") };
  if (!Object.keys(values.loops).length) return { error: t("edit_err_loops") };
  return { values };
}

/** Only the fields that differ from the original entry in ships.json (empty object = no change). */
export function diffFromOriginal(original, values) {
  const diff = {};
  for (const k of EDITABLE_FIELDS) if (JSON.stringify(original[k] ?? null) !== JSON.stringify(values[k] ?? null)) diff[k] = values[k];
  return diff;
}

/** Complete ships.json (original file + all overrides) as a download. */
export function downloadShipsJson(rawShipsDoc, overrides) {
  const doc = applyOverrides(rawShipsDoc, overrides);
  doc.meta = { ...doc.meta, updated: new Date().toISOString().slice(0, 10) };
  const blob = new Blob([JSON.stringify(doc, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ships.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
