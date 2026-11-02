import type { Cell, Dir, Edge } from './grid';
import type { Ship } from './fleet';

/** What the attacker does on their turn: a normal shot or one ship's ability. */
export type Action =
  | { type: 'shot'; target: Cell }
  | { type: 'airstrike'; origin: Cell; dir: Dir }
  | { type: 'salvo'; targets: [Cell, Cell] }
  | { type: 'radar'; center: Cell }
  | { type: 'torpedo'; lane: number; from: Edge } // lane: row index from left/right, column index from top/bottom
  | { type: 'ricochet'; target: Cell; toward: Edge }; // on a miss, bounces RICOCHET_SKIP cells toward that edge

/** What the defender reports back. Ships in `sunk` are revealed in full. */
export interface Outcome {
  hits: Cell[];
  misses: Cell[];
  sunk: Ship[];
  radarCount?: number;
}
