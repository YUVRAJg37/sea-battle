import { BOARD_SIZE, SHIPS, SHIP_TYPES, shipForAbility, AIRSTRIKE_LENGTH, type Ability, type ShipType } from './config';
import { EDGES, inBounds, key, line, sameCell, type Cell, type Marks } from './grid';
import type { Ship } from './fleet';
import type { Action, Outcome } from './actions';
import { applyOutcome } from './resolve';

export type PlayerId = 0 | 1;

/** Public state of one player, known to both sides. */
export interface PlayerState {
  marks: Marks; // shots received on this player's board
  sunk: Ship[]; // this player's lost ships
  cooldowns: Record<ShipType, number>; // turns until each ship's ability is ready
}

export interface TurnRecord {
  attacker: PlayerId;
  action: Action;
  outcome: Outcome;
}

/** Plain JSON so it can be sent over the network as-is. */
export interface GameState {
  turn: PlayerId;
  players: [PlayerState, PlayerState];
  winner: PlayerId | null;
  log: TurnRecord[];
}

export const opponent = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function newGame(first: PlayerId = 0): GameState {
  const player = (): PlayerState => ({
    marks: {},
    sunk: [],
    cooldowns: Object.fromEntries(SHIP_TYPES.map((t) => [t, 0])) as Record<ShipType, number>,
  });
  return { turn: first, players: [player(), player()], winner: null, log: [] };
}

export function canUseAbility(state: GameState, player: PlayerId, ability: Ability): boolean {
  const ship = shipForAbility(ability);
  const { sunk, cooldowns } = state.players[player];
  return cooldowns[ship] === 0 && !sunk.some((s) => s.type === ship);
}

/** Returns why the current player can't take this action, or null if they can. */
export function validateAction(state: GameState, action: Action): string | null {
  if (state.winner !== null) return 'game is over';
  if (action.type !== 'shot' && !canUseAbility(state, state.turn, action.type)) return `${action.type} is not ready`;

  const marks = state.players[opponent(state.turn)].marks;
  const unshot = (c: Cell) => inBounds(c) && !(key(c) in marks);

  // Assumes the action is well-formed; actions from the network are shape-checked in net/protocol.ts first.
  switch (action.type) {
    case 'shot':
      return unshot(action.target) ? null : 'target is off the board or already shot';
    case 'salvo': {
      const [a, b] = action.targets;
      return unshot(a) && unshot(b) && !sameCell(a, b) ? null : 'salvo needs two different unshot cells';
    }
    case 'airstrike':
      return (action.dir === 'h' || action.dir === 'v') && line(action.origin, action.dir, AIRSTRIKE_LENGTH).every(inBounds)
        ? null
        : 'airstrike must fit on the board';
    case 'radar':
      return inBounds(action.center) ? null : 'radar center is off the board';
    case 'torpedo':
      return Number.isInteger(action.lane) && action.lane >= 0 && action.lane < BOARD_SIZE && EDGES.includes(action.from)
        ? null
        : 'invalid torpedo lane';
    case 'ricochet':
      return unshot(action.target) && EDGES.includes(action.toward) ? null : 'ricochet target is off the board or already shot';
    default:
      return 'unknown action';
  }
}

/** Applies a validated action and the defender's reported outcome. Pure: returns a new state. */
export function applyTurn(state: GameState, action: Action, outcome: Outcome): GameState {
  const error = validateAction(state, action);
  if (error) throw new Error(error);

  const attacker = state.turn;
  const defender = opponent(attacker);
  const atk = state.players[attacker];
  const def = state.players[defender];

  const cooldowns = { ...atk.cooldowns };
  for (const t of SHIP_TYPES) cooldowns[t] = Math.max(0, cooldowns[t] - 1);
  if (action.type !== 'shot') {
    const ship = shipForAbility(action.type);
    cooldowns[ship] = SHIPS[ship].cooldown;
  }

  const sunk = [...def.sunk, ...outcome.sunk];
  const players = [...state.players] as GameState['players'];
  players[attacker] = { ...atk, cooldowns };
  players[defender] = { ...def, marks: applyOutcome(def.marks, outcome), sunk };

  return {
    turn: defender,
    players,
    winner: sunk.length === SHIP_TYPES.length ? attacker : null,
    log: [...state.log, { attacker, action, outcome }],
  };
}
