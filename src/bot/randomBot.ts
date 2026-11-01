import { allCells, key, randomFleet, resolveAction, type Rng } from '../engine';
import { ME, THEM, type Opponent } from '../game/match';

// shortcut: fires random shots and never uses abilities; replaced by the real AI in M3.
export function randomBot(rng: Rng = Math.random): Opponent {
  const fleet = randomFleet(rng);
  return {
    resolve: async (state, action) => resolveAction(fleet, state.players[THEM].marks, action, rng),
    chooseAction: async (state) => {
      const marks = state.players[ME].marks;
      const open = allCells().filter((c) => !(key(c) in marks));
      return { type: 'shot', target: open[Math.floor(rng() * open.length)]! };
    },
  };
}
