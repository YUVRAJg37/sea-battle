import { describe, expect, it } from 'vitest';
import { allCells, key, randomFleet, seededRng, type Fleet, type Rng } from '../engine';
import { Match, ME, THEM } from '../game/match';
import { aiBot, chooseAction } from './ai';
import { cellIndex, heatMap, knownShipCells, type Knowledge } from './heatmap';

const blank = (): Knowledge => ({ marks: {}, sunk: [], radar: [] });
const hottest = (heat: number[]) => allCells().reduce((a, b) => (heat[cellIndex(b)]! > heat[cellIndex(a)]! ? b : a));

describe('heat map', () => {
  it('is zero on shot cells and on a radar area that found nothing', () => {
    const heat = heatMap({ ...blank(), marks: { '0,0': 'miss' }, radar: [{ center: { x: 5, y: 5 }, count: 0 }] });
    expect(heat[cellIndex({ x: 0, y: 0 })]).toBe(0);
    for (const c of [{ x: 4, y: 4 }, { x: 5, y: 5 }, { x: 6, y: 6 }]) expect(heat[cellIndex(c)]).toBe(0);
  });

  it('is hottest next to a live hit', () => {
    const c = hottest(heatMap({ ...blank(), marks: { '5,5': 'hit' } }));
    expect(Math.abs(c.x - 5) + Math.abs(c.y - 5)).toBe(1);
  });

  it('writes off a lone hit boxed in by misses as the mine', () => {
    const marks = { '5,5': 'hit', '4,5': 'miss', '6,5': 'miss', '5,4': 'miss', '5,6': 'miss' } as const;
    expect(knownShipCells({ ...blank(), marks }).size).toBe(0);
    expect(knownShipCells({ ...blank(), marks: { '5,5': 'hit', '4,5': 'miss' } }).size).toBe(1);
  });
});

/** Plays one full game; `pick` chooses our side's actions. Returns the finished match. */
async function playOut(rng: Rng, fleet: Fleet, pick: (m: Match) => Parameters<Match['play']>[0]) {
  const match = new Match(fleet, aiBot(rng));
  while (match.state.winner === null) {
    await match.play(pick(match)); // throws on any invalid action
    if (match.state.winner === null) await match.opponentTurn();
  }
  return match;
}

const randomShot = (rng: Rng) => (m: Match) => {
  const open = allCells().filter((c) => !(key(c) in m.state.players[THEM].marks));
  return { type: 'shot' as const, target: open[Math.floor(rng() * open.length)]! };
};

describe('ai', () => {
  it('only takes valid actions and uses every ability over AI-vs-AI games', async () => {
    const used = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const rng = seededRng(seed);
      const match = await playOut(rng, randomFleet(rng), (m) => chooseAction(m.state, ME, rng));
      for (const r of match.state.log) used.add(r.action.type);
    }
    expect([...used].sort()).toEqual(['airstrike', 'radar', 'ricochet', 'salvo', 'shot', 'torpedo']);
  });

  it('beats a random shooter nearly every time', async () => {
    let aiWins = 0;
    for (let seed = 0; seed < 20; seed++) {
      const rng = seededRng(100 + seed);
      const match = await playOut(rng, randomFleet(rng), randomShot(rng));
      if (match.state.winner === THEM) aiWins++;
    }
    expect(aiWins).toBeGreaterThanOrEqual(19);
  });
});
