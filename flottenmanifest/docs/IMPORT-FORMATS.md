# Import formats (`js/importers.js`)

The page detects the format from the file content, not the file extension. Only **ship name, quantity, insurance and meltability** are taken over. Pledge IDs, prices and pledge names are discarded. They never reach storage or the page.

## Supported formats

| Format | Detected by | What is read |
|---|---|---|
| **Hangar.link CSV** | header contains `Hangar`, `Source`, `Items` | Only rows with `Source = Active` count. Ships come from `Items` (`[\|TITLE\| … \|KIND\| Ship …]`), falling back to the ship slug or `Contains`. Each pledge gets its best insurance (LTI first, then the longest term). The account name comes from `Hangar`. |
| **Hangar XPLORer CSV** (any CSV with a `name` column) | header contains `name` | One row per ship, optionally with `insurance`, `isMeltable` and `account`. |
| **FleetViewer JSON** (STARJUMP) | JSON with `canvasItems` | Entries with `itemType: "SHIP"`. The name is the last line of `defaultText`, falling back to `variantSlug`/`shipSlug`. |
| **JSON** (generic list) | JSON array, or object with `ships`/`vehicles`/`fleet`/`hangar`/`items`/`data` | Strings, or objects with `name`/`shipName`/`model.name`/`slug` and optionally `quantity`/`qty`/`count`. |
| **Paste list** (text box) | – | One ship per line, optionally `2x Name` or `2 × Name`. |

Example of a simple JSON list:

```json
{ "ships": [ { "name": "Caterpillar" }, { "name": "Golem", "qty": 2 }, "Starlancer MAX" ] }
```

Ship names from the file are matched via `name` and `aliases` in `data/ships.json` (see [name matching](SHIP-DATABASE.md#name-matching-on-import)). Unknown names trigger a notice "n entries not recognised … Assign" at the top of the page, where the user can map them to a database ship (stored as `fm_aliases`).

## Adding a format

Each format is an object with four fields:

```js
const myFormat = {
  id: "my-format",                // technical name
  label: "My Tool CSV",           // shown in the success and error messages
  detect(text, ctx) {             // true if the file belongs to this format
    return text.startsWith("MyTool;");
  },
  parse(text, ctx) {              // ctx.db = ship database (for ctx.db.match(name))
    const items = [/* { name, qty, insurance?, meltable? } */];
    return { items, account: "" }; // account optionally fills the username
  },
};
```

Then add the object to `IMPORTERS`. **Order matters:** the first format whose `detect()` returns `true` wins. Put specific formats before generic ones (e.g. before `shipListCsv` or `genericJson`).

Item fields:

| Field | Type | Meaning |
|---|---|---|
| `name` | string | ship name, ideally as in the database |
| `qty` | number | quantity (default 1). Equal names are summed later. |
| `insurance` | string | `"LTI"`, months as a number (`"120"`) or `""` |
| `meltable` | `true`/`false`/`null` | melt status shown as the exchange / upgrade pair (Optimise, Compare, ship list); `false` = exchange struck through, `null` = unknown (grey "?" pair, can be set by click) |

Helpers in the file:
- `parseCSV(text)`
- `csvTable(text)`: returns `rows` and `get(row, column)`, with lower-case column names
- `slugToName(slug)`
- `bestName(ctx, …candidates)`: picks the first candidate the database knows

**Privacy rule:** an importer returns only the fields above. Prices, pledge IDs, e-mail addresses and similar data must never end up in `items`.

## Testing without a browser

```bash
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { createShipDb } from "./js/shipdb.js";
import { importFile } from "./js/importers.js";
const j = (f) => JSON.parse(readFileSync(f, "utf8"));
const db = createShipDb(j("data/ships.json"), j("data/loops.json"), j("data/example-fleet.json"));
const r = importFile(readFileSync(process.argv[1], "utf8"), db);
console.log(r.format, r.items.length, r.items.filter((i) => !db.match(i.name)).map((i) => i.name));
' my-export.csv
```
