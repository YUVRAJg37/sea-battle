import {
  AIRSTRIKE_LENGTH, BOARD_SIZE, RADAR_RADIUS, area, lane, line, sameCell,
  type Ability, type Action, type Cell, type Dir, type Edge,
} from '../engine';

/** What the player has selected to fire: a normal shot or an ability. */
export type Mode = 'shot' | Ability;

export interface Aim {
  cells: Cell[]; // cells to highlight, in firing order
  action: Action | null; // null while the aim is incomplete (first salvo target)
}

/**
 * Turns the selected mode and the cell under the pointer into a preview and an action. `dir`
 * orients the airstrike; `side` is the edge the torpedo launches from.
 */
export function aim(mode: Mode, cell: Cell, dir: Dir, salvoFirst: Cell | null = null, side: Edge = 'left'): Aim {
  switch (mode) {
    case 'shot':
      return { cells: [cell], action: { type: 'shot', target: cell } };
    case 'airstrike': {
      // Slide the strike back so all of it fits on the board.
      const max = BOARD_SIZE - AIRSTRIKE_LENGTH;
      const origin = dir === 'h' ? { x: Math.min(cell.x, max), y: cell.y } : { x: cell.x, y: Math.min(cell.y, max) };
      return { cells: line(origin, dir, AIRSTRIKE_LENGTH), action: { type: 'airstrike', origin, dir } };
    }
    case 'salvo':
      if (!salvoFirst) return { cells: [cell], action: null };
      return {
        cells: [salvoFirst, cell],
        action: sameCell(salvoFirst, cell) ? null : { type: 'salvo', targets: [salvoFirst, cell] },
      };
    case 'radar':
      return { cells: area(cell, RADAR_RADIUS), action: { type: 'radar', center: cell } };
    case 'torpedo': {
      // From the left or right it runs along the tapped row; from the top or bottom, down its column.
      const index = side === 'left' || side === 'right' ? cell.y : cell.x;
      return { cells: lane(index, side), action: { type: 'torpedo', lane: index, from: side } };
    }
    case 'scout':
      return { cells: [], action: { type: 'scout' } };
  }
}
