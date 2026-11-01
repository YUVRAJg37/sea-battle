import { describe, expect, it } from 'vitest';
import { applyTurn, newGame, resolveAction, type Action, type Fleet, type GameState } from '../engine';
import { cellName, describeTurn } from './describe';
import { statsFor } from './stats';

const FLEET: Fleet = [
  { type: 'carrier', origin: { x: 0, y: 0 }, dir: 'h' },
  { type: 'battleship', origin: { x: 0, y: 2 }, dir: 'h' },
  { type: 'cruiser', origin: { x: 0, y: 4 }, dir: 'h' },
  { type: 'submarine', origin: { x: 5, y: 6 }, dir: 'v' },
  { type: 'destroyer', origin: { x: 9, y: 0 }, dir: 'v' },
];

const play = (s: GameState, a: Action) => applyTurn(s, a, resolveAction(FLEET, s.players[s.turn === 0 ? 1 : 0].marks, a));

describe('stats', () => {
  it('counts every cell an ability fired at', () => {
    let s = newGame();
    s = play(s, { type: 'airstrike', origin: { x: 3, y: 0 }, dir: 'h' }); // 2 hits, 1 miss
    s = play(s, { type: 'shot', target: { x: 9, y: 9 } });
    s = play(s, { type: 'radar', center: { x: 5, y: 5 } }); // fires at nothing
    expect(statsFor(s, 0)).toEqual({ turns: 2, shots: 3, hits: 2, accuracy: 67, abilities: 2, shipsLost: 0 });
    expect(statsFor(s, 1)).toEqual({ turns: 1, shots: 1, hits: 0, accuracy: 0, abilities: 0, shipsLost: 0 });
  });
});

describe('describe', () => {
  it('names cells like the board labels', () => {
    expect(cellName({ x: 0, y: 0 })).toBe('A1');
    expect(cellName({ x: 9, y: 9 })).toBe('J10');
  });

  it('reports hits and sinkings', () => {
    const s = play(newGame(), { type: 'shot', target: { x: 9, y: 0 } });
    expect(describeTurn(s.log[0]!, true)).toBe('You fired at J1: hit');
    const sunk = play(play(s, { type: 'shot', target: { x: 0, y: 9 } }), { type: 'shot', target: { x: 9, y: 1 } });
    expect(describeTurn(sunk.log[2]!, true)).toBe('You fired at J2: hit, sunk the destroyer!');
  });
});
