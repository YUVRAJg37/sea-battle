import type { Action, GameState, Outcome } from '../engine';
import type { Link } from '../net/link';
import type { Opponent } from './match';

/** The other player over the network. Their fleet stays on their device; they report outcomes. */
export class RemoteOpponent implements Opponent {
  constructor(private readonly link: Link) {}

  async resolve(_state: GameState, action: Action): Promise<Outcome> {
    this.link.send({ type: 'action', action });
    return (await this.link.next('outcome')).outcome;
  }

  async chooseAction(): Promise<Action> {
    return (await this.link.next('action')).action;
  }

  sendOutcome(outcome: Outcome): void {
    this.link.send({ type: 'outcome', outcome });
  }
}
