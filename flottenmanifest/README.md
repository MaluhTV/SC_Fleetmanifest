# Star Citizen Fleet Manifest

A static web page that reads a hangar export (CSV/JSON) or a pasted list of ships and analyses the fleet by gameplay loop. It covers:

- size, cargo (SCU) and crew
- overlaps and gaps between loops
- a side-by-side comparison of up to four ships

The UI is bilingual (German/English). It needs no server-side code and no dependencies, and the only build step (a single offline file) is optional.

Imported data stays in the visitor's browser (`localStorage`). Only ship name, quantity, insurance and meltability are read. Pledge IDs and prices are never taken over.

## Quick start

**Just want to use the page?** Open `dist/flottenmanifest.html` with a double-click. It is a single self-contained file (styles, scripts and ship data inlined) and works without a server. It works without a server; fonts are embedded. Ship images are either embedded (your local build) or loaded from RSI (release build, see below).

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

## Folder structure

```
index.html                 page skeleton; all texts via data-i18n keys
css/flottenmanifest.css    all styling, split into numbered sections (tokens → layout → views)
data/
  ships.json               ★ ship database – this is where ships are maintained
  loops.json               list of gameplay loops (IDs + German/English names)
  example-fleet.json       example fleet for first-time visitors (username "Citizen")
js/
  main.js                  entry point: load data, wire events, render everything
  i18n.js                  all UI texts in German/English + t() function
  shipdb.js                loads ships.json/loops.json, name matching incl. aliases
  importers.js             file formats (HangarLink, ship list CSV, FleetViewer, JSON list)
  analysis.js              analysis: build fleet, loop stats, overlaps, swap balance
  state.js                 page state and persistence in localStorage
  util.js                  small helpers ($, esc, normalizeName, storage)
  views/                   one file per tab, each with a render…() function
    common.js              shared building blocks (role marks, status pills, lock icon …)
    kpis.js loops.js matrix.js list.js overlaps.js compare.js
tools/validate-ships.mjs   checks and formats data/ships.json (Node ≥ 18)
tools/build-standalone.mjs builds dist/flottenmanifest.html (one file, works offline)
tools/fetch-ship-images.mjs downloads ship images to images/ships/ (RSI ship matrix)
tools/update-images.cmd/.sh  one-click: fetch images, validate, build
images/ships/              local ship thumbnails (included; the script adds new ones)
dist/flottenmanifest.html  generated – do not edit by hand
docs/
  SHIP-DATABASE.md         field reference and "how to add a ship"
  IMPORT-FORMATS.md        supported exports and how to add a format
  ARCHITECTURE.md          data flow and where to change what
```

## Common tasks

| Task | Where | Docs |
|---|---|---|
| Add a ship / fix values | `data/ships.json`, then `node tools/validate-ships.mjs --format` and `node tools/build-standalone.mjs` | [SHIP-DATABASE.md](docs/SHIP-DATABASE.md) |
| Add / update ship images | double-click `tools/update-images.cmd` (Windows) or `sh tools/update-images.sh` | [SHIP-DATABASE.md](docs/SHIP-DATABASE.md#ship-images) |
| Add a gameplay loop | `data/loops.json` (+ roles in `ships.json`) | [SHIP-DATABASE.md](docs/SHIP-DATABASE.md#gameplay-loops) |
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

Dimensions, SCU, crew and status come from the [Star Citizen Wiki (starcitizen.tools)](https://starcitizen.tools). The loop assignment is an editorial assessment. Star Citizen® is a trademark of Cloud Imperium Games. This is a fan project and is not affiliated with CIG.

Die Dateien in data/ (ships.json, loops.json) stehen unter CC BY 4.0.

## Legal

This is an unofficial Star Citizen fan site, not affiliated with the Cloud Imperium group of companies. All content on this site not authored by its host or users are property of their respective owners.

Star Citizen®, Squadron 42®, Roberts Space Industries® and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC. Official site: https://robertsspaceindustries.com

Ship images are **not** part of this repository. `tools/update-images.cmd` / `.sh` downloads them from the RSI ship matrix to your own computer; do not commit them (RSI does not allow re-uploading its content).

### Building a release

Double-click `tools/build-release.cmd` (Windows) or run `sh tools/build-release.sh`. It fetches the list of RSI image links into `data/image-urls.json` and builds `dist/flottenmanifest.html` with `--remote-images`: the file contains only links, and the browser loads each thumbnail straight from robertsspaceindustries.com when the page is opened. Attach that file to a GitHub release.

Committing `data/image-urls.json` (links only) also lets the source version show the images without an `images/` folder.

## Privacy and security

- **RSI images only after consent.** Linked images make the browser contact RSI's image server, so RSI sees the visitor's IP address. The page therefore asks once ("Load images from RSI" / "No images", stored as `fm_rsiimg` in the browser) and loads nothing from robertsspaceindustries.com before that; the toolbar button "Images: on/off" changes the choice. Local or embedded images need no consent. Builds with `--no-images` make no external requests at all.
- **No server, no tracking.** Fleet, edits and settings stay in the visitor's `localStorage`; nothing is sent anywhere. Fonts are self-hosted.
- **Content Security Policy.** `index.html` only allows scripts and styles from its own origin and images from itself and `media.robertsspaceindustries.com`. The standalone build replaces this with a policy that allows exactly its own inline script and style blocks (sha256 hashes, computed by `tools/build-standalone.mjs`) and blocks every other request. Even if a value ever slipped through unescaped, injected scripts, event handlers and inline styles would not run. Never use `style="…"` or `on…=` attributes in markup — use classes and `addEventListener`.
- **Escaping.** All data reaches the page through `esc()` (`js/util.js`); stored values are validated when loaded (`js/state.js`).
- Found a security problem? See [SECURITY.md](../SECURITY.md).
