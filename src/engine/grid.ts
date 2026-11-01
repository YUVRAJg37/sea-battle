import { BOARD_SIZE } from './config';

export interface Cell {
  x: number;
  y: number;
}

export type Dir = 'h' | 'v';

/** Shots received on a board, keyed by `key(cell)`. */
export type Marks = Record<string, 'hit' | 'miss'>;

export const key = (c: Cell): string => `${c.x},${c.y}`;

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

export function inBounds(c: Cell): boolean {
  return (
    Number.isInteger(c.x) && Number.isInteger(c.y) &&
    c.x >= 0 && c.y >= 0 && c.x < BOARD_SIZE && c.y < BOARD_SIZE
  );
}

/** `length` cells starting at `origin`, going right (h) or down (v). */
export function line(origin: Cell, dir: Dir, length: number): Cell[] {
  return Array.from({ length }, (_, i) =>
    dir === 'h' ? { x: origin.x + i, y: origin.y } : { x: origin.x, y: origin.y + i },
  );
}

/** Square of cells around `center`, clipped to the board. */
export function area(center: Cell, radius: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      if (inBounds({ x, y })) cells.push({ x, y });
    }
  }
  return cells;
}

export function row(y: number, from: 'left' | 'right'): Cell[] {
  const cells = Array.from({ length: BOARD_SIZE }, (_, x) => ({ x, y }));
  return from === 'left' ? cells : cells.reverse();
}
