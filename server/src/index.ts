// Signaling for Sea Battle. Each room is a Durable Object holding at most two WebSockets. It only
// relays the WebRTC offer, answer and ICE candidates so the two browsers can connect directly;
// the game itself never passes through here. Hibernatable sockets keep idle rooms free.
import { DurableObject } from 'cloudflare:workers';

interface Env {
  ROOMS: DurableObjectNamespace<Room>;
}

const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/; // matches the client's room codes
const MAX_RELAY_BYTES = 16 * 1024; // SDP offers are a few KB

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/room\/([^/]+)$/);
    if (!match) return new Response('Sea Battle signaling', { status: 404 });
    const code = match[1]!.toUpperCase();
    if (!ROOM_CODE.test(code)) return new Response('bad room code', { status: 400 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};

export class Room extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 2) return new Response('room is full', { status: 409 });

    const { 0: client, 1: server } = new WebSocketPair();
    const role = sockets.length === 0 ? 'host' : 'guest';
    this.ctx.acceptWebSocket(server, [role]);
    server.send(JSON.stringify({ type: 'role', role }));
    if (role === 'guest') for (const ws of this.ctx.getWebSockets()) ws.send(JSON.stringify({ type: 'peer-joined' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(from: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || message.length > MAX_RELAY_BYTES) return;
    for (const ws of this.ctx.getWebSockets()) if (ws !== from) ws.send(message);
  }

  webSocketClose(from: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) if (ws !== from) ws.send(JSON.stringify({ type: 'peer-left' }));
  }
}
