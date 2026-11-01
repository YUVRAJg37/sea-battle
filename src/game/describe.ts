import type { TurnRecord } from '../engine';

/** One-line status text for a turn, e.g. "You used airstrike: 2 hits, sunk cruiser!". */
export function describeTurn({ action, outcome }: TurnRecord, byMe: boolean): string {
  const who = byMe ? 'You' : 'Enemy';
  const what = action.type === 'shot' ? 'fired' : `used ${action.type}`;
  const hits = outcome.hits.length;
  const result =
    action.type === 'radar' ? `${outcome.radarCount} ship cells in the area`
    : action.type === 'scout' ? 'spotted a ship'
    : hits ? `${hits} hit${hits > 1 ? 's' : ''}`
    : 'miss';
  const sunk = outcome.sunk.map((s) => s.type).join(', ');
  return `${who} ${what}: ${result}${sunk ? `, sunk ${sunk}!` : ''}`;
}
