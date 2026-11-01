// Fair play over P2P: each player publishes a hash of their fleet before the first shot,
// then reveals fleet + salt at the end so the opponent can replay and check every report.
import { SHIP_TYPES } from './config';
import { key, type Marks } from './grid';
import { shipAt, validateFleet, type Fleet, type Ship } from './fleet';
import type { Outcome } from './actions';
import { applyOutcome, resolveAction } from './resolve';
import type { PlayerId, TurnRecord } from './game';

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function commitFleet(fleet: Fleet, salt: string): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify({ fleet: canonicalFleet(fleet), salt }));
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

/** Checks that `defender` reported every turn honestly. Returns the problem, or null if clean. */
export async function verifyDefender(
  log: TurnRecord[],
  defender: PlayerId,
  fleet: Fleet,
  salt: string,
  commitment: string,
): Promise<string | null> {
  const invalid = validateFleet(fleet);
  if (invalid) return `revealed fleet is invalid: ${invalid}`;
  if ((await commitFleet(fleet, salt)) !== commitment) return 'revealed fleet does not match commitment';

  let marks: Marks = {};
  for (const [i, { attacker, action, outcome }] of log.entries()) {
    if (attacker === defender) continue;
    if (action.type === 'scout') {
      // Scout picks a random cell, so check it is a real unhit ship cell instead of replaying it.
      const c = outcome.scouted;
      if (!c || !shipAt(fleet, c) || key(c) in marks) return `false scout report on turn ${i + 1}`;
    } else if (canonicalOutcome(resolveAction(fleet, marks, action)) !== canonicalOutcome(outcome)) {
      return `false report on turn ${i + 1}`;
    }
    marks = applyOutcome(marks, outcome);
  }
  return null;
}

// Fixed field order so data that went through the network compares and hashes identically.
const canonicalShip = (s: Ship) => ({ type: s.type, x: s.origin.x, y: s.origin.y, dir: s.dir });

const canonicalFleet = (fleet: Fleet) =>
  [...fleet].sort((a, b) => SHIP_TYPES.indexOf(a.type) - SHIP_TYPES.indexOf(b.type)).map(canonicalShip);

const canonicalOutcome = (o: Outcome): string =>
  JSON.stringify([o.hits.map(key), o.misses.map(key), canonicalFleet(o.sunk), o.radarCount ?? null]);

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
