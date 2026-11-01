import { ConnectionLost, type Channel } from './channel';
import type { Message } from './protocol';
import type { Role } from '../game/online';

// Public STUN servers let two browsers find each other's addresses.
// shortcut: no TURN relay, so roughly 1 in 10 networks (strict NATs, some mobile carriers) can't connect; add Cloudflare TURN when that matters.
const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const CONNECT_TIMEOUT_MS = 20_000;

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1: easy to read out loud

/** Signaling server: set VITE_SIGNAL_URL for deployed builds; local dev uses `npm run dev` in server/. */
export const SIGNAL_URL: string =
  import.meta.env.VITE_SIGNAL_URL ?? (['localhost', '127.0.0.1'].includes(location.hostname) ? `ws://${location.hostname}:8787` : '');

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export function normalizeRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return code.length === 6 && [...code].every((c) => ROOM_ALPHABET.includes(c)) ? code : null;
}

type Signal =
  | { type: 'role'; role: Role }
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'sdp'; description: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

/**
 * Joins a room on the signaling server and opens a direct data channel to the other player.
 * The first to arrive is the host and makes the WebRTC offer. `onStatus` reports progress.
 */
export function connect(
  code: string,
  onStatus: (status: 'waiting' | 'connecting') => void,
  abort?: AbortSignal,
): Promise<{ channel: Channel; role: Role }> {
  return new Promise((resolve, reject) => {
    if (!SIGNAL_URL) return reject(new ConnectionLost('online play is not set up on this server yet'));

    const ws = new WebSocket(`${SIGNAL_URL}/room/${code}`);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const pendingIce: RTCIceCandidateInit[] = [];
    const closers: (() => void)[] = [];
    let role: Role | null = null;
    let connected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const signal = (s: Signal) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(s));
    const hangUp = () => {
      clearTimeout(timer);
      pc.close();
      ws.close();
    };
    const fail = (reason: string) => {
      if (connected) return;
      hangUp();
      reject(new ConnectionLost(reason));
    };
    let closed = false;
    const fireClose = () => {
      if (closed) return;
      closed = true;
      hangUp();
      closers.forEach((cb) => cb());
    };

    const open = (dc: RTCDataChannel) => {
      // The peer may speak before our listener is attached (it attaches after this promise resolves): buffer until then.
      const early: unknown[] = [];
      let deliver: ((raw: unknown) => void) | null = null;
      dc.onmessage = (e) => (deliver ? deliver(e.data) : early.push(e.data));
      dc.onopen = () => {
        connected = true;
        clearTimeout(timer);
        resolve({
          role: role!,
          channel: {
            send: (m: Message) => dc.readyState === 'open' && dc.send(JSON.stringify(m)),
            onMessage: (cb) => {
              deliver = cb;
              early.splice(0).forEach(cb);
            },
            onClose: (cb) => void closers.push(cb),
            close: fireClose,
          },
        });
      };
      dc.onclose = fireClose;
    };

    pc.onicecandidate = (e) => e.candidate && signal({ type: 'ice', candidate: e.candidate.toJSON() });
    pc.ondatachannel = (e) => open(e.channel);
    pc.onconnectionstatechange = () => pc.connectionState === 'failed' && (connected ? fireClose() : fail("couldn't connect directly to your opponent; their network may block it"));

    const flushIce = async () => {
      for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c);
    };

    ws.onmessage = async (e) => {
      let s: Signal;
      try {
        s = JSON.parse(e.data);
      } catch {
        return;
      }
      try {
        switch (s.type) {
          case 'role':
            role = s.role;
            onStatus(role === 'host' ? 'waiting' : 'connecting');
            break;
          case 'peer-joined':
            onStatus('connecting');
            timer = setTimeout(() => fail('connecting to your opponent took too long'), CONNECT_TIMEOUT_MS);
            if (role === 'host') {
              open(pc.createDataChannel('game', { ordered: true }));
              await pc.setLocalDescription(await pc.createOffer());
              signal({ type: 'sdp', description: pc.localDescription!.toJSON() });
            }
            break;
          case 'sdp':
            await pc.setRemoteDescription(s.description);
            if (s.description.type === 'offer') {
              await pc.setLocalDescription(await pc.createAnswer());
              signal({ type: 'sdp', description: pc.localDescription!.toJSON() });
            }
            await flushIce();
            break;
          case 'ice':
            // Candidates can arrive before the description they belong to.
            if (pc.remoteDescription) await pc.addIceCandidate(s.candidate);
            else pendingIce.push(s.candidate);
            break;
          case 'peer-left':
            if (connected) fireClose();
            else fail('your opponent left before the game started');
            break;
        }
      } catch {
        fail('the connection handshake failed');
      }
    };
    abort?.addEventListener('abort', () => fail('cancelled'));
    ws.onerror = () => fail("couldn't join the room: it may be full, or the game server is down");
    ws.onclose = () => fail('lost contact with the game server');
  });
}
