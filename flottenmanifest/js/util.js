/** Small helpers without domain logic. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Escapes HTML special characters – everything that comes from import files goes through here. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Normalizes names for matching: lower-case, special characters become spaces. */
export function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Sum over a list: sum(ships, s => s.scu * s.qty) */
export const sum = (list, fn) => list.reduce((acc, x) => acc + fn(x), 0);

/**
 * Browser storage (localStorage) with the prefix "fm_".
 * If access fails (private window, blocked), the page keeps working without saving.
 */
const PREFIX = "fm_";
export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* saving not possible – ignore */
    }
  },
};
