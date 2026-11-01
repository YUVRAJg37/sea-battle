import type { Cell, Dir } from './grid';
import type { Ship } from './fleet';

/** What the attacker does on their turn: a normal shot or one ship's ability. */
export type Action =
  | { type: 'shot'; target: Cell }
  | { type: 'airstrike'; origin: Cell; dir: Dir }
  | { type: 'salvo'; targets: [Cell, Cell] }
  | { type: 'radar'; center: Cell }
  | { type: 'torpedo'; row: number; from: 'left' | 'right' }
  | { type: 'scout' };

/** What the defender reports back. Ships in `sunk` are revealed in full. */
export interface Outcome {
  hits: Cell[];
  misses: Cell[];
  sunk: Ship[];
  radarCount?: number;
  scouted?: Cell;
}
