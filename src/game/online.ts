import { commitFleet, commitSeed, newSalt, verifyDefender, type Fleet, type PlayerId, type TurnRecord } from '../engine';
import { ConnectionLost, type Channel } from '../net/channel';
import { Link, type LinkOptions } from '../net/link';
import { PROTOCOL_VERSION, parseMessage } from '../net/protocol';
import { ME, THEM } from './match';
import { RemoteOpponent } from './remoteOpponent';

export type Role = 'host' | 'guest';

const HELLO_TIMEOUT_MS = 10_000;
const REVEAL_TIMEOUT_MS = 10_000;

/** An open connection to another player, after both sides agreed on the protocol. */
export interface Session {
  role: Role;
  link: Link;
  opponent: RemoteOpponent;
}

/** What one side knows at the start of a round: who fires first, and what to check at the end. */
export interface Round {
  first: PlayerId;
  salt: string; // ours, revealed at the end
  theirCommitment: string;
}

export type FairPlay =
  | { status: 'verified'; fleet: Fleet }
  | { status: 'cheated'; fleet: Fleet; detail: string }
  | { status: 'unverified' }; // they left or never revealed

/** Checks both sides run the same protocol, then hands the channel to a reconnecting Link. */
export async function handshake(channel: Channel, role: Role, options: LinkOptions): Promise<Session> {
  const early: unknown[] = []; // anything the peer says right after hello belongs to the link
  const version = await new Promise<number>((resolve, reject) => {
    let heard: number | null = null;
    const timer = setTimeout(() => reject(new ConnectionLost('your opponent never answered')), HELLO_TIMEOUT_MS);
    channel.onMessage((raw) => {
      if (heard !== null) return void early.push(raw);
      const m = parseMessage(raw);
      if (m?.type !== 'hello') return;
      heard = m.version;
      clearTimeout(timer);
      resolve(m.version);
    });
    channel.onClose(() => (clearTimeout(timer), reject(new ConnectionLost())));
    channel.send({ type: 'hello', version: PROTOCOL_VERSION });
  });
  if (version !== PROTOCOL_VERSION) {
    channel.close();
    throw new ConnectionLost('your opponent is on a different version of the game');
  }
  const link = new Link(channel, options, early);
  return { role, link, opponent: new RemoteOpponent(link) };
}

/**
 * Locks in our fleet and agrees who fires first. Both sides commit to a fleet and a random seed,
 * then reveal the seeds; the seeds together pick the first player, so neither side decides alone.
 */
export async function startRound(session: Session, fleet: Fleet): Promise<Round> {
  const { link, role } = session;
  const salt = newSalt();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1;
  const seedSalt = newSalt();
  link.send({ type: 'ready', commitment: await commitFleet(fleet, salt), seedCommitment: await commitSeed(seed, seedSalt) });

  const theirs = await link.next('ready');
  link.send({ type: 'seed', seed, salt: seedSalt });
  const theirSeed = await link.next('seed');
  if ((await commitSeed(theirSeed.seed, theirSeed.salt)) !== theirs.seedCommitment) {
    link.close();
    throw new ConnectionLost("your opponent's coin toss didn't match what they committed to");
  }
  const hostFirst = ((seed ^ theirSeed.seed) & 1) === 0;
  return { first: (role === 'host') === hostFirst ? ME : THEM, salt, theirCommitment: theirs.commitment };
}

/** After the last shot: swap fleets and replay every report the opponent gave us. */
export async function checkFairPlay(session: Session, round: Round, log: TurnRecord[], fleet: Fleet): Promise<FairPlay> {
  session.link.send({ type: 'reveal', fleet, salt: round.salt });
  try {
    const reveal = await Promise.race([
      session.link.next('reveal'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new ConnectionLost()), REVEAL_TIMEOUT_MS)),
    ]);
    const problem = await verifyDefender(log, THEM, reveal.fleet, reveal.salt, round.theirCommitment);
    return problem ? { status: 'cheated', fleet: reveal.fleet, detail: problem } : { status: 'verified', fleet: reveal.fleet };
  } catch {
    return { status: 'unverified' };
  }
}
