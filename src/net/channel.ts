import { parseMessage, type Message, type MessageType } from './protocol';

/** A reliable, ordered pipe to the other player: a WebRTC data channel, or an in-memory pair in tests. */
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

/**
 * Queues validated messages from the peer and hands them out by type. A malformed message
 * closes the channel: a well-behaved client never sends one.
 */
export class Inbox {
  private readonly queue: Message[] = [];
  private readonly waiters: { type: MessageType; resolve: (m: Message) => void; reject: (e: Error) => void }[] = [];
  private closed: Error | null = null;

  constructor(private readonly channel: Channel) {
    channel.onMessage((raw) => {
      const message = parseMessage(raw);
      if (!message) return this.fail(new ConnectionLost('received a malformed message'), true);
      const i = this.waiters.findIndex((w) => w.type === message.type);
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(message);
      else this.queue.push(message);
    });
    channel.onClose(() => this.fail(new ConnectionLost()));
  }

  /** Resolves with the next message of this type; rejects with ConnectionLost if the channel closes first. */
  next<T extends MessageType>(type: T): Promise<Extract<Message, { type: T }>> {
    const i = this.queue.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0] as Extract<Message, { type: T }>);
    if (this.closed) return Promise.reject(this.closed);
    return new Promise((resolve, reject) => this.waiters.push({ type, resolve: resolve as (m: Message) => void, reject }));
  }

  private fail(error: Error, closeChannel = false): void {
    if (this.closed) return;
    this.closed = error;
    for (const w of this.waiters.splice(0)) w.reject(error);
    if (closeChannel) this.channel.close();
  }
}
