import { BOARD_SIZE, FLEET_PIECES, PIECE_TYPES, pieceLength, type PieceType } from './config';
import { inBounds, key, line, type Cell, type Dir, type Marks } from './grid';
import type { Rng } from './rng';

export interface Ship {
  type: PieceType;
  origin: Cell;
  dir: Dir;
}

export type Fleet = Ship[]; // FLEET_PIECES: the five warships and two mines

export const shipCells = (ship: Ship): Cell[] => line(ship.origin, ship.dir, pieceLength(ship.type));

export function shipAt(fleet: Fleet, cell: Cell): Ship | undefined {
  const k = key(cell);
  return fleet.find((s) => shipCells(s).some((c) => key(c) === k));
}

/** The mine never sinks. */
export const isSunk = (ship: Ship, marks: Marks): boolean =>
  ship.type !== 'mine' && shipCells(ship).every((c) => marks[key(c)] === 'hit');

/** Returns a reason the fleet is invalid, or null if it is valid. */
export function validateFleet(fleet: Fleet): string | null {
  if (fleet.length !== FLEET_PIECES.length) return 'wrong number of ships';
  for (const type of PIECE_TYPES) {
    const need = FLEET_PIECES.filter((t) => t === type).length;
    if (fleet.filter((s) => s.type === type).length !== need) return need === 1 ? `need exactly one ${type}` : `need exactly ${need} ${type}s`;
  }
  const occupied = new Set<string>();
  for (const ship of fleet) {
    if (ship.dir !== 'h' && ship.dir !== 'v') return `bad direction for ${ship.type}`;
    for (const c of shipCells(ship)) {
      if (!inBounds(c)) return `${ship.type} is off the board`;
      if (occupied.has(key(c))) return `${ship.type} overlaps another ship`;
      occupied.add(key(c));
    }
  }
  return null;
}

export function randomFleet(rng: Rng): Fleet {
  const fleet: Fleet = [];
  for (const type of FLEET_PIECES) {
    for (;;) {
      const ship: Ship = {
        type,
        dir: rng() < 0.5 ? 'h' : 'v',
        origin: { x: Math.floor(rng() * BOARD_SIZE), y: Math.floor(rng() * BOARD_SIZE) },
      };
      const fits = shipCells(ship).every((c) => inBounds(c) && !shipAt(fleet, c));
      if (fits) {
        fleet.push(ship);
        break;
      }
    }
  }
  return fleet;
}
