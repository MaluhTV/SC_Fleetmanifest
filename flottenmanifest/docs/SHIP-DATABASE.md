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
  "motherships": []
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
| `image` | path, URL or `null` | no | Thumbnail. Normally not needed: the RSI image link comes from `data/image-urls.json` (ship matrix). Set an RSI https URL here for ships the ship matrix does not list (e.g. Skylark, variants). After a local image download it holds the local path `"images/ships/<slug>.jpg"` (see "Ship images"). |
| `archetype` | `"combat"`, `"supply"`, `"explore"` or omitted | no | Which archetype a ship counts in. Omitted = the groups of its primary / announced roles, otherwise of its secondary roles. Needed for snubs and ground vehicles (their loop is `multi`), e.g. C8 Pisces → `explore`, C8R Pisces Rescue → `supply`, Ballista → `combat`; the validator warns when one is missing. |
| `upgradeable` | boolean | yes (formatter adds `true`) | `false` for ships that cannot be upgraded via CCU (currently F8C Lightning Civilian, PTV). Default melt icon = meltability from the import × this flag: shown as a pair of marks: exchange (circular arrows) and upgrade (arrow up), each active or struck through. |
| `fighterClass` | string or omitted | no | Ships with a `fighter` loop: the RSI role from the wiki infobox. `snub`, `light`, `medium`, `heavy` (ladder: a heavier class may replace a lighter one), `interceptor`, `stealth`, `interdiction`, `bomber` (only replaced by the same class). "Heavy fighter / Bomber" counts as `heavy`. The validator warns about primary fighters without a class. |
| `motherships` | list | yes (may be empty) | Snubs/tenders only: names of the ships the snub belongs to. They must exist in the database. If none of them is in the fleet, the page flags it in Optimise. Snubs and vehicles RSI includes with a ship are listed in `data/included.json` (parent → vessels); they count as "incl." and cannot be given away on their own. |

### Roles in `loops`

| Role | Meaning | Shown as |
|---|---|---|
| `primary` | core purpose of the ship | filled blue square |
| `secondary` | can do it, but not its main purpose | empty square |
| `planned` | announced, not yet playable (concept, or the loop isn't in the game yet) | dashed diamond (purple) |

For ships that are not `flight-ready`, all roles should be `planned`. Otherwise the validator prints a warning.

## Gameplay loops

The list lives in `data/loops.json`. Each loop belongs to one **archetype** (`group`): combat, supply ("Industry & supply") or explore ("Travel & exploration"). The page groups the loop bar, the Coverage cards and the matrix by archetype, in the order of the file. Snub and ground vehicle are `multi`: they appear once in every archetype, with the vehicles of that purpose (see `archetype` above).

| ID | German | English | Archetype |
|---|---|---|---|
| `fighter` | Jäger (Dogfight) | Fighters (dogfight) | Combat |
| `interdiction` | Abfangen / EW | Interdiction / EW | Combat |
| `bomber` | Bomber | Bomber | Combat |
| `gunship` | Gunship | Gunship | Combat |
| `capital` | Flottenkampf / Anti-Capital | Fleet combat / Anti-capital | Combat |
| `dropship` | Dropship / Boarding / FPS | Dropship / Boarding / FPS | Combat |
| `cargo` | Fracht / Handel | Cargo / Trading | Industry & supply |
| `vehicle-transport` | Fahrzeug- & Schiffstransport | Vehicle & ship transport | Industry & supply |
| `mining` | Bergbau (Mining) | Mining | Industry & supply |
| `refining` | Raffinerie (Refining) | Refining | Industry & supply |
| `salvage` | Bergung (Salvage) | Salvage | Industry & supply |
| `construction` | Bau (Construction) | Construction | Industry & supply |
| `refuel` | Tanken (Refuel) | Refuelling | Industry & supply |
| `support` | Reparatur / Munition | Repair / Rearm | Industry & supply |
| `medical` | Medizin / Rettung | Medical / Rescue | Industry & supply |
| `exploration` | Exploration | Exploration | Travel & exploration |
| `recon` | Aufklärung / Datenkurier | Recon / Data running | Travel & exploration |
| `passenger` | Passagiere | Passenger transport | Travel & exploration |
| `touring` | Touring / Wohnen | Touring / Living | Travel & exploration |
| `racing` | Racing | Racing | Travel & exploration |
| `snub` | Snub / Beiboot | Snub / Parasite craft (only the small craft itself, size "S… Snub"; a mothership gets its snub via `data/included.json`) | all three (multi) |
| `ground` | Bodenfahrzeug | Ground vehicle | all three (multi) |

**Adding a loop:** Insert `{ "id": "…", "de": "…", "en": "…", "group": "combat|supply|explore" }` into `loops.json` at the desired position, add an icon to `LOOP_ICONS` in `js/views/common.js`, then assign it to ships in `ships.json`. Don't rename an `id` once it is in use (saved plans and filters refer to it).

## Name matching on import

`match()` in `js/shipdb.js` resolves an imported name like this:

1. The name is normalized: lower-case, with special characters turned into spaces. `"Mercury Star Runner"` and `"mercury-star-runner"` become the same.
2. An exact match against `name` and all `aliases` is tried first.
3. Otherwise the longest database name that the imported name starts with wins. `"Cutlass Black Best In Show Edition"` becomes `Cutlass Black`.

If both fail, a notice "n entries not recognised … Assign" appears at the top; the user can map the name to a database ship there (stored as `fm_aliases` in the browser). For everyone, fix it with an alias or a new entry.

**Careful with aliases:** a generic alias (e.g. `"Hornet"`) also matches other variants through rule 3. The validator reports duplicate names and aliases but not prefix clashes. Prefer one entry per variant.

## Editing in the browser

Non-developers can correct entries directly on the page: **Ship list** tab (or Compare) → ✎. The editor covers size, dimensions, crew, SCU, status, fighter class, the role per gameplay loop and the notes. Name and aliases stay file-only.

- Changes are stored in the browser (`localStorage` key `fm_overrides`) and laid over `ships.json` (`applyOverrides()` in `js/shipdb.js`). Edited ships show an "edited" tag. "Reset to original" removes the change for one ship.
- **Export as ships.json** downloads the complete file with all changes and today's date in `meta.updated`. Hand it to a developer, who replaces `data/ships.json` with it and runs `node tools/validate-ships.mjs --format` and `node tools/build-standalone.mjs`. Review the diff in Git before committing.
- An edit replaces the whole role list of that ship, so it would hide later database changes (new loops, new roles). Each edit therefore stores the database date it was made on (`base`); when `meta.updated` is newer, a notice offers "Show edits" and "Discard outdated".
- After the export has been merged, use "Discard all changes" so the old overrides don't shadow future updates.

## Ship images

The images belong to Cloud Imperium Games and are **not** part of this repository (RSI does not allow re-uploading its content). The page links them: `data/image-urls.json` (ship name → RSI image URL, links only) is committed, and the browser loads each thumbnail from robertsspaceindustries.com – after a notice the visitor can acknowledge or use to switch images off.

**Release (public file):** double-click `tools/build-release.cmd` (Windows) or run `sh tools/build-release.sh`:

```bash
node tools/fetch-ship-images.mjs --urls-only   # refresh data/image-urls.json from the RSI ship matrix
node tools/build-standalone.mjs --remote-images
```

**Own offline copy (never publish it):** `tools/update-images.cmd` / `sh tools/update-images.sh` download the images to `images/ships/` (ignored by Git), point `image` to the local files and build a file that embeds them:

```bash
node tools/fetch-ship-images.mjs          # links + download of missing images
node tools/validate-ships.mjs --format
node tools/build-standalone.mjs           # embeds local images (--no-images: none, --remote-images: links)
```

Options for `fetch-ship-images.mjs`:
- `ship-matrix.json`: use a copy saved in the browser from https://robertsspaceindustries.com/ship-matrix/index if the download is blocked
- `--urls-only`: only write `data/image-urls.json`, download nothing
- `--overwrite`: download again even if the file exists
- `--dry-run`: only report

How it works:
- The links come from the RSI ship matrix (`store_small`, about 350×200 px). Names are matched like a hangar import.
- An https URL you put into `image` by hand wins over the ship matrix. Use this for ships the ship matrix does not list: copy the image address from the RSI page (`media.robertsspaceindustries.com` or `robertsspaceindustries.com` – the Content Security Policy allows only these two hosts).
- Links from the last run are kept when the ship matrix cannot be loaded or no longer lists a ship, so a failed download never empties `image-urls.json`.
- At the end the script lists failed downloads, ship-matrix entries missing from `ships.json` and ships that are still without an image.

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
