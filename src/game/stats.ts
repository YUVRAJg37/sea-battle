import type { GameState, PlayerId } from '../engine';

export interface PlayerStats {
  turns: number;
  shots: number; // cells fired at, including ability shots
  hits: number;
  accuracy: number; // whole percent
  abilities: number;
  shipsLost: number;
}

export function statsFor(state: GameState, player: PlayerId): PlayerStats {
  const turns = state.log.filter((r) => r.attacker === player);
  const hits = turns.reduce((n, r) => n + r.outcome.hits.length, 0);
  const shots = hits + turns.reduce((n, r) => n + r.outcome.misses.length, 0);
  return {
    turns: turns.length,
    shots,
    hits,
    accuracy: shots ? Math.round((100 * hits) / shots) : 0,
    abilities: turns.filter((r) => r.action.type !== 'shot').length,
    shipsLost: state.players[player].sunk.length,
  };
}
