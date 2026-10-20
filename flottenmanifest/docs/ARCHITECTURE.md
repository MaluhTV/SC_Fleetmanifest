# Architecture

Plain HTML, CSS and JavaScript (ES modules). There is no framework and there are no runtime dependencies. Each file has one job.

The source version (`index.html`) runs as it is on any web server. The only build step is optional: `tools/build-standalone.mjs` bundles everything into `dist/flottenmanifest.html` for users who open the page from disk. Its mini bundler wraps each module in a function and supports only `import { … } from "…"` plus `export function/const/let/class`. Stick to these forms, or the build stops with an error. In that file the data is embedded as `globalThis.FM_DATA`, which `loadJson()` in `js/shipdb.js` reads before falling back to `fetch()`.

## Tabs and their ids

The tabs were renamed in 2.22; the ids in code, markup, stored state and links stayed the same:

| Tab (de / en) | View id | Section in `index.html` | Renderer |
|---|---|---|---|
| Abdeckung / Coverage | `loops` | `#view-loops` | `views/loops.js` |
| Optimieren / Optimise | `overlaps` | `#view-overlaps` | `views/overlaps.js` |
| Planen / Plan | `planner` | `#view-planner` | `views/planner.js` |
| Vergleich / Compare | `compare` | `#view-compare` | `views/compare.js` |
| Schiffsliste / Ship list | `list` | `#view-list` | `views/list.js` (mode "Liste"), `views/matrix.js` (mode "Matrix") |

Above the tabs: `views/kpis.js` (KPI tiles, fleet profile, short summary). Below them, in the sticky area, one loop bar per tab (`#loopBar`, `#overlapBar`, `#plannerBar`, `#listBar`).

## Files

```
js/main.js            entry point: elements, state, rendering, actions, event wiring (wire… functions), start
js/state.js           page state, validation of everything stored, save.*(), backup format, VIEWS
js/shipdb.js          loads data/*.json, name matching (aliases), local edits, archetypes, display slots
js/analysis.js        all rules: fleet with included vessels, loop stats, overlaps, gaps, substitutes, planner
js/importers.js       file formats (IMPORTERS) and the pasted list
js/i18n.js            all UI texts (de / en) and t()
js/util.js            $, $$, esc(), normalizeName(), storage (localStorage with prefix fm_)
js/version.js         VERSION – must equal the top entry of CHANGELOG.md (tests check it)
js/file-hint.js       notice when index.html is opened from disk (file://)
js/views/*.js         one renderer per tab + common.js (shared HTML building blocks: icons, loop bar, ship names …)
js/ui/tour.js         first-visit introduction
js/ui/tap-tips.js     title texts as tap bubbles on touch screens
js/ui/sticky.js       sticky area heights (CSS variables) and the scroll spy of the loop bars
```

## Data flow

```
data/ships.json ──────┐
data/loops.json ──────┤
data/included.json ───┼─ shipdb.loadShipDb() ──► db { ships, loops, slots, byName(), match(), slot(), archetypesOf(), included }
data/image-urls.json ─┤        + applyOverrides(state.overrides)   (local edits from the ship editor)
example-fleet.json ───┘

file / text box ── importers.importFile() ──► items [{ name, qty, insurance, meltable }]
                                                 │ save.fleet()  → localStorage "fm_fleet"
                                                 ▼
                 analysis.buildFleet(items, db, melt, aliases) ──► fleet { ships (+ qty, insurance, melt, included vessels), unknown }
                                                 │
                 main.renderAll() ──► views/*.render…(element, { db, fleet, state })
```

- **`state`** (`js/state.js`) holds everything the user sets. Every change goes through `save.*()` and is followed by a re-render of what changed. A few values are not stored: KPI and archetype filter, folded / unfolded cards.
- **Views** (`js/views/*.js`) are pure functions. They take an element and `{ db, fleet, state }` and set `innerHTML`. They don't bind events: `main.js` does that via event delegation on `data-*` attributes (`data-compare`, `data-mark`, `data-loop-jump`, `data-group-pick` …), grouped per tab in the `wire…()` functions.
- **Filters:** the KPI tiles reduce the fleet for Coverage and the ship list (`viewCtx()` in `main.js`). The archetype filter is mostly CSS: `body[data-group-filter]` hides elements with another `data-group` and fades the other bar groups; the ship list / matrix filter rows in `filterRows()` (`views/list.js`).
- **Security:** everything from import files and from `localStorage` is untrusted.
  - Output: every value that ends up in `innerHTML` goes through `esc()` (`js/util.js`). New view code must do the same; only translation texts from `i18n.js` and fixed markup are inserted unescaped.
  - Input: `sanitizeItem()` (`js/state.js`) checks every imported and stored fleet entry; `loadState()` validates all other stored values, and `sanitizeOverride()` (`js/shipdb.js`) checks editor overrides field by field.
  - Content Security Policy: no inline `style="…"` or `on…=` attributes – positions and widths are set via CSSOM (`el.style.left = …`).
  - External requests: none, except ship images linked to RSI (`data/image-urls.json`, or an RSI URL in `ships.json → image`). Fonts are in `fonts/`.

## Where do I change what?

| I want to … | File |
|---|---|
| add a tab | Several places, see the steps after this table. |
| add a column to the ship list | `COLUMNS` in `views/list.js` (+ heading in `i18n.js`) |
| add a row to the compare table | `ROWS` in `views/compare.js` |
| change the KPIs or the short summary | `views/kpis.js` |
| add a gameplay loop or move it to another archetype | `data/loops.json` (`group`) + icon in `LOOP_ICONS` (`views/common.js`) |
| set the archetype of a snub / ground vehicle | `archetype` in `data/ships.json` |
| add included vessels (snub / vehicle that comes with a ship) | `data/included.json` |
| change an icon | `ICONS` / `LOOP_ICONS` in `views/common.js`, role marks via `.mk--*::before` in the CSS; legend icons use `<span data-icon="…">` in `index.html` |
| change the max. number of compared ships | `MAX_COMPARE` in `state.js` |
| add extra data to Optimise (chips) | `OV_DETAILS` in `views/overlaps.js` + label in `i18n.js` |
| change the planner rule or presets | `plannerSuggestions()` in `analysis.js`; `PLANNER_PRESETS` / `PLAN_VISIBLE` in `views/planner.js` |
| change what the ship editor can edit | `EDITABLE_FIELDS` in `shipdb.js` + form in `views/editor.js` |
| change the introduction | steps in `start()` (`main.js`), texts `tour_*` in `i18n.js`, behaviour in `ui/tour.js` |

Adding a tab takes these steps:

1. Add a section `<section id="view-xyz">` to `index.html` (and a loop bar `<div class="fm-bar" data-bar-for="xyz">` if it needs one).
2. Add a tab button with `data-view="xyz"`.
3. Add `"xyz"` to `VIEWS` in `state.js`.
4. Create a new file `views/xyz.js`.
5. Call it in `renderAll()` in `main.js` and wire its events in a new `wireXyz()`.
6. Add the texts to `i18n.js`.

## Analysis

All rules live in one place, `js/analysis.js`:

- **Display slots** (`db.slots`, `js/shipdb.js`): every loop once, and snub / ground vehicle once per archetype (key `"snub--combat"`); a ship counts in a multi slot when its archetype (`db.archetypesOf()`) matches. All analysis functions take slots, so a Ballista never overlaps with an Ursa. An empty multi slot is never a gap.
- **Included vessels** (`data/included.json`, `buildFleet()`): snubs / vehicles that come with a parent ship are added as `includedOnly` (pill "incl."); an own copy gets `includedBy` ("+ incl."). They leave with their parent when it is marked red (`remainingAfter()`), and an overlap needs at least one ship the user owns.
- **Overlap:** a loop has at least `OVERLAP_MIN_SHIPS` (3) ships in a primary or planned (announced) role – all statuses count (concepts, in production), because several loops and ships are not finished yet. Such ships are "pending" (`isPending()`): marked violet ("announced"). The option "Playable ships first" (`readyFirst`, `fm_ovready`, off by default) ranks substitutes usable today first. The "covered only by planned ships" card links the RSI Loaner Ship Matrix.
- **Planned only** (`plannedOnly`): loops covered only by pending ships get their own card and a violet dashed square in the bar.
- **Per category:** each overlap card is evaluated on its own. Ship O can replace ship S in loop L (`substitutesInLoop()`) when:
  - O has L as a primary or planned role
  - O is at least as large
  - for cargo, O has at least as much SCU
  - for fighters, O has at least S's fighter class (`fighterClassAcceptable()`): snub < light < medium < heavy; interceptor, stealth, interdiction and bomber only by the same class. Ships without a class are compared by size only. Substitutes of the nearest class are named first.
  - O's minimum crew is at most `CREW_GROWTH_MAX` (1.75) × S's minimum crew; a pure single-seater (crew 1–1) only by a ship that can also be flown alone (minimum crew 1); a ship that seats 2 (1–2) may be replaced by one that needs 2 (1–2 → 2 ok, → 3 no, 3 → 5 ok, 3 → 6 no, 6 → 10 ok)
- **Which substitute is named:** the closest match (`findReplacements()` sorts by size, minimum crew, number of lost loops, SCU). Further matches are shown in brackets.
- **Lost loops:** other loops S plays that O does not (`lostLoops()`). They don't block the suggestion; the view shows a yellow (!) with a tooltip, and says if no other primary ship in the fleet covers them.
- **Excluded as candidates:** ground vehicles and ships owned more than once (unless the user marked them).
- **Chosen substitutes** (`state.chosen` = `{ shipToReplace: substitute }`, stored as `fm_chosen`): clicking a suggested substitute (`data-choose` + `data-for`) picks it in green and marks the replaced ship red; a second click undoes both. A green ship cannot be red at the same time – marking it red drops the pick. `analyseOverlaps(…, chosen)` lists a valid pick first ("replaced by").
- **Marked ships** (`state.marked`, stored as `fm_marked`): clicking a ship name (`data-mark`) in Optimise or a Coverage card marks it "to replace". `analyseOverlaps(ships, loops, marked)` then never offers marked ships as substitutes, lists marked ships first (or "no substitute left"), and computes gaps and orphan snubs as if the marked ships were gone. Import and "Load example" clear the marks.
- **Gaps:** a loop has no ship in a primary or planned role (marked ships excluded). Planned ships count like flight-ready ones because several loops are not fully in the game yet.
- **Plan** (`plannerSuggestions()`): a wish `{ loop, min, max }` matches every database ship with the loop as primary or planned role whose effective crew (`effectiveCrew()`: minimum crew 1 with `EFFECTIVE_CREW_FROM_MAX` = 3 or more seats counts as 2, e.g. MOTH 1–4) lies in `min…max` (`max` null = open). Owned ships come first, then flight-ready, then smallest. Wishes are validated by `sanitizeSlot()` (`state.js`).
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
- Deep link: `index.html#en`, `#de`, or a tab by its id (`#compare`, `#overlaps` …; `#matrix` opens the ship list in matrix mode).

## Stored data (`localStorage`)

All keys start with `fm_` (`storage` in `js/util.js`). "Save backup" writes all of them into one JSON file (`makeBackup()` / `restoreBackup()` in `state.js`).

| Key | Content |
|---|---|
| `fm_fleet` | `{ own: true, items: [{ name, qty, insurance, meltable }] }` |
| `fm_name` | username |
| `fm_lang` | `de` / `en` |
| `fm_tab` | last opened tab (view id) |
| `fm_listmode` | ship list mode: `list` / `matrix` |
| `fm_cmp` | ship names in the comparison |
| `fm_marked` / `fm_chosen` | replacement planning (red / green) |
| `fm_melt` | melt status chosen by click: `{ shipName: "meltable" \| "meltOnly" \| "upgrade" \| "locked" }` |
| `fm_ovdetails` | extra data switched on in Optimise, e.g. `["scu", "crew"]` |
| `fm_ovready` | Optimise option "Playable ships first" (`true` / `false`) |
| `fm_planner` | Plan wishes: `[{ loop, min, max, picks }]` (`max: null` = open, `picks` = selected ship names) |
| `fm_overrides` | edits from the ship editor: `{ shipName: { field: value, base: "YYYY-MM-DD" } }` (`base` = database date of the edit) |
| `fm_aliases` | own assignment of unrecognised import names: `{ importName: databaseShip }` |
| `fm_rsiimg` | RSI images: `true` = on (notice acknowledged), `false` = off, missing = on, notice not acknowledged yet |
| `fm_tour` | `true` once the introduction was finished or skipped |

"Load example" clears `fm_fleet` and resets the name and the comparison to `data/example-fleet.json`.

## CSS

`css/flottenmanifest.css` has numbered sections:

0. Fonts (self-hosted)
1. Design tokens (light and dark colours, archetype colours, fonts)
2. Base layout
3. Header, toolbar, buttons, notices, dialogs
4. KPIs, short summary, tabs, legend, filter chips
5. Shared building blocks (role marks, melt pair, ship names, pills, tables, loop bar, cards)
6. Views: a Coverage · b ship list + matrix · c Optimise · d Plan · e Compare · f ship editor
7. Footer and helpers (tap bubbles, introduction)
8. Phones (`max-width: 640px`) and touch screens (`pointer: coarse`)

Change colours only via the variables in section 1. Dark mode follows `prefers-color-scheme` or `data-theme="dark"` on `<html>`. Phone rules come last on purpose: they override the desktop rules of the same specificity.
