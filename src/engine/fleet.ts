import { BOARD_SIZE, SHIPS, SHIP_TYPES, type ShipType } from './config';
import { inBounds, key, line, type Cell, type Dir, type Marks } from './grid';
import type { Rng } from './rng';

export interface Ship {
  type: ShipType;
  origin: Cell;
  dir: Dir;
}

export type Fleet = Ship[];

export const shipCells = (ship: Ship): Cell[] => line(ship.origin, ship.dir, SHIPS[ship.type].length);

export function shipAt(fleet: Fleet, cell: Cell): Ship | undefined {
  const k = key(cell);
  return fleet.find((s) => shipCells(s).some((c) => key(c) === k));
}

export const isSunk = (ship: Ship, marks: Marks): boolean =>
  shipCells(ship).every((c) => marks[key(c)] === 'hit');

/** Returns a reason the fleet is invalid, or null if it is valid. */
export function validateFleet(fleet: Fleet): string | null {
  if (fleet.length !== SHIP_TYPES.length) return 'wrong number of ships';
  const occupied = new Set<string>();
  for (const type of SHIP_TYPES) {
    const ships = fleet.filter((s) => s.type === type);
    if (ships.length !== 1) return `need exactly one ${type}`;
    const ship = ships[0]!;
    if (ship.dir !== 'h' && ship.dir !== 'v') return `bad direction for ${type}`;
    for (const c of shipCells(ship)) {
      if (!inBounds(c)) return `${type} is off the board`;
      if (occupied.has(key(c))) return `${type} overlaps another ship`;
      occupied.add(key(c));
    }
  }
  return null;
}

export function randomFleet(rng: Rng): Fleet {
  const fleet: Fleet = [];
  for (const type of SHIP_TYPES) {
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
