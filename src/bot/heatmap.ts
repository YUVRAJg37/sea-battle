import {
  BOARD_SIZE, RADAR_RADIUS, SHIP_TYPES, allCells, area, inBounds, key, opponent, shipCells,
  type Cell, type Dir, type GameState, type Marks, type PlayerId, type Ship,
} from '../engine';

/** Everything the attacker has learned about one board. */
export interface Knowledge {
  marks: Marks;
  sunk: Ship[];
  radar: { center: Cell; count: number }[];
  scouted: Cell[];
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
    scouted: ours.flatMap((r) => (r.outcome.scouted ? [r.outcome.scouted] : [])),
  };
}

/** Live hits and scouted cells: ship cells we know about whose ship isn't sunk yet. */
export function knownShipCells(k: Knowledge): Set<string> {
  const sunkCells = new Set(k.sunk.flatMap(shipCells).map(key));
  const known = new Set(k.scouted.map(key));
  for (const [cell, result] of Object.entries(k.marks)) if (result === 'hit') known.add(cell);
  for (const cell of sunkCells) known.delete(cell);
  return known;
}

/**
 * How likely each unshot cell is to hold a ship: the weighted count of every way the remaining
 * ships could still be placed that covers it. Indexed by `cellIndex`; shot cells are 0.
 */
export function heatMap(k: Knowledge): number[] {
  const known = knownShipCells(k);
  const blocked = new Set(k.sunk.flatMap(shipCells).map(key));
  for (const [cell, result] of Object.entries(k.marks)) if (result === 'miss') blocked.add(cell);
  for (const r of k.radar) if (r.count === 0) for (const c of area(r.center, RADAR_RADIUS)) blocked.add(key(c));
  const radarHits = k.radar.filter((r) => r.count > 0);

  const heat = new Array<number>(BOARD_SIZE * BOARD_SIZE).fill(0);
  for (const type of SHIP_TYPES) {
    if (k.sunk.some((s) => s.type === type)) continue;
    for (const origin of allCells()) {
      for (const dir of DIRS) {
        const cells = shipCells({ type, origin, dir });
        if (cells.some((c) => !inBounds(c) || blocked.has(key(c)))) continue;
        let weight = KNOWN_CELL_BONUS ** cells.filter((c) => known.has(key(c))).length;
        for (const r of radarHits) if (cells.some((c) => near(c, r.center))) weight *= 1 + r.count;
        for (const c of cells) heat[cellIndex(c)]! += weight;
      }
    }
  }
  for (const cell of Object.keys(k.marks)) {
    const [x, y] = cell.split(',').map(Number) as [number, number];
    heat[cellIndex({ x, y })] = 0;
  }
  return heat;
}

const near = (c: Cell, center: Cell) =>
  Math.abs(c.x - center.x) <= RADAR_RADIUS && Math.abs(c.y - center.y) <= RADAR_RADIUS;
