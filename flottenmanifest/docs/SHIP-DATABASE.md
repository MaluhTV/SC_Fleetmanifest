# Maintaining the ship database (`data/ships.json`)

## Quick guide: adding a ship

1. Look up the values on [starcitizen.tools](https://starcitizen.tools): length/beam/height, min/max crew, SCU, size class, status.
2. Add an entry anywhere in `ships` in `data/ships.json`. Order doesn't matter, the formatter sorts the file.
3. Run `node tools/validate-ships.mjs --format`. It reports errors (e.g. typos in loop IDs) and writes the file back sorted and consistently formatted.
4. If needed, set `meta.updated` to today's date. The page shows it as "data as of …".
5. Run `node tools/build-standalone.mjs` so `dist/flottenmanifest.html` contains the new ship too.
6. Reload the page and test the ship via "Paste list".

Template to copy:

```json
{
  "name": "Starlancer MAX",
  "aliases": [],
  "size": "S5 Large",
  "length": 83, "beam": 52, "height": 16,
  "crewMin": 1, "crewMax": 4,
  "scu": 224,
  "status": "flight-ready",
  "loops": { "cargo": "primary", "vehicle-transport": "secondary", "touring": "secondary" },
  "note": { "de": "Ursa, MTC, Storm passen", "en": "Fits Ursa, MTC, Storm" },
  "motherships": [],
  "image": "images/ships/starlancer-max.jpg"
}
```

## Fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | Display name, unique. Write it as in the RSI hangar so imports find it without an alias. |
| `aliases` | list | yes (may be empty) | Other spellings found in exports, e.g. `"Ursa Rover Fortuna"`. |
| `size` | string | yes | `S1`–`S6` plus class, e.g. `"S5 Large"`, `"S6 Capital"`, `"S1 Snub"`. Concepts without an S level may use just `"Large"` etc. Ground vehicles: `"Ground vehicle"`. |
| `length` `beam` `height` | number (m) or `null` | yes | Dimensions per the wiki. `null` only if the wiki has no value (the validator warns about it). |
| `crewMin` `crewMax` | integer | yes | Minimum and maximum crew, with `crewMin ≤ crewMax`. |
| `scu` | number | yes | Cargo capacity. `0` if none. Decimals are allowed (e.g. `0.5`). |
| `status` | string | yes | `"flight-ready"`, `"in-production"` or `"concept"`. |
| `loops` | object | yes | Gameplay loop ID → role (see below). At least one entry. |
| `note` | `{de, en}` | yes | Short note in both languages. Empty strings `""` are allowed. |
| `image` | path, URL or `null` | no | Thumbnail. Normally a local file `"images/ships/<slug>.jpg"` written by `tools/fetch-ship-images.mjs` (see below). An https URL also works and is downloaded on the next run. The image column only appears once at least one ship of the fleet has an image. |
| `upgradeable` | boolean | yes (formatter adds `true`) | `false` for ships that cannot be upgraded via CCU (currently F8C Lightning Civilian, PTV). Default melt icon = meltability from the import × this flag: shown as a pair of marks: exchange (circular arrows) and upgrade (arrow up), each active or struck through. |
| `fighterClass` | string or omitted | no | Ships with a `fighter` loop: the RSI role from the wiki infobox. `snub`, `light`, `medium`, `heavy` (ladder: a heavier class may replace a lighter one), `interceptor`, `stealth`, `interdiction`, `bomber` (only replaced by the same class). "Heavy fighter / Bomber" counts as `heavy`. The validator warns about primary fighters without a class. |
| `motherships` | list | yes (may be empty) | Snubs/tenders only: names of the ships the snub belongs to. They must exist in the database. If none of them is in the fleet, the page flags it under "Overlaps". |

### Roles in `loops`

| Role | Meaning | Shown as |
|---|---|---|
| `primary` | core purpose of the ship | filled blue square |
| `secondary` | can do it, but not its main purpose | empty square |
| `planned` | announced, not yet playable (concept, or the loop isn't in the game yet) | dashed diamond (purple) |

For ships that are not `flight-ready`, all roles should be `planned`. Otherwise the validator prints a warning.

## Gameplay loops

The list lives in `data/loops.json`. Its order is also the order of the cards on the page.

| ID | German | English |
|---|---|---|
| `cargo` | Fracht / Handel | Cargo / Trading |
| `vehicle-transport` | Fahrzeug- & Schiffstransport | Vehicle & ship transport |
| `mining` | Bergbau / Raffinerie | Mining / Refining |
| `salvage` | Bergung (Salvage) | Salvage |
| `medical` | Medizin / Rettung | Medical / Rescue |
| `fighter` | Jäger (Dogfight) | Fighters (dogfight) |
| `gunship` | Gunship / Großkampf | Gunship / Heavy combat |
| `dropship` | Dropship / Boarding / FPS | Dropship / Boarding / FPS |
| `exploration` | Exploration | Exploration |
| `support` | Reparatur / Tanken / Support | Repair / Refuel / Support |
| `touring` | Touring / Wohnen | Touring / Living |
| `snub` | Snub / Beiboot | Snub / Parasite craft |
| `ground` | Bodenfahrzeug | Ground vehicle |
| `racing` | Racing | Racing |

**Adding a loop:** Insert `{ "id": "…", "de": "…", "en": "…" }` into `loops.json` at the desired position, then assign it to ships in `ships.json`. Don't rename an `id` once it is in use.

## Name matching on import

`match()` in `js/shipdb.js` resolves an imported name like this:

1. The name is normalized: lower-case, with special characters turned into spaces. `"Mercury Star Runner"` and `"mercury-star-runner"` become the same.
2. An exact match against `name` and all `aliases` is tried first.
3. Otherwise the longest database name that the imported name starts with wins. `"Cutlass Black Best In Show Edition"` becomes `Cutlass Black`.

If both fail, the ship appears under "Unknown ships" in the "Overlaps" tab. Fix it with an alias or a new entry.

**Careful with aliases:** a generic alias (e.g. `"Hornet"`) also matches other variants through rule 3. The validator reports duplicate names and aliases but not prefix clashes. Prefer one entry per variant.

## Editing in the browser

Non-developers can correct entries directly on the page: **Ship list** tab (or the compare tab) → ✎. The editor covers size, dimensions, crew, SCU, status, fighter class, the role per gameplay loop and the notes. Name and aliases stay file-only.

- Changes are stored in the browser (`localStorage` key `fm_overrides`) and laid over `ships.json` (`applyOverrides()` in `js/shipdb.js`). Edited ships show an "edited" tag. "Reset to original" removes the change for one ship.
- **Export as ships.json** downloads the complete file with all changes and today's date in `meta.updated`. Hand it to a developer, who replaces `data/ships.json` with it and runs `node tools/validate-ships.mjs --format` and `node tools/build-standalone.mjs`. Review the diff in Git before committing.
- After the export has been merged, use "Discard all changes" so the old overrides don't shadow future updates.

## Ship images

Images are stored locally in `images/ships/` and are part of the project (220 of 223 ships), so the page never loads anything from RSI at runtime. The download script is only needed for new ships. The standalone file embeds them, which makes it work offline.

**Windows:** double-click `tools/update-images.cmd`. **macOS / Linux:** `sh tools/update-images.sh`. Both need Node.js 18+ and run three steps:

```bash
node tools/fetch-ship-images.mjs          # get the RSI ship matrix, download missing images to images/ships/
node tools/validate-ships.mjs --format
node tools/build-standalone.mjs           # embeds the images into dist/flottenmanifest.html (--no-images skips them)
```

Options for `fetch-ship-images.mjs`:
- `ship-matrix.json`: use a copy saved in the browser from https://robertsspaceindustries.com/ship-matrix/index if the download is blocked
- `--overwrite`: download again even if the file exists
- `--dry-run`: only report

How it works:
- The image URLs come from the RSI ship matrix (`store_small`, about 350×200 px). Names are matched like a hangar import.
- An https URL you put into `image` by hand wins over the ship matrix. Use this for variants that are missing from the ship matrix: copy the image address from the RSI page.
- After the download, `image` holds the local path, e.g. `"images/ships/starlancer-max.jpg"`.
- At the end the script lists failed downloads, ship-matrix entries missing from `ships.json` and ships that are still without an image.

Note: the images belong to Cloud Imperium Games. Check CIG's fan content guidelines before publishing the site.

## Validator

```bash
node tools/validate-ships.mjs            # check only, exit code 1 on errors (CI-friendly)
node tools/validate-ships.mjs --format   # check + sort + format consistently
```

**Errors:**
- missing or wrong fields
- invalid size, status or role
- unknown loop ID
- `crewMin > crewMax`
- missing translation in `note`
- unknown mothership
- duplicate names or aliases

**Warnings:**
- ships with incomplete dimensions
- non-flight-ready ships with active roles

The formatter writes each ship as a fixed block, so Git diffs stay small and readable.
