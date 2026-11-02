import { describe, expect, it } from 'vitest';
import { aim } from './targeting';

describe('aim', () => {
  it('slides an airstrike back onto the board', () => {
    expect(aim('airstrike', { x: 9, y: 3 }, 'h').cells).toEqual([{ x: 7, y: 3 }, { x: 8, y: 3 }, { x: 9, y: 3 }]);
    expect(aim('airstrike', { x: 2, y: 9 }, 'v').action).toEqual({ type: 'airstrike', origin: { x: 2, y: 7 }, dir: 'v' });
  });

  it('needs two different cells for a salvo', () => {
    const a = { x: 1, y: 1 };
    expect(aim('salvo', a, 'h').action).toBeNull();
    expect(aim('salvo', a, 'h', a).action).toBeNull();
    expect(aim('salvo', { x: 2, y: 2 }, 'h', a).action).toEqual({ type: 'salvo', targets: [a, { x: 2, y: 2 }] });
  });

  it('launches a torpedo along the tapped row from the chosen side', () => {
    expect(aim('torpedo', { x: 7, y: 5 }, 'h').action).toEqual({ type: 'torpedo', row: 5, from: 'left' });
    const fromRight = aim('torpedo', { x: 2, y: 5 }, 'h', null, 'right');
    expect(fromRight.action).toEqual({ type: 'torpedo', row: 5, from: 'right' });
    expect(fromRight.cells[0]).toEqual({ x: 9, y: 5 }); // preview starts at the launch edge
  });

  it('clips radar to the board', () => {
    expect(aim('radar', { x: 0, y: 0 }, 'h').cells).toHaveLength(4);
  });
});

