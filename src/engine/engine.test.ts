import { describe, expect, it } from 'vitest';
import {
  applyTurn, canUseAbility, commitFleet, newGame, newSalt, randomFleet, resolveAction, seededRng,
  validateAction, validateFleet, verifyDefender, SHIPS, SHIP_TYPES,
  type Action, type Fleet, type GameState, type PlayerId,
} from './index';

// Ships along the left of rows 0, 2, 4, a vertical sub at x=5, a vertical destroyer at x=9.
const FLEET: Fleet = [
  { type: 'carrier', origin: { x: 0, y: 0 }, dir: 'h' },
  { type: 'battleship', origin: { x: 0, y: 2 }, dir: 'h' },
  { type: 'cruiser', origin: { x: 0, y: 4 }, dir: 'h' },
  { type: 'submarine', origin: { x: 5, y: 6 }, dir: 'v' },
  { type: 'destroyer', origin: { x: 9, y: 0 }, dir: 'v' },
];

/** Plays an action against FLEET-vs-FLEET locally, as both peers would. */
function play(state: GameState, action: Action, fleets: [Fleet, Fleet] = [FLEET, FLEET]): GameState {
  const defender = (1 - state.turn) as PlayerId;
  const outcome = resolveAction(fleets[defender], state.players[defender].marks, action, seededRng(1));
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
    const fromRight = resolveAction(FLEET, {}, { type: 'torpedo', row: 4, from: 'right' });
    expect(fromRight.hits).toEqual([{ x: 2, y: 4 }]);
    expect(fromRight.misses).toHaveLength(7);
    const empty = resolveAction(FLEET, {}, { type: 'torpedo', row: 9, from: 'left' });
    expect(empty.misses).toHaveLength(10);
  });

  it('radar counts ship cells in a 3x3 area without marking anything', () => {
    const out = resolveAction(FLEET, {}, { type: 'radar', center: { x: 1, y: 1 } });
    expect(out).toEqual({ hits: [], misses: [], sunk: [], radarCount: 6 });
  });

  it('scout reveals an unhit ship cell', () => {
    const marks = { '9,0': 'hit' } as const;
    for (let seed = 0; seed < 20; seed++) {
      const { scouted } = resolveAction(FLEET, marks, { type: 'scout' }, seededRng(seed));
      expect(scouted).toBeDefined();
      expect(scouted).not.toEqual({ x: 9, y: 0 });
    }
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
    expect(canUseAbility(s, 0, 'scout')).toBe(false);
    expect(validateAction(s, { type: 'scout' })).toMatch(/not ready/);
  });

  it('declares a winner when the whole fleet is sunk, then stops', () => {
    const cells = FLEET.flatMap((ship) =>
      Array.from({ length: SHIPS[ship.type].length }, (_, i) =>
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
    s = play(s, { type: 'scout' });
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

  it('catches a fake scout report', async () => {
    const { salt, commitment, log } = await honestGame();
    log[4] = { ...log[4]!, outcome: { hits: [], misses: [], sunk: [], scouted: { x: 8, y: 8 } } };
    expect(await verifyDefender(log, 1, FLEET, salt, commitment)).toMatch(/scout/);
  });

  it('catches a swapped fleet', async () => {
    const { salt, commitment, log } = await honestGame();
    expect(await verifyDefender(log, 1, randomFleet(seededRng(3)), salt, commitment)).toMatch(/commitment/);
  });
});
