# Architecture

Plain HTML, CSS and JavaScript (ES modules). There is no framework. Each file has one job.

The source version (`index.html`) runs as it is on any web server. The only build step is optional: `tools/build-standalone.mjs` bundles everything into `dist/flottenmanifest.html` for users who open the page from disk. Its mini bundler wraps each module in a function and supports only `import { … } from "…"` plus `export function/const/let/class`. Stick to these forms, or the build stops with an error. In that file the data is embedded as `globalThis.FM_DATA`, which `loadJson()` in `js/shipdb.js` reads before falling back to `fetch()`.

## Data flow

```
data/ships.json ─┐
data/loops.json ─┼─ shipdb.loadShipDb() ──► db  { ships, loops, example, byName(), match() }
example-fleet ───┘

file / text box ── importers.importFile() ──► items [{ name, qty, insurance, meltable }]
                                                 │ state.save.fleet()  → localStorage "fm_fleet"
                                                 ▼
                 analysis.buildFleet(items, db) ──► fleet { ships (database values + qty, insurance, notMeltable), unknown }
                                                 │
                 main.renderAll() ──► views/*.render…(element, { db, fleet, state })
```

- **`state`** (`js/state.js`) holds everything the user sets: language, name, fleet, compare selection, active tab and sorting. Every change goes through `save.*()` and is followed by a re-render.
- **Views** (`js/views/*.js`) are pure functions. They take an element and `{ db, fleet, state }` and set `innerHTML`. They don't bind events. `main.js` does that via event delegation (`data-compare`, `data-remove`, `data-sort`).
- **Security:** everything from import files and from `localStorage` is untrusted.
  - Output: every value that ends up in `innerHTML` goes through `esc()` (`js/util.js`). New view code must do the same; only translation texts from `i18n.js` and fixed markup are inserted unescaped.
  - Input: `sanitizeItem()` (`js/state.js`) checks every imported and stored fleet entry (insurance only `LTI` or a number of months); `loadState()` validates all other stored values, and `sanitizeOverride()` (`js/shipdb.js`) checks editor overrides field by field.
  - External requests: none, except ship images linked to RSI (`data/image-urls.json` or a release built with `--remote-images`). Fonts are in `fonts/`.

## Where do I change what?

| I want to … | File |
|---|---|
| add a tab | Several places, see the steps after this table. |
| add a column to the ship list | `COLUMNS` in `views/list.js` (+ heading in `i18n.js`) |
| add a row to the compare table | `ROWS` in `views/compare.js` |
| change the KPIs at the top | `views/kpis.js` |
| change an icon (roles, locks) | `ICONS` in `views/common.js`, role marks via `.mk--*::before` in the CSS; legend icons use `<span data-icon="…">` in `index.html` |
| change the max. number of compared ships | `MAX_COMPARE` in `state.js` |
| add extra data to the overlaps tab (chips) | `OV_DETAILS` in `views/overlaps.js` + label in `i18n.js` |
| change what the ship editor can edit | `EDITABLE_FIELDS` in `shipdb.js` + form in `views/editor.js` |

Adding a tab takes these steps:

1. Add a section `<section id="view-xyz">` to `index.html`.
2. Add a tab button with `data-view="xyz"`.
3. Add `"xyz"` to `VIEWS` in `state.js`.
4. Create a new file `views/xyz.js`.
5. Call it in `renderAll()` in `main.js`.
6. Add the texts to `i18n.js`.

## Analysis

All rules live in one place, `js/analysis.js`:

- **Overlap:** a loop has at least `OVERLAP_MIN_SHIPS` (3) flight-ready ships in a primary role.
- **Per category:** each overlap card is evaluated on its own. Ship O can replace ship S in loop L (`substitutesInLoop()`) when:
  - O has L as a primary role
  - O is at least as large
  - for cargo, O has at least as much SCU
  - for fighters, O has at least S's fighter class (`fighterClassAcceptable()`): snub < light < medium < heavy; interceptor, stealth, interdiction and bomber only by the same class. Ships without a class are compared by size only. Substitutes of the nearest class are named first.
  - O's minimum crew is at most `CREW_GROWTH_MAX` (1.75) × S's minimum crew; a solo ship may be replaced by a 2-seater (1 → 2 ok, 1 → 3 no, 3 → 5 ok, 3 → 6 no, 6 → 10 ok)
- **Which substitute is named:** the closest match (`findReplacements()` sorts by size, minimum crew, number of lost loops, SCU). Further matches are shown in brackets.
- **Lost loops:** other loops S plays that O does not (`lostLoops()`). They don't block the suggestion; the view shows a yellow (!) with a tooltip, and says if no other primary ship in the fleet covers them.
- **Excluded as candidates:** ground vehicles and ships owned more than once (unless the user marked them).
- **Chosen substitutes** (`state.chosen` = `{ shipToReplace: substitute }`, stored as `fm_chosen`): clicking a suggested substitute (`data-choose` + `data-for`) picks it in green and marks the replaced ship red; a second click undoes both. A green ship cannot be red at the same time – marking it red drops the pick. `analyseOverlaps(…, chosen)` lists a valid pick first ("replaced by").
- **Marked ships** (`state.marked`, stored as `fm_marked`): clicking a ship name (`data-mark`) in the overlaps tab or a loop card marks it "to replace". `analyseOverlaps(ships, loops, marked)` then never offers marked ships as substitutes, lists marked ships first (or "no substitute left"), and computes gaps and orphan snubs as if the marked ships were gone. Import and "Load example" clear the marks.
- **Gaps:** a loop has no ship in a primary or planned role (marked ships excluded). Planned ships count like flight-ready ones because several loops are not fully in the game yet.
- **Snubs without mothership:** this check uses `motherships` from `ships.json`.
- **Crew hint:** from `CREW_HINT_FROM` (12) crew seats upwards, an overlap card mentions the crew requirement (`views/overlaps.js`).

## Texts and languages

- All UI texts are in `STRINGS` in `js/i18n.js`, with one `de` and one `en` block using the same keys.
- Static texts in `index.html` carry `data-i18n="key"`.
- In code, `t("key", { n: 3 })` replaces `{n}` in the text, and `fmt(number)` formats numbers for the current language.
- **Adding a language:**
  1. Add a block (e.g. `fr`) with all keys to `STRINGS`.
  2. Add a `data-lang="fr"` button to `index.html`.
  3. Add an `fr` key to `loops.json` and to each `note`.

  Missing texts fall back to German.
- Deep link: `index.html#en`, `#de`, or a tab (`#compare`, `#overlaps` …).

## Stored data (`localStorage`)

| Key | Content |
|---|---|
| `fm_fleet` | `{ own: true, items: [{ name, qty, insurance, meltable }] }` |
| `fm_name` | username |
| `fm_lang` | `de` / `en` |
| `fm_cmp` | ship names in the comparison |
| `fm_tab` | last opened tab |
| `fm_marked` / `fm_chosen` | replacement planning (red / green) |
| `fm_melt` | melt status chosen by clicking a lock icon: `{ shipName: "meltable" \| "upgrade" \| "locked" }` |
| `fm_ovdetails` | extra data switched on in the overlaps tab, e.g. `["scu", "crew"]` |
| `fm_overrides` | edits from the ship editor: `{ shipName: { field: value } }` |

"Load example" clears `fm_fleet` and resets the name and the comparison to `data/example-fleet.json`.

## CSS

`css/flottenmanifest.css` has numbered sections:

1. Design tokens (light and dark colours, fonts)
2. Base layout
3. Header, toolbar, notices
4. KPIs and tabs
5. Shared building blocks
6. Views
7. Footer and helper classes

Change colours only via the variables in section 1. Dark mode follows `prefers-color-scheme` or `data-theme="dark"` on `<html>`.
