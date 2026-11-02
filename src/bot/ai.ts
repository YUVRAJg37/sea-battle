import {
  AIRSTRIKE_LENGTH, BOARD_SIZE, RADAR_RADIUS, EDGES, allCells, area, canUseAbility, inBounds, key, lane, line, opponent, randomFleet, resolveAction, ricochetLanding,
  type Ability, type Action, type Cell, type Dir, type GameState, type PlayerId, type Rng,
} from '../engine';
import { THEM, type Opponent } from '../game/match';
import { cellIndex, heatMap, knowledgeOf, knownShipCells } from './heatmap';

/** Computer opponent: hidden random fleet, heat-map targeting, uses abilities when ready. */
export function aiBot(rng: Rng = Math.random): Opponent {
  const fleet = randomFleet(rng);
  return {
    resolve: async (state, action) => resolveAction(fleet, state.players[THEM].marks, action),
    chooseAction: async (state) => chooseAction(state, THEM, rng),
    revealFleet: () => fleet,
  };
}

/**
 * Picks the action for player `me`. Damage abilities fire whenever ready; information abilities
 * (torpedo, radar) only while hunting, since once a ship is found the heat map already
 * points at it.
 */
export function chooseAction(state: GameState, me: PlayerId, rng: Rng = Math.random): Action {
  const knowledge = knowledgeOf(state, opponent(me));
  // Tiny jitter so ties don't always resolve to the top-left.
  const heat = heatMap(knowledge).map((h) => (h > 0 ? h + rng() * 1e-3 : 0));
  const sum = (cells: Cell[]) => cells.reduce((total, c) => total + heat[cellIndex(c)]!, 0);
  const ranked = allCells().filter((c) => heat[cellIndex(c)]! > 0).sort((a, b) => sum([b]) - sum([a]));
  const ready = (a: Ability) => canUseAbility(state, me, a);
  const hunting = knownShipCells(knowledge).size === 0;

  if (ready('airstrike')) {
    const strikes = allCells().flatMap((origin) =>
      (['h', 'v'] as Dir[]).map((dir) => ({ origin, dir, cells: line(origin, dir, AIRSTRIKE_LENGTH) })),
    ).filter((s) => s.cells.every(inBounds));
    const best = maxBy(strikes, (s) => sum(s.cells));
    return { type: 'airstrike', origin: best.origin, dir: best.dir };
  }
  if (ready('salvo') && ranked.length >= 2) return { type: 'salvo', targets: [ranked[0]!, ranked[1]!] };
  if (hunting && ready('torpedo')) {
    // Busiest row or column; of its two ends, launch from the one with more heat near it.
    const lanes = [...Array(BOARD_SIZE).keys()].flatMap((i) => EDGES.map((from) => ({ lane: i, from, cells: lane(i, from) })));
    const best = maxBy(lanes, (l) => sum(l.cells) + 0.5 * sum(l.cells.slice(0, BOARD_SIZE / 2)));
    return { type: 'torpedo', lane: best.lane, from: best.from };
  }
  if (hunting && ready('radar')) return { type: 'radar', center: maxBy(allCells(), (c) => sum(area(c, RADAR_RADIUS))) };
  if (ready('ricochet') && ranked.length) {
    // A shot at a top cell, bouncing toward whichever landing cell is hottest.
    const marks = state.players[opponent(me)].marks;
    const options = ranked.slice(0, 5).flatMap((target) => EDGES.map((toward) => {
      const landing = ricochetLanding(target, toward, { ...marks, [key(target)]: 'miss' });
      return { target, toward, score: sum([target]) + (landing ? 0.5 * sum([landing]) : 0) };
    }));
    const best = maxBy(options, (o) => o.score);
    return { type: 'ricochet', target: best.target, toward: best.toward };
  }
  return { type: 'shot', target: ranked[0]! };
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best));
}
