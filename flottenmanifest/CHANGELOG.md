# Changelog

## 2.20.0 – 2026-10-17
- Fleet planner: button "All categories" adds one wish per gameplay loop with the crew range in the form (default 1 – open = every ship), in loop order; loops already planned with that range or without a matching ship are skipped, the 20-wish limit applies.
- Design: overlap cards two per row on wide screens (≥ 1400 px; explanation, result, gaps stay full width); the scroll spy picks the card clicked in the bar when two cards share a row (otherwise the left one). Minimum font size 13 px for text (12 px for uppercase mono labels and pills). Light theme accent darkened to #9a5a00 (white text on it and accent text on the page now meet WCAG AA 4.5:1; before 3.4:1). The toolbar folds into one line "Your own fleet: n entries … · Import & settings" once an own fleet is loaded (replaces the blue banner); on phones the page explanation is hidden then.
- Import refuses files over 2 MB (a hangar export is a few KB) instead of freezing the tab.
- Privacy: RSI ship images load by default; a notice explains that RSI receives the visitor's IP address ("Got it" / "Switch images off", stored as `fm_rsiimg`), the toolbar button "Images: on/off" switches them at any time. Footer and README explain it.
- Security: Content Security Policy. `index.html` allows scripts/styles only from its own origin and images from itself and the RSI media server; the standalone build gets a policy with sha256 hashes of its inline script and style blocks (`tools/build-standalone.mjs`), so injected scripts, event handlers and inline styles are blocked. The file:// hint moved to `js/file-hint.js`, the icon cut-outs use classes instead of `style` attributes. `<meta name="referrer" content="no-referrer">`. New `SECURITY.md` (private vulnerability reporting).
- Phones (≤ 640 px): the page never gets wider than the screen (grid items may shrink, wide tables scroll inside their box). Only the tabs (one row, swipeable, active tab scrolled into view) and the loop bar (two rows of 7 full-width squares) stay fixed – the legend, chips and texts scroll away (`.fm-sticky { display: contents }`, `--fm-tabs-h`); the fixed area went from about half the screen to about a quarter. Loop cards show each ship as a two/three-line row, the ship list shows one card per ship with the sortable headings as sort chips, overlaps stack the size label above the tiles and fit the candidate rows to the width, KPIs two per row. Ship names break between words, not inside them.
- Touch screens: tapping anything with a tooltip shows its text in a small bubble (title texts never appear without hover; the tap still does its normal job), larger tap targets (buttons 40 px, chips, compare toggle, invisible larger hit areas around the small icons), 16 px input fonts (iOS Safari zooms into smaller ones).
- Bar summaries only carry the numbers; the meaning of the squares moved into the legend ("Loop bar: …" with sample squares).
- One fixed loop order (data/loops.json) in every tab: the overlap cards ("planned only" included) and the planner wish cards are now sorted like the loop bar, and the square of the card currently in view is framed while scrolling (scroll spy in `main.js`).
- The loop bar of the open tab is part of the sticky area (tabs, legend) and works as quick navigation while scrolling; jump targets land below it (`--fm-sticky-h`, measured in `main.js`). Planner bar: click picks the loop in the form and jumps to its first wish.
- Loop icon in front of the card titles (overlaps, loop cards, fleet planner wishes) – the same icon as in the loop bar (`loopIconTitle()`).
- Overlaps count every ship: concepts, ships in production and roles whose function is not in the game yet (planned) count for overlaps, substitutes and the result. They are marked violet: unreleased ships with their status ("Concept", "In production"), released ships whose role is not in the game yet with "function planned". Option "Playable ships first" (chip next to the extra data, off by default, `fm_ovready`) suggests ships usable today first. Loops covered only by planned ships get a card like an overlap (tiles by size, no candidates) (e.g. support with a concept Vulcan and the Carrack's planned repair) and a violet dashed square in the loop bar; the card links the RSI Loaner Ship Matrix (RSI usually lends a ship that covers the loop today).
- Overlaps: "Result after the changes" card as soon as ships are marked red – ships before → after, what is given away (exchange possible / CCU only / unknown), new gaps, a loop bar of the result (changed loops carry a dot, tooltip "primary role 7 → 5"), a table of every loop that changes (primary and secondary/planned before → after, "new gap" / "overlap resolved") and the swap list A → B.
- Loop bar in more tabs: loop matrix (click highlights the column), ship list (click filters by that loop, second click clears; the active loop is outlined) and overlaps (filled = overlap with the number of primary ships, red dashed = gap, outline = covered without overlap; click jumps to the card). `loopBar()` got the levels "plain" and "gap" and an `active` option.
- "By gameplay loop" tab: quick overview bar above the cards (same component as the planner's coverage bar, `loopBar()` in `js/views/common.js`). Filled = ships in a primary role (number = count), dashed = secondary or planned roles only, empty = none; hover shows the breakdown, click jumps to the card.

## 2.19.1 – 2026-10-17
- Validator: a missing local image is only reported when `data/image-urls.json` has no RSI link for the ship either (the repository has no `images/` folder, so every ship used to be reported).

## 2.19.0 – 2026-10-17
- Overlaps crew rule: pure single-seaters (crew 1–1) are only replaced by ships that can also be flown alone (e.g. Aurora Mk II → Shiv 1–2 ok, → Hurricane 2–2 no). Ships that seat 2 (1–2) may still be replaced by 2-crew ships.
- Tab order: the fleet planner sits between "Overlaps" and "Compare"; "Compare" is the last tab.
- One line icon per gameplay loop (`LOOP_ICONS` in `js/views/common.js`), shown above the squares of the planner's coverage bar.
- The legend is folded away ("Legend", click to open); every symbol explains itself on hover instead (role marks, marked/chosen ships now name their state in the tooltip).
- Fixed: loop names with "&" showed "&amp;" in tooltips (planner coverage bar, overlaps "(!)" hints) and in the copied plan. `loopText()` returns plain text for attributes and the clipboard, `loopName()` the escaped HTML.
- Fleet planner: click a tile to select the ship for that wish (orange frame with a check mark, Enter/Space work too). "My plan" at the top lists all selections per wish with size, SCU, crew and "in your fleet" / "missing", plus the number of ships (distinct, owned, missing); "Copy as text" puts the plan on the clipboard. Selections are stored with the wish (`picks`).
- "My plan" has one row per ship with the scenarios it was chosen for (each with ×). A ship already chosen for another wish shows green hatching and "Already planned: …" in the other suggestions.
- Owned ships are marked with a green hangar icon (also in the legend) instead of a green frame, so the frame is free for the selection.
- New tab "Fleet planner": add wishes "gameplay loop + crew range" (e.g. salvage, crew 1–2 and salvage, crew 2+; presets 1, 1–2, 2–4, 4+, 8+). Each wish shows matching ships from the whole database as tiles with size, SCU and crew; owned ships come first and are framed green, with a line "in your fleet". The first 12 are shown, the rest folds out. Wishes are saved in the browser (`fm_planner`).
- Coverage bar above "My plan": one square per gameplay loop at a fixed position (order of `data/loops.json`); filled with the number of selected ships once a ship is chosen for that loop, "n of 14 loops in the plan" next to it. Clicking a square picks that loop in the form.
- Matching rule: loop as primary or planned role, effective crew within the range. Ships listed with crew 1 but 3 or more seats (e.g. MOTH 1–4) count as 2-person ships, because RSI lists them as solo-flyable although they are only effective with a second person; the tile shows a yellow (!) next to the crew with the hint "Designed for multicrew" (no person count – some ships are not effective with two people either).

## 2.18.0 – 2026-10-17
- Overlaps tab: with images, "Candidates to review" is a grid – ship | arrow and "covered by" | substitute | further substitutes – with every ship as a tile (image above the name). Columns line up in every row; up to `ALSO_TILES` (6) further substitutes are shown, then "+n". Without images the text list stays.
- Tiles in a row are aligned at the top, also when a name wraps to two lines.

## 2.17.0 – 2026-10-16
- Ship images can be shown straight from RSI instead of being stored: `tools/fetch-ship-images.mjs` writes `data/image-urls.json` (links only, `--urls-only` skips the download). A missing local image falls back to its RSI link.
- `build-standalone.mjs --remote-images` builds a release file with linked instead of embedded images; `tools/build-release.cmd` / `.sh` run both steps. Without local images the default build links them as well.
- `data/image-urls.json` with 220 RSI links is part of the repository (links only, no image files).
- Fixed: image matching prefers a ship's own name over aliases and prefix matches (e.g. Idris-P no longer got the Idris-M image).

## 2.16.2 – 2026-10-16
- Fan site notice required by the RSI Fankit and Fandom FAQ in the footer and README, with a link to the official site.
- README: ship images are not part of the repository; public releases are built with `--no-images`.

## 2.16.1 – 2026-10-16
- Security: the insurance column of an imported file was inserted into the page unescaped, so a crafted CSV could inject script that ran again on every visit (it stayed in `localStorage`). `insuranceText()` now escapes, and every importer's output goes through `sanitizeItem()`, which only keeps "LTI" or a number of months as insurance.
- Security: all values read from `localStorage` are validated on load (types, allowed values, lengths); editor overrides are checked field by field (`sanitizeOverride()`). `loopName()` escapes unknown loop IDs.
- Privacy: the fonts (Saira Condensed, IBM Plex Sans/Mono, SIL Open Font License) are stored in `fonts/` instead of loaded from Google Fonts; the standalone file embeds them. The page now makes no external requests.
- Tested with crafted CSV and `localStorage` payloads in every field and all tabs: no script runs.

## 2.16.0 – 2026-10-16
- New field `fighterClass` for all 60 ships with a fighter role, taken from the RSI role on starcitizen.tools (light / medium / heavy fighter, snub fighter, interceptor, stealth fighter, interdiction, fighter-bomber). Pathfinders, Starter and freight ships with a secondary fighter role have none.
- Shown in the fighter loop card (below the size), the overlaps fighter card (next to every ship), the ship list (column) and the compare tab (row); editable in the ship editor.
- Overlaps rule: in the fighter card a substitute needs at least the same class (snub < light < medium < heavy); interceptor, stealth, interdiction and fighter-bomber only by the same class. Substitutes of the nearest class are named first.

## 2.15.2 – 2026-10-16
- Loop cards and matrix now show the melt pair for every fleet ship. Before, ships that can be exchanged and upgraded had no mark there (only deviations were shown), unlike the ship list and overlaps tab.
- Role marks (primary / secondary / planned) are drawn in CSS instead of the glyphs ● ○ ◇, so they sit exactly centred in every font. `ROLE_SYMBOL` is gone.

## 2.15.1 – 2026-10-16
- Overlaps tab: the explanation box is folded into a one-line "How the analysis works" (`<details>`), closed by default.

## 2.15.0 – 2026-10-16
- Tabs, legend and the extra-data chips of the overlaps tab are sticky while scrolling (`.fm-sticky`). Pages with a fixed header can offset it via `--fm-sticky-top`.

## 2.14.1 – 2026-10-16
- Fleet ships without melt data from the import now show a grey dashed "?" pair in the ship list, overlaps and compare tab, so their status can be set by click. The compare tab shows all four states (it used to hide "exchange and upgrade possible").

## 2.14.0 – 2026-10-16
- Overlaps tab: chips "SCU", "Crew", "Dimensions" and "Status" show extra data next to every ship (tiles, candidates and substitutes). The choice is saved (`fm_ovdetails`); new details go into `OV_DETAILS` in `js/views/overlaps.js`.

## 2.13.0 – 2026-10-16
- Melt states shown as a pair of marks instead of four locks (`meltPair()` in `js/views/common.js`): circular arrows = exchange (melt for store credit), arrow up = CCU upgrade; green/blue when possible, grey and struck through when not. Legend and click menu updated; states and storage (`fm_melt`) unchanged.

## 2.12.1 – 2026-10-16
- Fourth melt state "meltable, not upgradeable" (orange open lock with !, colour token `--alert`). F8C Lightning Civilian and PTV are meltable but not upgradeable: they now show orange when the import says meltable, red only when it says not meltable.

## 2.12.0 – 2026-10-16
- Three melt states: meltable (green open lock), upgrade only (yellow lock with arrow), neither meltable nor upgradeable (red lock). Default from the import: not meltable → "upgrade only", unless `upgradeable: false` in `ships.json` (F8C Lightning Civilian, PTV).
- Click any lock icon to choose the state (menu incl. "automatic"); stored per ship in `fm_melt`. The ship list shows all three states so every ship can be changed there.

## 2.11.1 – 2026-10-16
- Fixed: beam and height were missing for 24 non-flight-ready ships (e.g. Arrastra now 124 × 64 × 21 m). Values re-read from starcitizen.tools; G12 also corrected to 7.25 m / 2 SCU, Ranger to 3.7 × 2 × 2 m. Only RAPTOR still has no published dimensions.
- A sample of 8 flight-ready ships was re-checked against the wiki: all values matched.
- The validator now warns about incomplete dimensions for every status.

## 2.11.0 – 2026-10-16
- KPI row reduced to "ships & vehicles" and "flight-ready"; SCU, crew seats, LTI and melt tiles removed.
- Ship images are now part of the project (`images/ships/`, 220 of 223 ships). Still without image: F7C-M Hornet Heartseeker Mk II, RAPTOR, Starlancer BLD. Run `tools/update-images.cmd` only when ships are added.

## 2.10.0 – 2026-10-16
- In-page ship editor (✎ in the ship list and compare tab, `js/views/editor.js`): edits are stored as overrides in the browser and can be exported as a complete `ships.json`.
- Gameplay loops reviewed against the Star Citizen Wiki (role overview and ship pages, i.e. the official RSI role, armament and equipment). Changes:
  - 100i: fighter secondary → –
  - 300i: fighter secondary → –
  - 400i: fighter secondary → –
  - Clipper: fighter secondary → –
  - Clipper: exploration – → primary
  - Clipper: cargo primary → primary
  - Clipper: medical – → secondary
  - Intrepid: fighter secondary → –
  - Mustang Alpha Vindicator: cargo secondary → primary
  - Mustang Alpha Vindicator: fighter primary → secondary
  - Aurora Mk I ES: cargo secondary → primary
  - Aurora Mk I ES: fighter primary → secondary
  - Avenger Stalker: dropship secondary → –
  - Gladiator: fighter secondary → primary
  - Gladiator: gunship primary → secondary
  - Vanguard Hoplite: fighter secondary → –
  - Starlancer TAC: snub – → secondary
  - Corsair: vehicle-transport – → secondary
  - Caterpillar: dropship secondary → –
  - Polaris: snub – → secondary
  - Paladin: dropship secondary → –
  - Redeemer: dropship secondary → –
  - Retaliator: dropship – → planned
  - Idris-P: snub – → secondary
  - Idris-P: medical – → secondary
  - Nomad: vehicle-transport – → secondary
  - Mercury Star Runner: vehicle-transport – → secondary
  - Tyilui: snub – → secondary

## 2.9.0 – 2026-10-16
- Ship images in all tabs: loop matrix (column), ship list (column), compare (header), overlaps (size groups as image tiles, small thumbnails in candidate lines). Everything stays text-only if no fleet ship has an image.

## 2.8.1 – 2026-10-16
- Ship thumbnails more than doubled (112×63 px, `.thumb--s`); loop cards now 3 per row on desktop (2 below 1400 px, 1 below 860 px).

## 2.8.0 – 2026-10-16
- Ship images are stored locally (`images/ships/`) instead of hot-linked: `tools/fetch-ship-images.mjs` downloads them from the RSI ship matrix (replaces `import-rsi-images.mjs`); `tools/update-images.cmd` / `.sh` run fetch, validate and build in one go.
- `build-standalone.mjs` embeds local images as data: URIs, so `dist/flottenmanifest.html` shows them offline (`--no-images` to skip).
- `image` may be a local path; `loadShipDb()` resolves it relative to the project root, the validator warns about missing files.

## 2.7.0 – 2026-10-16
- New optional field `image` in `data/ships.json` (hot-linked RSI store image). Thumbnails in loop cards, ship list and compare header; the column only appears once a fleet ship has an image, failed images are hidden.
- New `tools/import-rsi-images.mjs`: fills `image` from the RSI ship matrix (download or saved copy). The four Aurora Mk I variants are already filled.

## 2.6.1 – 2026-10-16
- Gaps: planned ships count like regular ones (several loops are not fully implemented yet). The separate "covered only by planned ships" list is gone; `analyseOverlaps()` now returns `gaps` instead of `gapsNone` / `gapsPlannedOnly`.

## 2.6.0 – 2026-10-16
- Suggested substitutes (incl. those in brackets) are clickable: the pick is shown green hatched in all categories and the replaced ship is marked red automatically. A second click undoes both; marking a green ship red drops the pick. Saved as `fm_chosen`.
- Summary at the top of the overlaps tab lists picks as "A → B"; legend has an entry for chosen substitutes.

## 2.5.0 – 2026-10-16
- Overlaps are evaluated per category: a substitute only needs the loop as primary role, the size, the SCU (cargo) and the crew rule. Missing other roles no longer block a suggestion; a yellow (!) shows them on hover.
- Click a ship name (overlaps tab, loop cards) to mark it for replacement (red hatched box, in all categories, saved as `fm_marked`). Marked ships are no longer suggested as substitutes; gaps and orphan snubs are recomputed without them.
- Legend: new entries for the (!) hint and for marked ships.

## 2.4.0 – 2026-10-16
- Overlap rule: a substitute's minimum crew may grow to at most 1.75× (`CREW_GROWTH_MAX`), 1 → 2 is allowed.
- The closest substitute is named (smallest size / crew first) instead of the largest; other matches are listed as "also: …".

## 2.3.0 – 2026-10-16
- Overlaps tab: the size lists use the same green/yellow melt icons as the candidates, so a ship no longer shows a red lock in one list and a yellow one in the next.
- Melt status is shown as icons only (no text badges); the text is in the legend and appears as tooltip / aria-label.
- Melt icons in one design (`ICONS` in `js/views/common.js`): red closed lock = not meltable, green open lock = meltable, yellow lock with up arrow = upgrade (CCU) only. New colour tokens `--good` and `--warn`; legend shows all three (`data-icon` spans in `index.html`).

## 2.2.0 – 2026-10-16
- New `dist/flottenmanifest.html`: single self-contained file that works on double-click (`file://`), built by `tools/build-standalone.mjs` (no dependencies).
- `index.html` opened via `file://` now shows a notice pointing to the standalone file instead of an empty page.
- `loadJson()` uses embedded `globalThis.FM_DATA` when present.

## 2.1.0 – 2026-10-16
- Overlaps tab shows the melt status of every ship: lock icon in the size lists, and for replacement candidates and orphan snubs a badge "meltable" / "not meltable – upgrade only" / "n of q not meltable" (`meltBadge()` in `js/views/common.js`).
- `buildFleet()` now also counts `meltKnown` (copies whose meltability the import stated); if the import has no melt data, the tab says so.

## 2.0.1 – 2026-10-16
- Developer-facing content switched to English: code comments, docs (new file names `SHIP-DATABASE.md`, `IMPORT-FORMATS.md`, `ARCHITECTURE.md`), validator messages and data file notes. The page itself stays bilingual (DE/EN).
- The load error message is now translated.

## 2.0.0 – 2026-10-16
- Project split into data (`data/*.json`), modules (`js/`, `js/views/`), styles (`css/`) and docs (`docs/`).
- Ship database as `data/ships.json` with 223 models, values per starcitizen.tools; loops with readable IDs (`cargo`, `mining` …) in `data/loops.json`.
- `tools/validate-ships.mjs` checks and formats the database.
- Import formats as an extensible list `IMPORTERS` (HangarLink CSV, ship list CSV, FleetViewer JSON, JSON list, text list).
- Fleets saved by version 1 (`localStorage`) remain valid.

## 1.x
- Single HTML file with embedded data (artifact version).
