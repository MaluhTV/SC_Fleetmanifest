/**
 * Domain logic: build a fleet from import items and analyse it.
 * No DOM access – every function can be tested without a browser.
 */
import { ROLE, STATUS, sizeRank, FIGHTER_LADDER } from "./shipdb.js";
import { sum } from "./util.js";

/**
 * Merges import items into fleet ships.
 * @returns {{ships: FleetShip[], unknown: string[]}}
 *   FleetShip = database ship + qty, insurance (list), notMeltable (count),
 *               meltKnown (count of copies whose meltability the import stated),
 *               melt = "meltable" | "upgrade" | "locked" | null (null = unknown), meltManual = set by the user
 * meltOverrides = { shipName: status } chosen by clicking the melt icon (state.melt)
 */
export function buildFleet(items, db, meltOverrides = {}) {
  const byShip = new Map();
  const unknown = [];
  for (const item of items) {
    const ship = db.match(item.name);
    if (!ship) { unknown.push(item.name); continue; }
    if (!byShip.has(ship.name)) byShip.set(ship.name, { ...ship, qty: 0, insurance: [], notMeltable: 0, meltKnown: 0 });
    const entry = byShip.get(ship.name);
    const qty = item.qty || 1;
    entry.qty += qty;
    if (item.insurance && !entry.insurance.includes(item.insurance)) entry.insurance.push(item.insurance);
    if (item.meltable === false) entry.notMeltable += qty;
    if (item.meltable === true || item.meltable === false) entry.meltKnown += qty;
  }
  const ships = [...byShip.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of ships) {
    s.meltManual = MELT_STATES.includes(meltOverrides[s.name]);
    s.melt = s.meltManual ? meltOverrides[s.name] : defaultMelt(s);
  }
  return { ships, unknown };
}

export const isFlightReady = (s) => s.status === STATUS.FLIGHT_READY;

/**
 * Melt states = meltable × upgradeable (CCU):
 *   meltable  green open lock         meltable and upgradeable
 *   meltOnly  orange open lock with ! meltable, but no CCU upgrade possible
 *   upgrade   yellow lock with arrow  not meltable, upgrade via CCU only
 *   locked    red closed lock         neither meltable nor upgradeable
 */
export const MELT_STATES = ["meltable", "meltOnly", "upgrade", "locked"];
/** Default: meltability from the import, upgradeability from ships.json (upgradeable: false, e.g. F8C Lightning Civilian, PTV). */
function defaultMelt(s) {
  if (!s.meltKnown) return null;
  const upgradeable = s.upgradeable !== false;
  if (!s.notMeltable) return upgradeable ? "meltable" : "meltOnly";
  return upgradeable ? "upgrade" : "locked";
}

/** Loop statistics: all ships in it, primary, planned, and totals for the primary ships. */
export function loopStats(fleetShips, loopId) {
  const all = fleetShips.filter((s) => s.loops[loopId]);
  const primary = all.filter((s) => s.loops[loopId] === ROLE.PRIMARY);
  const planned = all.filter((s) => s.loops[loopId] === ROLE.PLANNED);
  return {
    all,
    primary,
    planned,
    secondaryCount: all.length - primary.length - planned.length,
    scuPrimary: sum(primary, (s) => s.scu * s.qty),
    crewMinPrimary: sum(primary, (s) => s.crewMin * s.qty),
    crewMaxPrimary: sum(primary, (s) => s.crewMax * s.qty),
  };
}

/* ---------- Overlaps ---------- */

const isActive = (role) => role && role !== ROLE.PLANNED;

/**
 * A substitute may need more minimum crew, but at most CREW_GROWTH_MAX times as much.
 * Exception: a solo ship (1) may be replaced by a 2-seater.
 *   1 → 2 ok, 1 → 3 no · 3 → 5 ok, 3 → 6 no · 6 → 10 ok, 6 → 11 no
 */
export const CREW_GROWTH_MAX = 1.75;
const crewAcceptable = (o, s) => o.crewMin <= (s.crewMin <= 1 ? 2 : s.crewMin * CREW_GROWTH_MAX);

/**
 * o can stand in for s within ONE loop (the overlap being looked at). Other loops don't matter here –
 * what s would lose elsewhere is reported separately as lostLoops.
 * - o has the loop as a primary role
 * - o is at least as large
 * - for cargo: o has at least as much SCU
 * - o's minimum crew does not grow too much (crewAcceptable)
 * - for fighters: o has at least s's fighter class (fighterClassAcceptable)
 */
function substitutesInLoop(o, s, loopId) {
  return (
    o.name !== s.name &&
    o.loops[loopId] === ROLE.PRIMARY &&
    sizeRank(o.size) >= sizeRank(s.size) &&
    (loopId !== "cargo" || o.scu >= s.scu) &&
    crewAcceptable(o, s) &&
    (loopId !== "fighter" || fighterClassAcceptable(o, s))
  );
}

/**
 * Fighter class rule (FIGHTER_CLASSES in shipdb.js):
 * ladder classes (snub < light < medium < heavy) may be replaced by the same or a heavier class,
 * specialised classes (interceptor, stealth, interdiction, bomber) only by the same class.
 * Ships without a class are compared by size only.
 */
function fighterClassAcceptable(o, s) {
  if (!s.fighterClass) return true;
  if (!o.fighterClass) return false;
  const a = FIGHTER_LADDER[o.fighterClass], b = FIGHTER_LADDER[s.fighterClass];
  return a !== undefined && b !== undefined ? a >= b : o.fighterClass === s.fighterClass;
}

/** Steps on the fighter ladder between o and s (0 = same class, also for specialised classes). */
const fighterClassDistance = (o, s) =>
  Math.abs((FIGHTER_LADDER[o.fighterClass] ?? 0) - (FIGHTER_LADDER[s.fighterClass] ?? 0));

/** Loops s plays (primary or secondary) that o does not – they would be lost by the swap. */
const lostLoops = (s, o, loopId) =>
  Object.keys(s.loops).filter((k) => k !== loopId && isActive(s.loops[k]) && !isActive(o.loops[k]));

/**
 * Fleet ships that could replace s in this loop, closest match first:
 * (fighters: nearest fighter class), smallest size, then lowest minimum crew, then fewest lost loops, then least SCU.
 * pool = flight-ready ships that are not marked for replacement.
 * If two unmarked ships could replace each other, only one of them is reported (alphabetical).
 */
function findReplacements(s, loopId, pool, isMarked) {
  const options = pool.filter((o) =>
    substitutesInLoop(o, s, loopId) && (isMarked || !(substitutesInLoop(s, o, loopId) && s.name < o.name)));
  return options.sort((a, b) =>
    (loopId === "fighter" ? fighterClassDistance(a, s) - fighterClassDistance(b, s) : 0) ||
    sizeRank(a.size) - sizeRank(b.size) || a.crewMin - b.crewMin ||
    lostLoops(s, a, loopId).length - lostLoops(s, b, loopId).length || a.scu - b.scu || a.name.localeCompare(b.name));
}

/** A loop with at least this many primary ships counts as an overlap. */
export const OVERLAP_MIN_SHIPS = 3;

/**
 * Analysis for the "Overlaps" tab.
 * marked = names the user marked for replacement. Marked ships are never offered as substitutes,
 * and gaps / orphan snubs are computed as if they were already gone.
 * chosen = { shipToReplace: substitute } picked by the user; a valid choice is listed as the replacement.
 * Gaps: loops without any remaining ship in a primary or planned role. Planned ships count like regular ones,
 * because several loops are not fully implemented in the game yet.
 * @returns {{overlaps, gaps: string[], orphanSnubs: FleetShip[]}}
 *   overlaps[].candidates[] = { ship, marked, replacement (or null), chosen (bool), alternatives[], lost: [{ loopId, coveredElsewhere }] }
 */
export function analyseOverlaps(fleetShips, loops, marked = [], chosen = {}) {
  const markedSet = new Set(marked);
  const remaining = fleetShips.filter((s) => !markedSet.has(s.name));
  const flightReady = fleetShips.filter(isFlightReady);
  const pool = remaining.filter(isFlightReady);

  const overlaps = loops
    .map(({ id }) => {
      const primary = flightReady.filter((s) => s.loops[id] === ROLE.PRIMARY);
      if (primary.length < OVERLAP_MIN_SHIPS) return null;
      const candidates = primary
        .map((ship) => {
          const isMarked = markedSet.has(ship.name);
          // ships owned more than once and ground vehicles are only listed if the user marked them
          if (!isMarked && (ship.qty !== 1 || sizeRank(ship.size) === 0)) return null;
          const options = findReplacements(ship, id, pool, isMarked);
          // the user's pick comes first if it is a valid substitute in this loop
          const pick = options.findIndex((o) => o.name === chosen[ship.name]);
          if (pick > 0) options.unshift(...options.splice(pick, 1));
          const [replacement = null, ...alternatives] = options;
          if (!replacement && !isMarked) return null;
          const lost = replacement
            ? lostLoops(ship, replacement, id).map((k) => ({
                loopId: k,
                coveredElsewhere: pool.some((o) => o.name !== ship.name && o.name !== replacement.name && o.loops[k] === ROLE.PRIMARY),
              }))
            : [];
          return { ship, marked: isMarked, replacement, chosen: pick >= 0, alternatives, lost };
        })
        .filter(Boolean)
        .sort((a, b) => b.marked - a.marked); // marked ships first
      return { loopId: id, primary, markedCount: primary.filter((s) => markedSet.has(s.name)).length, candidates, crewMax: sum(primary, (s) => s.crewMax * s.qty) };
    })
    .filter(Boolean)
    .sort((a, b) => b.primary.length - a.primary.length);

  const gaps = loops
    .map(({ id }) => id)
    .filter((id) => !remaining.some((s) => s.loops[id] === ROLE.PRIMARY || s.loops[id] === ROLE.PLANNED));

  const owned = new Set(remaining.map((s) => s.name));
  const orphanSnubs = remaining.filter((s) => s.motherships.length && !s.motherships.some((m) => owned.has(m)));

  return { overlaps, gaps, orphanSnubs };
}

/* ---------- Fleet planner ---------- */

/**
 * Crew a ship really needs for proper operation. RSI lists many ships as "1–4" as soon as the pilot can
 * work one station alone, but they are only effective with a second person. So: minimum crew 1 with
 * EFFECTIVE_CREW_FROM_MAX or more seats counts as 2 (MOTH 1–4 → 2); 1–1 and 1–2 stay solo ships.
 */
export const EFFECTIVE_CREW_FROM_MAX = 3;
export const effectiveCrew = (s) => (s.crewMin === 1 && s.crewMax >= EFFECTIVE_CREW_FROM_MAX ? 2 : s.crewMin);

/**
 * Ships for one planner slot ({ loop, min, max }; max null = open):
 * the loop as primary or planned role, and an effective crew (effectiveCrew) within min…max
 * ("Crew 1–2" = can be run properly with 1 to 2 people, "2+" = needs at least 2).
 * Owned ships first (the fleet copy, with quantity and melt status), then flight-ready, then smallest.
 */
export function plannerSuggestions(dbShips, fleetShips, slot) {
  const owned = new Map(fleetShips.map((s) => [s.name, s]));
  const max = slot.max == null ? Infinity : slot.max;
  return dbShips
    .filter((s) => (s.loops[slot.loop] === ROLE.PRIMARY || s.loops[slot.loop] === ROLE.PLANNED) && effectiveCrew(s) >= slot.min && effectiveCrew(s) <= max)
    .map((s) => owned.get(s.name) || s)
    .sort((a, b) =>
      owned.has(b.name) - owned.has(a.name) || isFlightReady(b) - isFlightReady(a) ||
      sizeRank(a.size) - sizeRank(b.size) || effectiveCrew(a) - effectiveCrew(b) || b.scu - a.scu || a.name.localeCompare(b.name));
}

/* ---------- Compare ---------- */

/**
 * Balance for "b instead of a": SCU difference, loops gained and lost (planned roles ignored)
 * and which fleet ships already cover the lost loops as a primary role.
 */
export function swapBalance(a, b, fleetShips) {
  const active = (s) => Object.keys(s.loops).filter((k) => s.loops[k] !== ROLE.PLANNED);
  const has = (s, k) => s.loops[k] && s.loops[k] !== ROLE.PLANNED;
  const gained = active(b).filter((k) => !has(a, k));
  const lost = active(a).filter((k) => !has(b, k));
  const coveredBy = lost.map((k) => ({
    loopId: k,
    ships: fleetShips.filter((f) => f.name !== a.name && isFlightReady(f) && f.loops[k] === ROLE.PRIMARY).map((f) => f.name),
  }));
  return { scuDelta: b.scu - a.scu, gained, lost, coveredBy };
}
