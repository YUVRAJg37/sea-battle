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

export function allCells(): Cell[] {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => ({ x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) }));
}

/** A board edge a torpedo can launch from. */
export type Edge = 'left' | 'right' | 'top' | 'bottom';

export const EDGES: Edge[] = ['left', 'top', 'right', 'bottom'];

const STEP: Record<Edge, Cell> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/** The cell `n` steps from `c` toward an edge. */
export const toward = (c: Cell, edge: Edge, n = 1): Cell => ({ x: c.x + STEP[edge].x * n, y: c.y + STEP[edge].y * n });

/**
 * A full row (from left or right, `index` is y) or column (from top or bottom, `index` is x),
 * ordered from the launch edge across the board.
 */
export function lane(index: number, from: Edge): Cell[] {
  const horizontal = from === 'left' || from === 'right';
  const cells = Array.from({ length: BOARD_SIZE }, (_, i) => (horizontal ? { x: i, y: index } : { x: index, y: i }));
  return from === 'left' || from === 'top' ? cells : cells.reverse();
}
