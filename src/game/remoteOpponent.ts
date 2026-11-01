import type { Action, GameState, Outcome } from '../engine';
import type { Channel, Inbox } from '../net/channel';
import type { Opponent } from './match';

/** The other player over the network. Their fleet stays on their device; they report outcomes. */
export class RemoteOpponent implements Opponent {
  constructor(private readonly channel: Channel, private readonly inbox: Inbox) {}

  async resolve(_state: GameState, action: Action): Promise<Outcome> {
    this.channel.send({ type: 'action', action });
    return (await this.inbox.next('outcome')).outcome;
  }

  async chooseAction(): Promise<Action> {
    return (await this.inbox.next('action')).action;
  }

  sendOutcome(outcome: Outcome): void {
    this.channel.send({ type: 'outcome', outcome });
  }
}
