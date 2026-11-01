import {
  AIRSTRIKE_LENGTH, BOARD_SIZE, RADAR_RADIUS, area, line, row, sameCell,
  type Ability, type Action, type Cell, type Dir,
} from '../engine';

/** What the player has selected to fire: a normal shot or an ability. */
export type Mode = 'shot' | Ability;

export interface Aim {
  cells: Cell[]; // cells to highlight
  action: Action | null; // null while the aim is incomplete (first salvo target)
}

/** Turns the selected mode and the cell under the pointer into a preview and an action. */
export function aim(mode: Mode, cell: Cell, dir: Dir, salvoFirst: Cell | null = null): Aim {
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
      // Launch from whichever side of the board is closer to the tapped cell.
      const from = cell.x < BOARD_SIZE / 2 ? 'left' : 'right';
      return { cells: row(cell.y, from), action: { type: 'torpedo', row: cell.y, from } };
    }
    case 'scout':
      return { cells: [], action: { type: 'scout' } };
  }
}
