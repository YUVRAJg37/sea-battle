import { describe, expect, it } from 'vitest';
import { randomFleet, seededRng, type Rng } from '../engine';
import { chooseAction } from '../bot/ai';
import { ConnectionLost, Inbox, type Channel } from '../net/channel';
import { parseMessage, type Message } from '../net/protocol';
import { ME, Match, THEM } from './match';
import { agreeFirst, handshake, type Session } from './online';

/** Two connected in-memory channels; delivery is async like a real network. */
function channelPair(): [Channel, Channel] {
  const listeners = [[], []] as ((raw: unknown) => void)[][];
  const closers = [[], []] as (() => void)[][];
  let open = true;
  const make = (me: 0 | 1): Channel => ({
    send: (m: Message) => {
      const raw = JSON.stringify(m);
      if (open) queueMicrotask(() => listeners[1 - me]!.forEach((cb) => cb(raw)));
    },
    onMessage: (cb) => void listeners[me]!.push(cb),
    onClose: (cb) => void closers[me]!.push(cb),
    close: () => {
      if (!open) return;
      open = false;
      queueMicrotask(() => closers.flat().forEach((cb) => cb()));
    },
  });
  return [make(0), make(1)];
}

/** Plays one side of a networked game with the AI picking our actions. */
async function playSide(session: Session, rng: Rng): Promise<Match> {
  const first = await agreeFirst(session, Math.floor(rng() * 2 ** 31));
  const match = new Match(randomFleet(rng), session.opponent, first);
  while (match.state.winner === null) {
    if (match.state.turn === ME) await match.play(chooseAction(match.state, ME, rng));
    else await match.opponentTurn();
  }
  return match;
}

describe('online play', () => {
  it('two peers play a full game and agree on everything', async () => {
    for (const seed of [1, 2]) {
      const [a, b] = channelPair();
      const [host, guest] = await Promise.all([handshake(a, 'host'), handshake(b, 'guest')]);
      const [hostMatch, guestMatch] = await Promise.all([playSide(host, seededRng(seed)), playSide(guest, seededRng(seed + 100))]);

      expect(hostMatch.state.log).toHaveLength(guestMatch.state.log.length);
      // Each side's view is the other's mirrored: my ME is their THEM.
      expect(hostMatch.state.winner === ME).toBe(guestMatch.state.winner === THEM);
      expect(hostMatch.state.players[THEM].marks).toEqual(guestMatch.state.players[ME].marks);
      expect(hostMatch.state.players[ME].sunk).toEqual(guestMatch.state.players[THEM].sunk);
    }
  });

  it('exactly one side fires first', async () => {
    const [a, b] = channelPair();
    const [host, guest] = await Promise.all([handshake(a, 'host'), handshake(b, 'guest')]);
    const [hostFirst, guestFirst] = await Promise.all([agreeFirst(host, 7), agreeFirst(guest, 12)]);
    expect(hostFirst).not.toBe(guestFirst);
  });

  it('rejects a peer on another protocol version', async () => {
    const [a, b] = channelPair();
    const host = handshake(a, 'host');
    b.send({ type: 'hello', version: 999 });
    await expect(host).rejects.toThrow(/different version/);
  });

  it('fails pending waits when the peer drops', async () => {
    const [a, b] = channelPair();
    const inbox = new Inbox(a);
    const waiting = inbox.next('action');
    b.close();
    await expect(waiting).rejects.toBeInstanceOf(ConnectionLost);
  });

  it('hangs up on malformed messages', async () => {
    const [a] = channelPair();
    let listener: (raw: unknown) => void = () => {};
    let closed = false;
    const inbox = new Inbox({ ...a, onMessage: (cb) => (listener = cb), close: () => (closed = true) });
    const waiting = inbox.next('action');
    listener(JSON.stringify({ type: 'action', action: { type: 'shot', target: { x: 42, y: 0 } } }));
    await expect(waiting).rejects.toThrow(/malformed/);
    expect(closed).toBe(true);
  });
});

describe('protocol parsing', () => {
  const ok = (m: unknown) => parseMessage(JSON.stringify(m));

  it('accepts well-formed messages', () => {
    expect(ok({ type: 'action', action: { type: 'salvo', targets: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } })).not.toBeNull();
    expect(ok({ type: 'outcome', outcome: { hits: [], misses: [{ x: 0, y: 0 }], sunk: [], radarCount: 2 } })).not.toBeNull();
  });

  it('rejects junk', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(42)).toBeNull();
    expect(ok({ type: 'nope' })).toBeNull();
    expect(ok({ type: 'action', action: { type: 'shot', target: { x: 1.5, y: 0 } } })).toBeNull();
    expect(ok({ type: 'action', action: { type: 'salvo', targets: [{ x: 1, y: 2 }] } })).toBeNull();
    expect(ok({ type: 'outcome', outcome: { hits: [], misses: [], sunk: [{ type: 'carrier', origin: { x: 8, y: 0 }, dir: 'h' }] } })).toBeNull();
    expect(parseMessage('x'.repeat(10_000))).toBeNull();
  });
});
