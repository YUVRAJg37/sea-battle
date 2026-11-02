import {
  applyTurn, newGame, resolveAction, validateAction,
  type Action, type Fleet, type GameState, type Outcome, type PlayerId, type TurnRecord,
} from '../engine';

/** The local player is always 0 from this device's point of view. */
export const ME: PlayerId = 0;
export const THEM: PlayerId = 1;

/** The other side of a match: a bot or a remote player. Its fleet stays hidden. */
export interface Opponent {
  /** Resolve our action against their hidden fleet. */
  resolve(state: GameState, action: Action): Promise<Outcome>;
  /** Pick their next action. */
  chooseAction(state: GameState): Promise<Action>;
  /** Tell them what their action did to our fleet (remote players need this; bots don't). */
  sendOutcome?(outcome: Outcome): void;
  /** A bot's fleet, shown once the game is over (remote players reveal theirs over the network). */
  revealFleet?(): Fleet;
}

/** One match from this device's point of view: our fleet, the shared state, and the opponent. */
export class Match {
  state: GameState;

  constructor(readonly fleet: Fleet, readonly opponent: Opponent, first: PlayerId = ME) {
    this.state = newGame(first);
  }

  async play(action: Action): Promise<TurnRecord> {
    const error = validateAction(this.state, action);
    if (error) throw new Error(error);
    return this.commit(action, await this.opponent.resolve(this.state, action));
  }

  async opponentTurn(): Promise<TurnRecord> {
    const action = await this.opponent.chooseAction(this.state);
    const outcome = resolveAction(this.fleet, this.state.players[ME].marks, action);
    const record = this.commit(action, outcome); // throws on an illegal action, before we reply
    this.opponent.sendOutcome?.(outcome);
    return record;
  }

  private commit(action: Action, outcome: Outcome): TurnRecord {
    this.state = applyTurn(this.state, action, outcome);
    return this.state.log.at(-1)!;
  }
}
