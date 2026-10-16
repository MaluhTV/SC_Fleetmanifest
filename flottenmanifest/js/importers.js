/**
 * Import of hangar exports.
 *
 * Each format is an object in the IMPORTERS list with:
 *   id       short technical name
 *   label    display name (shown in messages)
 *   detect   (text, ctx) => true if the file belongs to this format
 *   parse    (text, ctx) => { items, account }
 *
 * items is a list of entries in a common shape:
 *   { name: string, qty: number, insurance?: string, meltable?: boolean|null }
 *   insurance: "LTI", a number of months as text (e.g. "120") or ""
 *
 * Adding a format: create an object following the pattern below and add it to IMPORTERS.
 * Order matters – the first format whose detect() returns true wins.
 * See also docs/IMPORT-FORMATS.md.
 */
import { sanitizeItem } from "./state.js";

/* ---------- Shared helpers ---------- */

/** Simple CSV parser (comma separator, quotes, line breaks inside fields). */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}

/** CSV with header row: returns the header (lower-case) and an accessor get(row, column). */
function csvTable(text) {
  const rows = parseCSV(text);
  const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const get = (row, col) => {
    const i = header.indexOf(col);
    return i < 0 ? "" : String(row[i] ?? "").trim();
  };
  return { header, rows: rows.slice(1), get };
}

const looksLikeJson = (text) => /^[[{]/.test(text.trimStart());
const slugToName = (slug) => String(slug || "").replace(/[-_]+/g, " ").trim();
const toBool = (v) => (v === "true" ? true : v === "false" ? false : null);

/** Returns the first name found in the database, otherwise the first non-empty one. */
function bestName(ctx, ...candidates) {
  const list = candidates.map((c) => String(c || "").trim()).filter(Boolean);
  return list.find((c) => ctx.db.match(c)) || list[0] || "";
}

/* ---------- Format: HangarLink (CSV) ----------
 * One row per pledge. Ships are listed in the "Items" column as
 * [|TITLE| Name |KIND| Ship |…|SHIP| slug …]. Only rows with Source = Active count.
 */
const hangarLinkCsv = {
  id: "hangarlink-csv",
  label: "HangarLink CSV",
  detect(text) {
    if (looksLikeJson(text)) return false;
    const { header } = csvTable(text.split(/\r?\n/, 1)[0]);
    return ["hangar", "source", "items"].every((c) => header.includes(c));
  },
  parse(text, ctx) {
    const { rows, get } = csvTable(text);
    const items = [];
    let account = "";
    const titleOf = (part) => part.split("|KIND|")[0].split("|CUSTOMNAME|")[0].trim();

    for (const row of rows) {
      if (get(row, "source").toLowerCase() !== "active") continue;
      account ||= get(row, "hangar");
      const parts = [...get(row, "items").matchAll(/\[\|TITLE\|([\s\S]*?)\]/g)].map((m) => m[1]);

      // best insurance in the pledge: LTI first, then the longest term
      let insurance = "";
      parts.filter((p) => /\|KIND\|\s*Insurance/.test(p)).map(titleOf).forEach((title) => {
        const v = /lifetime/i.test(title) ? "LTI" : (title.match(/(\d+)\s*Month/i) || [])[1] || "";
        if (v === "LTI" || (insurance !== "LTI" && +v > +(insurance || 0))) insurance = v;
      });

      const ships = parts
        .filter((p) => /\|KIND\|\s*Ship/.test(p))
        .map((p) => bestName(ctx, titleOf(p), slugToName((p.match(/\|SHIP\|\s*(\S+)/) || [])[1])));

      // Some pledges list the ship only in "Contains" ("Ship name and 2 items")
      if (!ships.length && /^(ship|pack)$/i.test(get(row, "type"))) {
        const name = get(row, "contains").replace(/\s+and\s+.*$/i, "").trim();
        if (name && !/^\d+\s+items?$/i.test(name)) ships.push(name);
      }
      ships.forEach((name) => items.push({ name, qty: 1, insurance, meltable: null }));
    }
    return { items, account };
  },
};

/* ---------- Format: hangar export with a "name" column (CSV) ----------
 * One row per ship, e.g. from Hangar XPLORer / ships_YYYY-MM-DD.csv.
 * Optional columns: insurance, isMeltable, account. Prices and pledge IDs are ignored.
 */
const shipListCsv = {
  id: "ship-list-csv",
  label: "Ship list CSV (\"name\" column)",
  detect(text) {
    if (looksLikeJson(text)) return false;
    return csvTable(text.split(/\r?\n/, 1)[0]).header.includes("name");
  },
  parse(text) {
    const { rows, get } = csvTable(text);
    const items = rows
      .map((row) => ({
        name: get(row, "name"),
        qty: 1,
        insurance: get(row, "insurance"),
        meltable: toBool(get(row, "ismeltable").toLowerCase()),
      }))
      .filter((x) => x.name);
    const account = rows.map((r) => get(r, "account")).find(Boolean) || "";
    return { items, account };
  },
};

/* ---------- Format: STARJUMP FleetViewer (JSON) ----------
 * Layout file of a fleet graphic. Ships are canvasItems with itemType "SHIP".
 * defaultText may be "Custom name\nModel" – the last line is used.
 */
const fleetViewerJson = {
  id: "fleetviewer-json",
  label: "FleetViewer JSON",
  detect(text) {
    return looksLikeJson(text) && /"canvasItems"\s*:/.test(text);
  },
  parse(text, ctx) {
    const doc = JSON.parse(text);
    const items = (doc.canvasItems || [])
      .filter((i) => i && i.itemType === "SHIP")
      .map((i) => {
        const label = String(i.defaultText || "").split("\n").filter(Boolean).pop() || "";
        return { name: bestName(ctx, label, slugToName(i.variantSlug || i.shipSlug)), qty: 1 };
      })
      .filter((x) => x.name);
    return { items, account: "" };
  },
};

/* ---------- Format: generic JSON list ----------
 * Accepts ["Name", …] or [{ name|shipName|model.name, quantity|qty|count, slug }, …],
 * also wrapped in { ships: […] }, { vehicles: […] }, { fleet: […] }, { hangar: […] }.
 */
const genericJson = {
  id: "generic-json",
  label: "JSON list",
  detect(text) {
    if (!looksLikeJson(text)) return false;
    try {
      const d = JSON.parse(text);
      return Array.isArray(d) || ["ships", "vehicles", "fleet", "hangar", "items", "data"].some((k) => Array.isArray(d?.[k]));
    } catch {
      return false;
    }
  },
  parse(text, ctx) {
    const d = JSON.parse(text);
    const list = Array.isArray(d) ? d : d.ships || d.vehicles || d.fleet || d.hangar || d.items || d.data;
    const items = [];
    let account = "";
    for (const e of list) {
      if (typeof e === "string") { items.push({ name: e.trim(), qty: 1 }); continue; }
      if (!e || typeof e !== "object") continue;
      const model = e.model && typeof e.model === "object" ? e.model : {};
      const name = bestName(ctx, e.name, e.shipName, e.ship_name, e.modelName, model.name, e.title, e.ship,
        slugToName(e.slug || model.slug || e.shipSlug));
      if (!name) continue;
      items.push({ name, qty: +(e.quantity || e.qty || e.count) || 1 });
      if (!account && typeof e.account === "string") account = e.account;
    }
    return { items, account };
  },
};

/** All supported file formats, in detection order. */
export const IMPORTERS = [hangarLinkCsv, shipListCsv, fleetViewerJson, genericJson];

/**
 * Detects the format and parses the file.
 * @returns {{format:string, items:Array, account:string}|null}  null = unknown format
 */
export function importFile(text, db) {
  const clean = String(text).replace(/^﻿/, ""); // strip BOM
  const ctx = { db };
  const importer = IMPORTERS.find((imp) => {
    try { return imp.detect(clean, ctx); } catch { return false; }
  });
  if (!importer) return null;
  const result = importer.parse(clean, ctx);
  // every importer's output goes through the same check: allowed fields, insurance only "LTI" or months
  return { format: importer.label, ...result, items: result.items.map(sanitizeItem).filter((i) => i.name) };
}

/** Pasted list: one ship per line, optionally "2x Name" or "2 × Name". */
export function importTextList(text) {
  return String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s*[x×]\s*(.+)$/i);
      return sanitizeItem(m ? { name: m[2].trim(), qty: +m[1] } : { name: line, qty: 1 });
    });
}
