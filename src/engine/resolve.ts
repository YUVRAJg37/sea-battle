import { AIRSTRIKE_LENGTH, RADAR_RADIUS } from './config';
import { area, key, line, row, type Cell, type Marks } from './grid';
import { isSunk, shipAt, shipCells, type Fleet } from './fleet';
import type { Action, Outcome } from './actions';
import type { Rng } from './rng';

/**
 * Runs on the defender's side: works out what an action does to their fleet.
 * `marks` are the shots this board has already received.
 */
export function resolveAction(fleet: Fleet, marks: Marks, action: Action, rng: Rng = Math.random): Outcome {
  switch (action.type) {
    case 'shot':
      return fire(fleet, marks, [action.target]);
    case 'salvo':
      return fire(fleet, marks, action.targets);
    case 'airstrike':
      return fire(fleet, marks, line(action.origin, action.dir, AIRSTRIKE_LENGTH));
    case 'torpedo':
      return fire(fleet, marks, torpedoPath(fleet, marks, row(action.row, action.from)));
    case 'radar':
      return { ...empty(), radarCount: area(action.center, RADAR_RADIUS).filter((c) => shipAt(fleet, c)).length };
    case 'scout': {
      const targets = fleet.flatMap(shipCells).filter((c) => !(key(c) in marks));
      return { ...empty(), scouted: targets[Math.floor(rng() * targets.length)] };
    }
  }
}

/** Adds an outcome's hits and misses to a board's marks. */
export function applyOutcome(marks: Marks, outcome: Outcome): Marks {
  const next = { ...marks };
  for (const c of outcome.hits) next[key(c)] = 'hit';
  for (const c of outcome.misses) next[key(c)] = 'miss';
  return next;
}

const empty = (): Outcome => ({ hits: [], misses: [], sunk: [] });

/** Fires at cells; cells already shot are skipped. */
function fire(fleet: Fleet, marks: Marks, cells: Cell[]): Outcome {
  const fresh = cells.filter((c) => !(key(c) in marks));
  const hits = fresh.filter((c) => shipAt(fleet, c));
  const misses = fresh.filter((c) => !shipAt(fleet, c));
  const after = applyOutcome(marks, { hits, misses, sunk: [] });
  const sunk = fleet.filter((s) => !isSunk(s, marks) && isSunk(s, after));
  return { hits, misses, sunk };
}

/** The torpedo runs through water and wrecks until it hits the first unhit ship cell. */
function torpedoPath(fleet: Fleet, marks: Marks, cells: Cell[]): Cell[] {
  const end = cells.findIndex((c) => !(key(c) in marks) && shipAt(fleet, c));
  return end === -1 ? cells : cells.slice(0, end + 1);
}
