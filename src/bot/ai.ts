import {
  AIRSTRIKE_LENGTH, BOARD_SIZE, RADAR_RADIUS, allCells, area, canUseAbility, inBounds, line, opponent, randomFleet, resolveAction, row,
  type Ability, type Action, type Cell, type Dir, type GameState, type PlayerId, type Rng,
} from '../engine';
import { THEM, type Opponent } from '../game/match';
import { cellIndex, heatMap, knowledgeOf, knownShipCells } from './heatmap';

/** Computer opponent: hidden random fleet, heat-map targeting, uses abilities when ready. */
export function aiBot(rng: Rng = Math.random): Opponent {
  const fleet = randomFleet(rng);
  return {
    resolve: async (state, action) => resolveAction(fleet, state.players[THEM].marks, action, rng),
    chooseAction: async (state) => chooseAction(state, THEM, rng),
  };
}

/**
 * Picks the action for player `me`. Damage abilities fire whenever ready; information abilities
 * (torpedo, scout, radar) only while hunting, since once a ship is found the heat map already
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
    const y = maxBy([...Array(BOARD_SIZE).keys()], (y) => sum(row(y, 'left')));
    const half = BOARD_SIZE / 2;
    const left = sum(row(y, 'left').slice(0, half));
    return { type: 'torpedo', row: y, from: left >= sum(row(y, 'right').slice(0, half)) ? 'left' : 'right' };
  }
  if (hunting && ready('scout')) return { type: 'scout' };
  if (hunting && ready('radar')) return { type: 'radar', center: maxBy(allCells(), (c) => sum(area(c, RADAR_RADIUS))) };
  return { type: 'shot', target: ranked[0]! };
}

function maxBy<T>(items: T[], score: (item: T) => number): T {
  return items.reduce((best, item) => (score(item) > score(best) ? item : best));
}
