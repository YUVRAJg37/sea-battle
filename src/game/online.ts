import type { PlayerId } from '../engine';
import { ConnectionLost, Inbox, type Channel } from '../net/channel';
import { PROTOCOL_VERSION } from '../net/protocol';
import { ME, THEM } from './match';
import { RemoteOpponent } from './remoteOpponent';

export type Role = 'host' | 'guest';

/** An open connection to another player, after both sides agreed on the protocol. */
export interface Session {
  role: Role;
  channel: Channel;
  inbox: Inbox;
  opponent: RemoteOpponent;
}

export async function handshake(channel: Channel, role: Role): Promise<Session> {
  const inbox = new Inbox(channel);
  channel.send({ type: 'hello', version: PROTOCOL_VERSION });
  const { version } = await inbox.next('hello');
  if (version !== PROTOCOL_VERSION) {
    channel.close();
    throw new ConnectionLost('your opponent is on a different version of the game');
  }
  return { role, channel, inbox, opponent: new RemoteOpponent(channel, inbox) };
}

/**
 * Announces our fleet is placed and waits for theirs. Both seeds together pick who fires first,
 * so neither side decides alone.
 */
export async function agreeFirst(session: Session, seed = randomSeed()): Promise<PlayerId> {
  session.channel.send({ type: 'ready', seed });
  const theirs = (await session.inbox.next('ready')).seed;
  const hostFirst = ((seed ^ theirs) & 1) === 0;
  return (session.role === 'host') === hostFirst ? ME : THEM;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1;
