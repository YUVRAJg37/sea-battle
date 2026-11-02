import { describe, expect, it } from 'vitest';
import { randomFleet, seededRng, type Fleet, type Rng } from '../engine';
import { chooseAction } from '../bot/ai';
import { ConnectionLost, type Channel } from '../net/channel';
import { parseMessage, type Message } from '../net/protocol';
import { ME, Match, THEM } from './match';
import { checkFairPlay, handshake, startRound, type Role, type Session } from './online';

/**
 * Two connected in-memory channels with async delivery. Like a data channel, closing still
 * delivers what was already sent; anything sent after the close is lost.
 */
function channelPair(): [Channel, Channel] {
  const listeners: ((raw: unknown) => void)[] = [() => {}, () => {}];
  const closers = [[], []] as (() => void)[][];
  let open = true;
  const make = (me: 0 | 1): Channel => ({
    send: (m: Message) => {
      const raw = JSON.stringify(m);
      queueMicrotask(() => open && listeners[1 - me]!(raw));
    },
    onMessage: (cb) => void (listeners[me] = cb),
    onClose: (cb) => void closers[me]!.push(cb),
    close: () =>
      queueMicrotask(() => {
        if (!open) return;
        open = false;
        closers.flat().forEach((cb) => cb());
      }),
  });
  return [make(0), make(1)];
}

/**
 * Both sides' reconnect() calls meet here and get the two ends of a fresh pair, like two browsers
 * rejoining the same room. `cutAfter` closes each new pair after that many messages.
 */
function room(cutAfter: number[] = []) {
  let waiting: ((c: Channel) => void) | null = null;
  const cuts = [...cutAfter];
  const pair = (): [Channel, Channel] => {
    const [a, b] = channelPair();
    const limit = cuts.shift();
    if (limit === undefined) return [a, b];
    let sent = 0;
    const counting = (c: Channel): Channel => ({ ...c, send: (m) => (c.send(m), ++sent === limit && c.close()) });
    return [counting(a), counting(b)];
  };
  return {
    first: pair,
    reconnect: () => new Promise<Channel>((resolve) => {
      if (!waiting) return void (waiting = resolve);
      const [a, b] = pair();
      waiting(a);
      waiting = null;
      resolve(b);
    }),
  };
}

async function connectBoth(r: ReturnType<typeof room>): Promise<[Session, Session]> {
  const [a, b] = r.first();
  const options = { reconnect: r.reconnect, graceMs: 5000 };
  return Promise.all([handshake(a, 'host', options), handshake(b, 'guest', options)]);
}

/** Plays one side with the AI. `answerWith` lets a cheater answer from a different fleet than it committed to. */
async function playSide(session: Session, rng: Rng, answerWith?: Fleet) {
  const fleet = randomFleet(rng);
  const round = await startRound(session, fleet);
  const match = new Match(answerWith ?? fleet, session.opponent, round.first);
  while (match.state.winner === null) {
    if (match.state.turn === ME) await match.play(chooseAction(match.state, ME, rng));
    else await match.opponentTurn();
  }
  return { match, fairPlay: await checkFairPlay(session, round, match.state.log, fleet) };
}

async function playGame(seed: number, cutAfter: number[] = [], cheat = false) {
  const [host, guest] = await connectBoth(room(cutAfter));
  return Promise.all([
    playSide(host, seededRng(seed)),
    playSide(guest, seededRng(seed + 100), cheat ? randomFleet(seededRng(999)) : undefined),
  ]);
}

function expectMirrored(a: Match, b: Match) {
  expect(a.state.log).toHaveLength(b.state.log.length);
  expect(a.state.winner === ME).toBe(b.state.winner === THEM);
  expect(a.state.players[THEM].marks).toEqual(b.state.players[ME].marks);
  expect(a.state.players[ME].sunk).toEqual(b.state.players[THEM].sunk);
}

describe('online play', () => {
  it('two honest peers play a full game, agree on everything and verify each other', async () => {
    const [host, guest] = await playGame(1);
    expectMirrored(host.match, guest.match);
    expect(host.fairPlay.status).toBe('verified');
    expect(guest.fairPlay.status).toBe('verified');
  });

  it('recovers from drops at many points in the game, resending lost shots and answers', { timeout: 60_000 }, async () => {
    // Cut the first connection after n messages: hits the coin toss, shots in flight and answers in flight.
    for (const n of [5, 6, 7, 8, 9, 12, 15, 20]) {
      const [host, guest] = await playGame(n, [n, 7]);
      expectMirrored(host.match, guest.match);
      expect(host.fairPlay.status).toBe('verified');
    }
  });

  it('catches a player who answers from a different fleet than they committed to', async () => {
    const [host] = await playGame(3, [], true);
    expect(host.fairPlay.status).toBe('cheated');
  });

  it('exactly one side fires first', async () => {
    for (const seed of [1, 2, 3, 4]) {
      const [host, guest] = await connectBoth(room());
      const [a, b] = await Promise.all([startRound(host, randomFleet(seededRng(seed))), startRound(guest, randomFleet(seededRng(seed + 9)))]);
      expect(a.first).not.toBe(b.first);
    }
  });

  it('rejects a peer on another protocol version', async () => {
    const [a, b] = channelPair();
    const host = handshake(a, 'host', { reconnect: () => new Promise(() => {}) });
    b.send({ type: 'hello', version: 999 });
    await expect(host).rejects.toThrow(/different version/);
  });

  it('ends at once when the peer leaves on purpose', async () => {
    const [host, guest] = await connectBoth(room());
    const waiting = host.link.next('action');
    guest.link.close();
    await expect(waiting).rejects.toThrow(/left/);
  });

  it('gives up after the grace period when the peer never comes back', async () => {
    const [a, b] = channelPair();
    const options = { reconnect: () => new Promise<Channel>(() => {}), graceMs: 300 }; // nobody ever rejoins
    const [host] = await Promise.all([handshake(a, 'host', options), handshake(b, 'guest', options)]);
    const waiting = host.link.next('action');
    b.close(); // the guest vanishes without saying goodbye
    await expect(waiting).rejects.toThrow(/did not come back/);
  });

  it('refuses a coin toss that does not match its commitment', async () => {
    const [a, b] = channelPair();
    const sessionOf = (c: Channel, role: Role) => handshake(c, role, { reconnect: () => new Promise(() => {}) });
    b.onMessage((raw) => {
      const m = parseMessage(raw);
      if (m?.type === 'hello') b.send({ type: 'hello', version: m.version });
      if (m?.type === 'ready') {
        b.send({ type: 'ready', commitment: 'a'.repeat(64), seedCommitment: 'b'.repeat(64) });
        b.send({ type: 'seed', seed: 1, salt: 'c'.repeat(32) });
      }
    });
    const host = await sessionOf(a, 'host');
    await expect(startRound(host, randomFleet(seededRng(1)))).rejects.toBeInstanceOf(ConnectionLost);
  });
});

describe('protocol parsing', () => {
  const ok = (m: unknown) => parseMessage(JSON.stringify(m));

  it('accepts well-formed messages', () => {
    expect(ok({ type: 'action', action: { type: 'salvo', targets: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } })).not.toBeNull();
    expect(ok({ type: 'outcome', outcome: { hits: [], misses: [{ x: 0, y: 0 }], sunk: [], radarCount: 2 } })).not.toBeNull();
    expect(ok({ type: 'chat', text: '  Nice shot!  ' })).toEqual({ type: 'chat', text: 'Nice shot!' });
  });

  it('rejects junk', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(42)).toBeNull();
    expect(ok({ type: 'nope' })).toBeNull();
    expect(ok({ type: 'action', action: { type: 'shot', target: { x: 1.5, y: 0 } } })).toBeNull();
    expect(ok({ type: 'action', action: { type: 'salvo', targets: [{ x: 1, y: 2 }] } })).toBeNull();
    expect(ok({ type: 'outcome', outcome: { hits: [], misses: [], sunk: [{ type: 'carrier', origin: { x: 8, y: 0 }, dir: 'h' }] } })).toBeNull();
    expect(ok({ type: 'ready', commitment: 'xyz', seedCommitment: 'a'.repeat(64) })).toBeNull();
    expect(ok({ type: 'chat', text: '   ' })).toBeNull();
    expect(ok({ type: 'reveal', fleet: [], salt: 'a'.repeat(32) })).toBeNull();
    expect(parseMessage('x'.repeat(10_000))).toBeNull();
  });

  it('caps chat length and strips control characters', () => {
    const m = ok({ type: 'chat', text: `hi\u0007there${'!'.repeat(500)}` });
    expect(m?.type === 'chat' && m.text.length).toBe(140);
    expect(m?.type === 'chat' && m.text.startsWith('hi there')).toBe(true);
  });
});
