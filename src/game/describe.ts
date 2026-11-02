import type { Cell, TurnRecord } from '../engine';

/** Board coordinates as shown on the grid labels, e.g. {x: 1, y: 6} → "B7". */
export const cellName = (c: Cell): string => `${String.fromCharCode(65 + c.x)}${c.y + 1}`;

/** One-line status text for a turn, e.g. "You fired at B7: hit, sunk the cruiser!". */
export function describeTurn({ action, outcome }: TurnRecord, byMe: boolean): string {
  const who = byMe ? 'You' : 'Enemy';
  const what =
    action.type === 'shot' ? `fired at ${cellName(action.target)}`
    : action.type === 'airstrike' ? 'called an airstrike'
    : action.type === 'salvo' ? 'fired a salvo'
    : action.type === 'radar' ? `scanned ${cellName(action.center)}`
    : action.type === 'torpedo'
      ? action.from === 'left' || action.from === 'right'
        ? `launched a torpedo along row ${action.lane + 1}`
        : `launched a torpedo ${action.from === 'top' ? 'down' : 'up'} column ${String.fromCharCode(65 + action.lane)}`
    : `fired a ricochet at ${cellName(action.target)}`;
  const hits = outcome.hits.length;
  const result =
    action.type === 'radar' ? `${outcome.radarCount} ship cells nearby`
    : action.type === 'ricochet' && outcome.misses.length === 2 ? `bounced to ${cellName(outcome.misses[1]!)}, miss`
    : action.type === 'ricochet' && outcome.misses.length === 1 && hits === 1 ? `bounced to ${cellName(outcome.hits[0]!)}, hit`
    : hits === 0 ? 'miss'
    : hits === 1 ? 'hit'
    : `${hits} hits`;
  const sunk = outcome.sunk.map((s) => s.type).join(' and ');
  return `${who} ${what}: ${result}${sunk ? `, sunk the ${sunk}!` : ''}`;
}
