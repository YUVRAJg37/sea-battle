// Signaling for Sea Battle. Each room holds at most two WebSockets and only relays the WebRTC
// offer, answer and ICE candidates so the two browsers can connect directly; the game itself
// never passes through here. Runs behind Caddy, which terminates HTTPS.
import { createServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';

const PORT = Number(process.env.PORT ?? 8790);
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/; // matches the client's room codes
const MAX_RELAY_BYTES = 16 * 1024; // SDP offers are a few KB
const MAX_ROOMS = 2000; // keeps memory bounded on a small VM
const HEARTBEAT_MS = 30_000; // drop silently dead sockets so their rooms free up

const rooms = new Map<string, WebSocket[]>();
const alive = new WeakSet<WebSocket>();

const send = (ws: WebSocket, message: object) => ws.send(JSON.stringify(message));

function refuse(socket: Duplex, status: number, reason: string) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
}

function join(code: string, ws: WebSocket) {
  const room = rooms.get(code) ?? [];
  if (room.length >= 2) return ws.close(1013, 'room is full'); // lost a race for the last seat
  rooms.set(code, room);
  room.push(ws);
  alive.add(ws);

  send(ws, { type: 'role', role: room.length === 1 ? 'host' : 'guest' });
  if (room.length === 2) for (const peer of room) send(peer, { type: 'peer-joined' });

  ws.on('pong', () => alive.add(ws));
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    for (const peer of room) if (peer !== ws) peer.send(data.toString());
  });
  ws.on('close', () => {
    room.splice(room.indexOf(ws), 1);
    for (const peer of room) send(peer, { type: 'peer-left' });
    if (room.length === 0) rooms.delete(code);
  });
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_RELAY_BYTES });
const http = createServer((_req, res) => res.writeHead(404).end('Sea Battle signaling'));

http.on('upgrade', (req, socket, head) => {
  const code = req.url?.match(/^\/room\/([^/?]+)$/)?.[1]?.toUpperCase();
  if (!code || !ROOM_CODE.test(code)) return refuse(socket, 400, 'Bad Request');
  if ((rooms.get(code)?.length ?? 0) >= 2) return refuse(socket, 409, 'Conflict');
  if (!rooms.has(code) && rooms.size >= MAX_ROOMS) return refuse(socket, 503, 'Service Unavailable');
  wss.handleUpgrade(req, socket, head, (ws) => join(code, ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) ws.terminate();
    else {
      alive.delete(ws);
      ws.ping();
    }
  }
}, HEARTBEAT_MS).unref();

http.listen(PORT, '127.0.0.1', () => console.log(`signaling on 127.0.0.1:${PORT}`));
