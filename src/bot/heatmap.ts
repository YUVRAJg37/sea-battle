import {
  BOARD_SIZE, RADAR_RADIUS, SHIP_TYPES, allCells, area, inBounds, key, opponent, shipCells,
  type Cell, type Dir, type GameState, type Marks, type PlayerId, type Ship,
} from '../engine';

/** Everything the attacker has learned about one board. */
export interface Knowledge {
  marks: Marks;
  sunk: Ship[];
  radar: { center: Cell; count: number }[];
}

// A placement covering a known ship cell is this many times likelier, per cell covered.
const KNOWN_CELL_BONUS = 30;
const DIRS: Dir[] = ['h', 'v'];

export const cellIndex = (c: Cell): number => c.y * BOARD_SIZE + c.x;

export function knowledgeOf(state: GameState, target: PlayerId): Knowledge {
  const ours = state.log.filter((r) => r.attacker === opponent(target));
  return {
    marks: state.players[target].marks,
    sunk: state.players[target].sunk,
    radar: ours.flatMap((r) => (r.action.type === 'radar' ? [{ center: r.action.center, count: r.outcome.radarCount ?? 0 }] : [])),
  };
}

/** Cells no ship can be on: misses, sunk ships, and empty radar scans. */
function blockedCells(k: Knowledge): Set<string> {
  const blocked = new Set(k.sunk.flatMap(shipCells).map(key));
  for (const [cell, result] of Object.entries(k.marks)) if (result === 'miss') blocked.add(cell);
  for (const r of k.radar) if (r.count === 0) for (const c of area(r.center, RADAR_RADIUS)) blocked.add(key(c));
  return blocked;
}

/** Every way a ship still afloat could lie without crossing a blocked cell. */
function placements(k: Knowledge, blocked: Set<string>): Cell[][] {
  return SHIP_TYPES.filter((type) => !k.sunk.some((s) => s.type === type)).flatMap((type) =>
    allCells().flatMap((origin) => DIRS.map((dir) => shipCells({ type, origin, dir })))
      .filter((cells) => cells.every((c) => inBounds(c) && !blocked.has(key(c)))),
  );
}

/**
 * Live hits: ship cells we know about whose ship isn't sunk yet. A hit no remaining ship could
 * cover must be the mine, so it's dropped.
 */
export function knownShipCells(k: Knowledge, blocked = blockedCells(k)): Set<string> {
  const sunkCells = new Set(k.sunk.flatMap(shipCells).map(key));
  const coverable = new Set(placements(k, blocked).flat().map(key));
  const known = new Set<string>();
  for (const [cell, result] of Object.entries(k.marks)) if (result === 'hit' && !sunkCells.has(cell) && coverable.has(cell)) known.add(cell);
  return known;
}

/**
 * How likely each unshot cell is to hold a ship: the weighted count of every way the remaining
 * ships could still be placed that covers it. Indexed by `cellIndex`; shot cells are 0.
 */
export function heatMap(k: Knowledge): number[] {
  const blocked = blockedCells(k);
  const known = knownShipCells(k, blocked);
  const radarHits = k.radar.filter((r) => r.count > 0);

  const heat = new Array<number>(BOARD_SIZE * BOARD_SIZE).fill(0);
  for (const cells of placements(k, blocked)) {
    let weight = KNOWN_CELL_BONUS ** cells.filter((c) => known.has(key(c))).length;
    for (const r of radarHits) if (cells.some((c) => near(c, r.center))) weight *= 1 + r.count;
    for (const c of cells) heat[cellIndex(c)]! += weight;
  }
  for (const cell of Object.keys(k.marks)) {
    const [x, y] = cell.split(',').map(Number) as [number, number];
    heat[cellIndex({ x, y })] = 0;
  }
  return heat;
}

const near = (c: Cell, center: Cell) =>
  Math.abs(c.x - center.x) <= RADAR_RADIUS && Math.abs(c.y - center.y) <= RADAR_RADIUS;
