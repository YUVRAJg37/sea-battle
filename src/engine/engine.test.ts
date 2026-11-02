import { describe, expect, it } from 'vitest';
import {
  applyTurn, canUseAbility, commitFleet, newGame, newSalt, randomFleet, resolveAction, seededRng,
  pieceLength, validateAction, validateFleet, verifyDefender, SHIPS, SHIP_TYPES,
  type Action, type Edge, type Fleet, type GameState, type PlayerId,
} from './index';

// Ships along the left of rows 0, 2, 4, a vertical sub at x=5, a vertical destroyer at x=9, mines at (8, 7) and (7, 2).
const FLEET: Fleet = [
  { type: 'carrier', origin: { x: 0, y: 0 }, dir: 'h' },
  { type: 'battleship', origin: { x: 0, y: 2 }, dir: 'h' },
  { type: 'cruiser', origin: { x: 0, y: 4 }, dir: 'h' },
  { type: 'submarine', origin: { x: 5, y: 6 }, dir: 'v' },
  { type: 'destroyer', origin: { x: 9, y: 0 }, dir: 'v' },
  { type: 'mine', origin: { x: 8, y: 7 }, dir: 'h' },
  { type: 'mine', origin: { x: 7, y: 2 }, dir: 'h' },
];

/** Plays an action against FLEET-vs-FLEET locally, as both peers would. */
function play(state: GameState, action: Action, fleets: [Fleet, Fleet] = [FLEET, FLEET]): GameState {
  const defender = (1 - state.turn) as PlayerId;
  const outcome = resolveAction(fleets[defender], state.players[defender].marks, action);
  return applyTurn(state, action, outcome);
}

const shot = (x: number, y: number): Action => ({ type: 'shot', target: { x, y } });

describe('fleet', () => {
  it('accepts a valid fleet', () => {
    expect(validateFleet(FLEET)).toBeNull();
  });

  it('rejects overlap, off-board, missing and duplicate ships', () => {
    const overlap = FLEET.map((s) => (s.type === 'destroyer' ? { ...s, origin: { x: 0, y: 0 } } : s));
    const offBoard = FLEET.map((s) => (s.type === 'carrier' ? { ...s, origin: { x: 7, y: 9 } } : s));
    expect(validateFleet(overlap)).toMatch(/overlaps/);
    expect(validateFleet(offBoard)).toMatch(/off the board/);
    expect(validateFleet(FLEET.slice(1))).toMatch(/number/);
    expect(validateFleet([...FLEET.slice(1), FLEET[1]!])).toMatch(/exactly one carrier/);
    expect(validateFleet(FLEET.filter((s) => s.type !== 'mine'))).toMatch(/number/);
    expect(validateFleet([...FLEET.slice(0, -1), FLEET[0]!])).toMatch(/exactly one carrier/);
    expect(validateFleet([...FLEET.slice(0, -1), { type: 'mine', origin: { x: 8, y: 7 }, dir: 'h' }])).toMatch(/overlaps/);
  });

  it('randomFleet is always valid', () => {
    for (let seed = 0; seed < 200; seed++) expect(validateFleet(randomFleet(seededRng(seed)))).toBeNull();
  });
});

describe('actions', () => {
  it('shot hits, misses and sinks', () => {
    expect(resolveAction(FLEET, {}, shot(0, 0))).toEqual({ hits: [{ x: 0, y: 0 }], misses: [], sunk: [] });
    expect(resolveAction(FLEET, {}, shot(5, 5))).toEqual({ hits: [], misses: [{ x: 5, y: 5 }], sunk: [] });
    expect(resolveAction(FLEET, { '9,0': 'hit' }, shot(9, 1)).sunk).toEqual([FLEET[4]]);
  });

  it('airstrike hits 3 cells in a line, skipping cells already shot', () => {
    const out = resolveAction(FLEET, { '3,0': 'hit' }, { type: 'airstrike', origin: { x: 3, y: 0 }, dir: 'h' });
    expect(out.hits).toEqual([{ x: 4, y: 0 }]);
    expect(out.misses).toEqual([{ x: 5, y: 0 }]);
  });

  it('torpedo stops at the first unhit ship cell', () => {
    const fromRight = resolveAction(FLEET, {}, { type: 'torpedo', lane: 4, from: 'right' });
    expect(fromRight.hits).toEqual([{ x: 2, y: 4 }]);
    expect(fromRight.misses).toHaveLength(7);
    const empty = resolveAction(FLEET, {}, { type: 'torpedo', lane: 9, from: 'left' });
    expect(empty.misses).toHaveLength(10);
  });

  it('torpedo runs down and up columns', () => {
    // Column x=5 holds the submarine at rows 6–8.
    const down = resolveAction(FLEET, {}, { type: 'torpedo', lane: 5, from: 'top' });
    expect(down.hits).toEqual([{ x: 5, y: 6 }]);
    expect(down.misses).toHaveLength(6); // rows 0–5 are clear (the carrier ends at x=4)
    const up = resolveAction(FLEET, {}, { type: 'torpedo', lane: 5, from: 'bottom' });
    expect(up.hits).toEqual([{ x: 5, y: 8 }]);
    expect(up.misses).toEqual([{ x: 5, y: 9 }]);
  });

  it('radar counts ship cells in a 3x3 area without marking anything', () => {
    const out = resolveAction(FLEET, {}, { type: 'radar', center: { x: 1, y: 1 } });
    expect(out).toEqual({ hits: [], misses: [], sunk: [], radarCount: 6 });
  });

  it('ricochet stops on a hit and bounces two cells on after a miss', () => {
    const ricochet = (x: number, y: number, toward: Edge): Action =>
      ({ type: 'ricochet', target: { x, y }, toward });
    expect(resolveAction(FLEET, {}, ricochet(0, 0, 'right'))).toEqual({ hits: [{ x: 0, y: 0 }], misses: [], sunk: [] });
    expect(resolveAction(FLEET, {}, ricochet(2, 1, 'top')).misses).toEqual([{ x: 2, y: 1 }]); // (2,-1) is off the board
    const bounce = resolveAction(FLEET, {}, ricochet(3, 6, 'right')); // miss at D7, lands on F7 where the sub is
    expect(bounce.misses).toEqual([{ x: 3, y: 6 }]);
    expect(bounce.hits).toEqual([{ x: 5, y: 6 }]);
    // Cells already shot are skipped over: (5,6) is taken, so it slides on to (6,6).
    const slide = resolveAction(FLEET, { '5,6': 'hit' }, ricochet(3, 6, 'right'));
    expect(slide.misses).toEqual([{ x: 3, y: 6 }, { x: 6, y: 6 }]);
  });

  it('the mine reports a hit, never sinks, blocks torpedoes and hides from radar', () => {
    const hit = resolveAction(FLEET, {}, shot(8, 7));
    expect(hit).toEqual({ hits: [{ x: 8, y: 7 }], misses: [], sunk: [] });
    expect(resolveAction(FLEET, {}, { type: 'torpedo', lane: 7, from: 'right' }).hits).toEqual([{ x: 8, y: 7 }]);
    expect(resolveAction(FLEET, {}, { type: 'radar', center: { x: 8, y: 7 } }).radarCount).toBe(0);
  });
});

describe('game', () => {
  it('alternates turns and rejects repeat shots', () => {
    let s = play(newGame(), shot(5, 5));
    expect(s.turn).toBe(1);
    s = play(s, shot(0, 0));
    expect(validateAction(s, shot(5, 5))).toMatch(/already shot/);
    expect(() => play(s, shot(5, 5))).toThrow();
    expect(validateAction(s, shot(10, 0))).toMatch(/off the board/);
  });

  it('puts an ability on cooldown for exactly its cooldown turns', () => {
    let s = play(newGame(), { type: 'radar', center: { x: 5, y: 5 } });
    const wait = SHIPS.cruiser.cooldown;
    for (let i = 0; i < wait; i++) {
      expect(canUseAbility(s, 0, 'radar')).toBe(false);
      s = play(s, shot(i, 9)); // player 1
      s = play(s, shot(i, 9)); // player 0
    }
    expect(canUseAbility(s, 0, 'radar')).toBe(true);
  });

  it('loses an ability when its ship is sunk', () => {
    let s = newGame(1);
    s = play(s, shot(9, 0)); // p1 hits p0's destroyer
    s = play(s, shot(5, 5));
    s = play(s, shot(9, 1)); // sinks it
    expect(s.players[0].sunk.map((x) => x.type)).toEqual(['destroyer']);
    expect(canUseAbility(s, 0, 'ricochet')).toBe(false);
    expect(validateAction(s, { type: 'ricochet', target: { x: 5, y: 5 }, toward: 'left' })).toMatch(/not ready/);
  });

  it('declares a winner when the whole fleet is sunk, then stops', () => {
    const cells = FLEET.filter((ship) => ship.type !== 'mine').flatMap((ship) =>
      Array.from({ length: pieceLength(ship.type) }, (_, i) =>
        ship.dir === 'h' ? shot(ship.origin.x + i, ship.origin.y) : shot(ship.origin.x, ship.origin.y + i),
      ),
    );
    let s = newGame();
    cells.forEach((a, i) => {
      s = play(s, a); // p0 hits
      if (i < cells.length - 1) s = play(s, shot(i % 10, 9 - Math.floor(i / 10))); // p1 misses-ish
    });
    expect(s.winner).toBe(0);
    expect(s.players[1].sunk).toHaveLength(SHIP_TYPES.length);
    expect(validateAction(s, shot(5, 5))).toMatch(/over/);
  });
});

describe('commit and verify', () => {
  async function honestGame() {
    const salt = newSalt();
    const commitment = await commitFleet(FLEET, salt);
    let s = newGame();
    s = play(s, shot(0, 0));
    s = play(s, shot(1, 1));
    s = play(s, { type: 'radar', center: { x: 1, y: 1 } });
    s = play(s, shot(2, 2));
    s = play(s, { type: 'ricochet', target: { x: 2, y: 6 }, toward: 'right' });
    s = play(s, shot(3, 3));
    s = play(s, shot(8, 7)); // the mine
    return { salt, commitment, log: s.log };
  }

  it('passes an honest defender', async () => {
    const { salt, commitment, log } = await honestGame();
    expect(await verifyDefender(log, 1, FLEET, salt, commitment)).toBeNull();
  });

  it('accepts the fleet in any order', async () => {
    const { salt, commitment, log } = await honestGame();
    expect(await verifyDefender(log, 1, [...FLEET].reverse(), salt, commitment)).toBeNull();
  });

  it('catches a lie about a hit', async () => {
    const { salt, commitment, log } = await honestGame();
    log[0] = { ...log[0]!, outcome: { hits: [], misses: [{ x: 0, y: 0 }], sunk: [] } };
    expect(await verifyDefender(log, 1, FLEET, salt, commitment)).toMatch(/turn 1/);
  });

  it('catches a lie about radar', async () => {
    const { salt, commitment, log } = await honestGame();
    log[2] = { ...log[2]!, outcome: { ...log[2]!.outcome, radarCount: 0 } };
    expect(await verifyDefender(log, 1, FLEET, salt, commitment)).toMatch(/turn 3/);
  });

  it('catches a lie about a ricochet', async () => {
    const { salt, commitment, log } = await honestGame();
    log[4] = { ...log[4]!, outcome: { hits: [], misses: [{ x: 2, y: 6 }], sunk: [] } };
    expect(await verifyDefender(log, 1, FLEET, salt, commitment)).toMatch(/turn 5/);
  });

  it('catches a lie about the mine', async () => {
    const { salt, commitment, log } = await honestGame();
    log[6] = { ...log[6]!, outcome: { hits: [], misses: [{ x: 8, y: 7 }], sunk: [] } };
    expect(await verifyDefender(log, 1, FLEET, salt, commitment)).toMatch(/turn 7/);
  });

  it('catches a swapped fleet', async () => {
    const { salt, commitment, log } = await honestGame();
    expect(await verifyDefender(log, 1, randomFleet(seededRng(3)), salt, commitment)).toMatch(/commitment/);
  });
});
