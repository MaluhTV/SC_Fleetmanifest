/**
 * Fleet Manifest tests – run before merging to main (GitHub Action .github/workflows/test.yml runs them on every push).
 *
 *   cd flottenmanifest/tests && npm install && npx playwright install chromium && node run.mjs
 *
 * Local Chromium elsewhere: CHROMIUM_PATH=/path/to/chromium node run.mjs
 * Covers: data validation, version = CHANGELOG, analysis rules (logic, no browser), standalone build,
 * import, no script errors, Content Security Policy, code injection through import/backup/storage,
 * phone layout (no page wider than the screen) for index.html and the standalone file.
 * The fixture tests/fixtures/fleet.csv only has names, insurance and meltability – never prices or pledge IDs.
 */
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "fleet.csv");
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) failed++; };
const section = (t) => console.log("\n" + t);

/* ---------- 1. Data and version ---------- */
section("Data");
try { execFileSync("node", [join(ROOT, "tools", "validate-ships.mjs")], { stdio: "pipe" }); ok(true, "validate-ships.mjs: no errors"); }
catch (e) { ok(false, "validate-ships.mjs:\n" + e.stdout); }
const { VERSION } = await import(join(ROOT, "js", "version.js"));
const top = (readFileSync(join(ROOT, "CHANGELOG.md"), "utf8").match(/^## (\d+\.\d+\.\d+)/m) || [])[1];
ok(VERSION === top, `js/version.js (${VERSION}) = top of CHANGELOG.md (${top})`);

/* ---------- 2. Analysis rules (pure logic) ---------- */
section("Analysis");
const { createShipDb, includedIndex } = await import(join(ROOT, "js", "shipdb.js"));
const { buildFleet, analyseOverlaps, remainingAfter } = await import(join(ROOT, "js", "analysis.js"));
const json = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));
const db = createShipDb(json("ships.json"), json("loops.json"), json("example-fleet.json"));
db.included = includedIndex(json("included.json"));
const items = (names) => names.map((name) => ({ name, qty: 1 }));
let fleet = buildFleet(items(["Carrack", "Ursa Rover"]), db);
const by = (n) => fleet.ships.find((s) => s.name === n);
ok(by("C8 Pisces")?.includedOnly, "Carrack brings a C8 Pisces (included only)");
ok(by("Ursa")?.includedBy?.length && !by("Ursa").includedOnly, "own Ursa is marked as also included");
ok(!fleet.ships.find((s) => s.name === "C8X Pisces Expedition"), "plain Carrack does not bring the C8X");
fleet = buildFleet(items(["Constellation Phoenix Emerald"]), db);
ok(fleet.ships.some((s) => s.name === "Lynx") && fleet.unknown.length === 0, "Phoenix Emerald = Phoenix, brings the Lynx");
fleet = buildFleet(items(["600i Executive Edition"]), db);
ok(fleet.ships.some((s) => s.name === "600i Explorer"), "600i Executive Edition = 600i Explorer");
fleet = buildFleet(items(["Mystery Ship"]), db, {}, { "Mystery Ship": "Caterpillar" });
ok(fleet.ships.some((s) => s.name === "Caterpillar"), "own assignment (aliases) maps an unknown name");
fleet = buildFleet(items(["Carrack", "Constellation Andromeda", "890 Jump"]), db);
const snub = analyseOverlaps(fleet.ships, db.loops).overlaps.find((o) => o.loopId === "snub");
ok(!snub, "included snubs alone (C8, Merlin, 85X) cause no overlap");
const rest = remainingAfter(fleet.ships, ["Carrack Expedition w/C8X"]);
ok(!rest.some((s) => s.name === "C8 Pisces"), "a marked Carrack takes its C8 along");
ok(!db.byName("Merchantman").loops.touring, "Merchantman not in touring");
fleet = buildFleet(items(["Constellation Mk V Centaurus", "Ballista Snowblind", "Caterpillar Pirate Edition"]), db);
ok(fleet.ships.some((s) => s.name === "Skylark" && s.includedOnly), "Constellation Mk V brings its Skylark");
ok(fleet.unknown.length === 0 && fleet.ships.some((s) => s.name === "Ballista") && fleet.ships.some((s) => s.name === "Caterpillar"), "editions (Ballista Snowblind, Caterpillar Pirate) = base ship");
const clip = db.byName("Clipper");
ok(clip.length >= clip.beam, "Clipper: length is the longest axis (26.5 × 21 × 18)");

/* ---------- 3. Browser ---------- */
const { chromium } = await import("playwright");
execFileSync("node", [join(ROOT, "tools", "build-standalone.mjs"), "--no-images"], { stdio: "pipe" });
ok(existsSync(join(ROOT, "dist", "flottenmanifest.html")), "standalone build");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(ROOT) || !existsSync(path)) { res.writeHead(404); return res.end(); }
  try { res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }); res.end(readFileSync(path)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

for (const page of ["index.html", "dist/flottenmanifest.html"]) {
  section(`Browser: ${page}`);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const errors = [], csp = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (/Content Security Policy|Refused to/.test(m.text())) csp.push(m.text().slice(0, 120)); });
  await p.goto(`${base}/${page}`);
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => !!document.querySelector(".fm-tour")), "introduction shows on the first visit");
  for (let i = 0; i < 3; i++) await p.click(".fm-tour [data-tour-next]");
  ok(await p.evaluate(() => !document.querySelector(".fm-tour") && localStorage.getItem("fm_tour") === "true"), "introduction: three steps, then remembered");
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("fm_tour", "true"); }); await p.reload(); await p.waitForTimeout(600);
  await p.setInputFiles("#importFile", FIXTURE); await p.waitForTimeout(600);
  const kpi = await p.evaluate(() => [...document.querySelectorAll(".fm-kpi b")].map((b) => b.textContent));
  ok(kpi[0] === "14", `KPI ships = 14 (got ${kpi[0]})`);
  ok(!(await p.evaluate(() => document.getElementById("unknownNote").hidden)), "unknown entry is reported with 'Assign'");
  for (const v of ["loops", "matrix", "list", "overlaps", "planner", "compare"]) { await p.click(`[data-view=${v}]`); await p.waitForTimeout(150); }
  ok(await p.evaluate(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')), "Content Security Policy present");

  // code injection: names, insurance and backup values must never run
  const evil = '"<img src=x onerror=window.__pwn=1>","<svg onload=window.__pwn=1>",true\n"Gladius","\\"><script>window.__pwn=1</script>",true\n';
  await p.setInputFiles("#importFile", { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from('"name","insurance","isMeltable"\n' + evil) });
  await p.waitForTimeout(400);
  for (const v of ["loops", "matrix", "list", "overlaps"]) { await p.click(`[data-view=${v}]`); await p.waitForTimeout(150); }
  const backup = { format: "flottenmanifest-backup", data: { name: "<img src=x onerror=window.__pwn=1>", aliases: { "<b>x</b>": "<script>window.__pwn=1</script>" }, fleet: { own: true, items: [{ name: "<svg onload=window.__pwn=1>", qty: 1 }] } } };
  await p.setInputFiles("#backupFile", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.setItem("fm_overrides", JSON.stringify({ Gladius: { note: { de: "<img src=x onerror=window.__pwn=1>" } } })); });
  await p.reload(); await p.waitForTimeout(500);
  ok((await p.evaluate(() => document.getElementById("appVersion").textContent)).includes(VERSION), "version in the footer");
  await p.click("[data-view=list]"); await p.waitForTimeout(200);
  ok(!(await p.evaluate(() => window.__pwn)), "no injected code ran (import, backup, storage)");
  ok(!errors.length, "no script errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  ok(!csp.length, "no CSP violations" + (csp.length ? ": " + csp.join(" | ") : ""));
  await ctx.close();

  // phone: no tab wider than the screen
  const phone = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const m = await phone.newPage();
  await m.goto(`${base}/${page}`);
  await m.evaluate(() => { localStorage.clear(); localStorage.setItem("fm_tour", "true"); }); await m.reload(); await m.waitForTimeout(600);
  await m.setInputFiles("#importFile", FIXTURE); await m.waitForTimeout(600);
  const wide = [];
  for (const v of ["loops", "matrix", "list", "overlaps", "planner", "compare"]) {
    await m.evaluate((x) => document.querySelector(`[data-view=${x}]`).click(), v); await m.waitForTimeout(200);
    const [w, vw] = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (w > vw) wide.push(`${v} ${w}px`);
  }
  ok(!wide.length, "phone 360 px: no tab wider than the screen" + (wide.length ? " – " + wide.join(", ") : ""));
  await phone.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} test(s) failed.` : "\nAll tests passed.");
process.exit(failed ? 1 : 0);
