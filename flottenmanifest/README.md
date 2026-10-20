# Star Citizen Fleet Manifest

A static web page that reads a hangar export (CSV/JSON) or a pasted list of ships and analyses the fleet by gameplay loop. Its tabs follow the workflow:

- **Abdeckung / Coverage:** which gameplay loops the fleet covers, grouped by archetype (combat, industry & supply, travel & exploration), with size, cargo (SCU) and crew
- **Optimieren / Optimise:** overlaps (three or more ships for the same job), substitutes, gaps – mark ships to see what is left after a change
- **Planen / Plan:** put together a wish fleet per loop and crew size
- **Vergleich / Compare:** up to four ships side by side
- **Schiffsliste / Ship list:** the whole fleet as a table or as a loop matrix, with an editor for the ship data

The UI is bilingual (German/English). It needs no server-side code and no dependencies, and the only build step (a single offline file) is optional.

Imported data stays in the visitor's browser (`localStorage`). Only ship name, quantity, insurance and meltability are read. Pledge IDs and prices are never taken over.

## Quick start

**Just want to use the page?** Open `dist/flottenmanifest.html` with a double-click. It is a single self-contained file (styles, scripts, fonts and ship data inlined) and works without a server. Ship images are loaded from RSI (release build) or embedded (your own local build, see "Ship images").

**Developing?** Run the source version through a local web server:

```bash
cd flottenmanifest
python3 -m http.server 8000      # or: npx serve .
# open http://localhost:8000
```

`index.html` needs a web server because the page uses ES modules and `fetch()` for `data/*.json`. Browsers block both on `file://`, so a double-clicked `index.html` stays empty apart from a notice pointing to `dist/flottenmanifest.html`.

**After every change** to `js/`, `css/`, `data/` or `index.html`, rebuild the standalone file:

```bash
node tools/build-standalone.mjs   # → dist/flottenmanifest.html
```

### Getting your hangar file

"Import file" opens a dialog with the file picker and these links:

- **Hangar XPLORer** (browser extension for the RSI "My Hangar" page, CSV export): [Chrome](https://chromewebstore.google.com/detail/bhkgemjdepodofcnmekdobmmbifemhkc) · [Firefox](https://addons.mozilla.org/firefox/addon/star-citizen-hangar-xplorer/) · [GitHub](https://github.com/dolkensp/HangarXPLOR)
- **Hangar.link** (CSV export of your pledges): https://hangar.link/pledges/all
- **CCU Game** (hangar management and CCU chains): https://ccugame.app/
- **STARJUMP Fleetviewer** (saved fleet layout as JSON): https://hangar.link/fleet/canvas
- Or paste a plain list of ship names ("Paste list").

Only ship names and quantities are used; prices and pledge IDs in these files are ignored.

## Tests

```
cd flottenmanifest/tests
npm install
npx playwright install chromium
node run.mjs
```

The same tests run on GitHub for every push (`.github/workflows/test.yml`). Merge to `main` only when they pass.

`node tools/check-wiki.mjs` compares `data/ships.json` with the Star Citizen Wiki API and lists differences and ships missing here (it changes nothing; `--sample` shows the raw API format).

## Folder structure

```
index.html                  page skeleton; all texts via data-i18n keys
css/flottenmanifest.css     all styling, in numbered sections (tokens → layout → shared blocks → views → phones)
data/
  ships.json                ★ ship database – this is where ships are maintained
  loops.json                gameplay loops (IDs, German/English names, archetype)
  included.json             vessels RSI includes with a parent ship (Carrack → C8 Pisces + Ursa …)
  image-urls.json           links to the RSI ship images (links only, written by tools/fetch-ship-images.mjs)
  example-fleet.json        example fleet for first-time visitors (username "Citizen")
js/
  main.js                   entry point: state, rendering, actions, event wiring
  state.js                  page state and its validated storage in localStorage
  shipdb.js                 loads data/*.json, name matching incl. aliases, archetypes, display slots
  analysis.js               all rules: fleet, loop stats, overlaps, gaps, substitutes, planner
  importers.js              file formats (Hangar XPLORer CSV, Hangar.link CSV, STARJUMP Fleetviewer JSON, generic JSON)
  i18n.js                   all UI texts in German/English + t()
  util.js                   small helpers ($, esc, normalizeName, storage)
  version.js                version number (= top entry of CHANGELOG.md)
  views/                    one renderer per tab: loops.js (Coverage), overlaps.js (Optimise), planner.js (Plan),
                            compare.js, list.js + matrix.js (ship list); kpis.js, editor.js, common.js (shared blocks)
  ui/                       page helpers: tour.js (introduction), tap-tips.js, sticky.js (sticky area + scroll spy)
tests/run.mjs               data, analysis and browser tests (Playwright)
tools/
  validate-ships.mjs        checks and formats data/ships.json (Node ≥ 18)
  build-standalone.mjs      builds dist/flottenmanifest.html (one file, works offline)
  build-release.cmd/.sh     release build: refresh image links, build with --remote-images
  fetch-ship-images.mjs     image links (+ optional local download to images/ships/, never committed)
  update-images.cmd/.sh     own offline copy: download images, validate, build
  check-wiki.mjs            compares the data with the Star Citizen Wiki API
dist/flottenmanifest.html   generated – do not edit by hand, not committed
docs/
  ARCHITECTURE.md           tabs and ids, data flow, where to change what, stored data
  SHIP-DATABASE.md          field reference, "how to add a ship", gameplay loops, ship images
  IMPORT-FORMATS.md         supported exports and how to add a format
```

## Common tasks

| Task | Where | Docs |
|---|---|---|
| Add a ship / fix values | `data/ships.json`, then `node tools/validate-ships.mjs --format` and `node tools/build-standalone.mjs` | [SHIP-DATABASE.md](docs/SHIP-DATABASE.md) |
| Add / update ship image links | `tools/build-release.cmd` / `.sh` (or an RSI URL in `image` for ships the ship matrix lacks) | [SHIP-DATABASE.md](docs/SHIP-DATABASE.md#ship-images) |
| Add a gameplay loop / change its archetype | `data/loops.json` (+ roles in `ships.json`, icon in `js/views/common.js`) | [SHIP-DATABASE.md](docs/SHIP-DATABASE.md#gameplay-loops) |
| Add an import format | `js/importers.js` → object in `IMPORTERS` | [IMPORT-FORMATS.md](docs/IMPORT-FORMATS.md) |
| Change or translate a text | `js/i18n.js` | [ARCHITECTURE.md](docs/ARCHITECTURE.md#texts-and-languages) |
| Add a column to the ship list | `COLUMNS` in `js/views/list.js` | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Colours / spacing | section 1 "Design tokens" in `css/flottenmanifest.css` | – |
| Overlap rules | `js/analysis.js` (`substitutesInLoop`, `CREW_GROWTH_MAX`, `OVERLAP_MIN_SHIPS`) | [ARCHITECTURE.md](docs/ARCHITECTURE.md#analysis) |

## Embedding in an existing website

- All content lives inside `<div class="fm-wrap" id="flottenmanifest">`. CSS rules are scoped to `.fm` or to prefixed classes (`fm-`, `loop-`, `cmp-` …).
- For a sub-page, copy the `<body>` content of `index.html`, include `css/flottenmanifest.css` and load `js/main.js` with `type="module"`.
- Paths to `data/` are resolved relative to `js/shipdb.js` (`import.meta.url`), so `js/` and `data/` must sit side by side.
- `localStorage` keys start with `fm_`.
- Tabs and legend are sticky. If your site has a fixed header, set its height as offset: `.fm { --fm-sticky-top: 64px; }`.

## Data source

Dimensions, SCU, crew and status follow the RSI pledge store and ship pages, checked against the [Star Citizen Wiki (starcitizen.tools)](https://starcitizen.tools). The loop and archetype assignment is an editorial assessment. Star Citizen® is a trademark of Cloud Imperium Games. This is a fan project and is not affiliated with CIG.

The files in `data/` (ships.json, loops.json, included.json) are licensed under CC BY 4.0.

## Legal

This is an unofficial Star Citizen fan site, not affiliated with the Cloud Imperium group of companies. All content on this site not authored by its host or users are property of their respective owners.

Star Citizen®, Squadron 42®, Roberts Space Industries® and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC. Official site: https://robertsspaceindustries.com

Ship images are **not** part of this repository and must not be committed or uploaded (RSI does not allow re-uploading its content; `images/` is in `.gitignore`). The page only links them. `tools/update-images.cmd` / `.sh` can download them for your own offline copy.

### Building a release

Double-click `tools/build-release.cmd` (Windows) or run `sh tools/build-release.sh`. It fetches the list of RSI image links into `data/image-urls.json` and builds `dist/flottenmanifest.html` with `--remote-images`: the file contains only links, and the browser loads each thumbnail straight from robertsspaceindustries.com when the page is opened. Attach that file to a GitHub release.

Committing `data/image-urls.json` (links only) also lets the source version show the images without an `images/` folder.

## Privacy and security

- **RSI images with a notice.** Linked images make the browser contact RSI's image server, so RSI sees the visitor's IP address. They load by default; a notice says so until it is acknowledged ("Got it" / "Switch images off", stored as `fm_rsiimg` in the browser), and the button "Images: on/off" under "More options" changes the choice at any time. Local or embedded images need no consent. Builds with `--no-images` make no external requests at all.
- **No server, no tracking.** Fleet, edits and settings stay in the visitor's `localStorage`; nothing is sent anywhere. Fonts are self-hosted.
- **Content Security Policy.** `index.html` only allows scripts and styles from its own origin and images from itself, `media.robertsspaceindustries.com` and `robertsspaceindustries.com` (a few ship images RSI only hosts there). The standalone build replaces this with a policy that allows exactly its own inline script and style blocks (sha256 hashes, computed by `tools/build-standalone.mjs`) and blocks every other request. Even if a value ever slipped through unescaped, injected scripts, event handlers and inline styles would not run. Never use `style="…"` or `on…=` attributes in markup — use classes and `addEventListener`.
- **Escaping.** All data reaches the page through `esc()` (`js/util.js`); stored values are validated when loaded (`js/state.js`).
- Found a security problem? See [SECURITY.md](../SECURITY.md).
