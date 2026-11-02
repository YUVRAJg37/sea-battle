import { AIRSTRIKE_LENGTH, RADAR_RADIUS, RICOCHET_SKIP } from './config';
import { area, inBounds, key, lane, line, toward, type Cell, type Edge, type Marks } from './grid';
import { isSunk, shipAt, type Fleet } from './fleet';
import type { Action, Outcome } from './actions';

/**
 * Runs on the defender's side: works out what an action does to their fleet.
 * `marks` are the shots this board has already received.
 */
export function resolveAction(fleet: Fleet, marks: Marks, action: Action): Outcome {
  switch (action.type) {
    case 'shot':
      return fire(fleet, marks, [action.target]);
    case 'salvo':
      return fire(fleet, marks, action.targets);
    case 'airstrike':
      return fire(fleet, marks, line(action.origin, action.dir, AIRSTRIKE_LENGTH));
    case 'torpedo':
      return fire(fleet, marks, torpedoPath(fleet, marks, lane(action.lane, action.from)));
    case 'radar':
      // Radar sees through the mine.
      return { ...empty(), radarCount: area(action.center, RADAR_RADIUS).filter((c) => { const s = shipAt(fleet, c); return s && s.type !== 'mine'; }).length };
    case 'ricochet': {
      const first = fire(fleet, marks, [action.target]);
      const landing = first.hits.length ? undefined : ricochetLanding(action.target, action.toward, applyOutcome(marks, first));
      return landing ? fire(fleet, marks, [action.target, landing]) : first;
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

/**
 * Where a missed ricochet comes down: RICOCHET_SKIP cells on, sliding further past cells already shot.
 * Undefined when it skips off the board. Depends only on public marks, so both sides agree on it.
 */
export function ricochetLanding(from: Cell, edge: Edge, marks: Marks): Cell | undefined {
  for (let c = toward(from, edge, RICOCHET_SKIP); inBounds(c); c = toward(c, edge)) {
    if (!(key(c) in marks)) return c;
  }
  return undefined;
}

/** The torpedo runs through water and wrecks until it hits the first unhit ship cell. */
function torpedoPath(fleet: Fleet, marks: Marks, cells: Cell[]): Cell[] {
  const end = cells.findIndex((c) => !(key(c) in marks) && shipAt(fleet, c));
  return end === -1 ? cells : cells.slice(0, end + 1);
}
