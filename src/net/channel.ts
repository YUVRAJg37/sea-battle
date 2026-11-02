import type { Message } from './protocol';

/**
 * A reliable, ordered pipe to the other player: a WebRTC data channel, or an in-memory pair in
 * tests. `onMessage` sets the single listener (replacing any earlier one).
 */
export interface Channel {
  send(message: Message): void;
  onMessage(cb: (raw: unknown) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

export class ConnectionLost extends Error {
  constructor(reason = 'connection lost') {
    super(reason);
  }
}

/** A wait that was abandoned on purpose (the round restarted); not an error to show anyone. */
export class Cancelled extends Error {}
