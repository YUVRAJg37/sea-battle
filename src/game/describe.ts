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
    : action.type === 'torpedo' ? `launched a torpedo on row ${action.row + 1}`
    : 'sent a scout';
  const hits = outcome.hits.length;
  const result =
    action.type === 'radar' ? `${outcome.radarCount} ship cells nearby`
    : action.type === 'scout' ? (outcome.scouted ? `ship spotted at ${cellName(outcome.scouted)}` : 'nothing found')
    : hits === 0 ? 'miss'
    : hits === 1 ? 'hit'
    : `${hits} hits`;
  const sunk = outcome.sunk.map((s) => s.type).join(' and ');
  return `${who} ${what}: ${result}${sunk ? `, sunk the ${sunk}!` : ''}`;
}
