import { Cancelled, ConnectionLost, type Channel } from './channel';
import { parseMessage, type Message, type MessageType } from './protocol';

export type LinkStatus = 'connected' | 'reconnecting';

export interface LinkOptions {
  /** Opens a fresh channel to the same room after a drop; should give up when `abort` fires. */
  reconnect: (abort: AbortSignal) => Promise<Channel>;
  /** How long to keep trying before giving up on the opponent. */
  graceMs?: number;
  onStatus?: (status: LinkStatus) => void;
}

type Of<T extends MessageType> = Extract<Message, { type: T }>;
type Waiter = { type: MessageType; resolve: (m: Message) => void; reject: (e: Error) => void };

const RETRY_MS = 1500;
const RESUME_TIMEOUT_MS = 8000;

/**
 * The connection to the other player for a whole room. Messages are validated and handed out by
 * type. If the channel drops, it reconnects through the same room for a grace period; pending
 * waits carry on. Every message we send is kept, and after a reconnect each side says how many it
 * received, so whatever was lost in the drop is sent again, exactly once.
 */
export class Link {
  private channel!: Channel;
  private generation = 0;
  private readonly queue: Message[] = [];
  private readonly waiters: Waiter[] = [];
  private readonly listeners = new Map<MessageType, (m: Message) => void>();
  private readonly outbox: Message[] = []; // everything we've sent, for resending after a drop
  private received = 0; // how many of the peer's messages we've taken in
  private closed: Error | null = null;
  private closeListeners: ((reason: Error) => void)[] = [];

  /** `early` holds raw messages that arrived on the channel before the link took it over. */
  constructor(channel: Channel, private readonly options: LinkOptions, early: unknown[] = []) {
    this.attach(channel, early);
  }

  send(message: Message): void {
    if (this.closed) return;
    this.outbox.push(message);
    this.channel.send(message);
  }

  /** Next message of this type. Survives reconnects; rejects once the link is closed for good. */
  next<T extends MessageType>(type: T): Promise<Of<T>> {
    const i = this.queue.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0] as Of<T>);
    if (this.closed) return Promise.reject(this.closed);
    return new Promise((resolve, reject) => this.waiters.push({ type, resolve: resolve as (m: Message) => void, reject }));
  }

  /** Delivers every message of this type to `cb` instead of queueing it (chat, rematch requests). */
  on<T extends MessageType>(type: T, cb: (m: Of<T>) => void): void {
    this.listeners.set(type, cb as (m: Message) => void);
  }

  onClose(cb: (reason: Error) => void): void {
    this.closeListeners.push(cb);
  }

  /** Abandons pending waits and queued messages, for when both sides restart a round. */
  reset(): void {
    this.queue.length = 0;
    for (const w of this.waiters.splice(0)) w.reject(new Cancelled());
  }

  /** Leave on purpose: tell the peer so it doesn't wait for us to come back. */
  close(): void {
    if (this.closed) return;
    this.channel.send({ type: 'bye' });
    this.fail(new ConnectionLost('you left'));
  }

  private attach(channel: Channel, early: unknown[] = []): void {
    const generation = ++this.generation;
    this.channel = channel;
    channel.onMessage((raw) => generation === this.generation && this.receive(raw));
    channel.onClose(() => generation === this.generation && !this.closed && void this.recover());
    for (const raw of early) this.receive(raw);
  }

  private receive(raw: unknown): void {
    const message = parseMessage(raw);
    if (!message) return this.fail(new ConnectionLost('your opponent sent something invalid'));
    if (message.type === 'bye') return this.fail(new ConnectionLost('your opponent left'));
    if (message.type === 'resume') return; // only meaningful during a reconnect
    this.received++;
    const listener = this.listeners.get(message.type);
    if (listener) return listener(message);
    const i = this.waiters.findIndex((w) => w.type === message.type);
    if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(message);
    else this.queue.push(message);
  }

  private async recover(): Promise<void> {
    this.options.onStatus?.('reconnecting');
    const deadline = Date.now() + (this.options.graceMs ?? 60_000);
    while (!this.closed && Date.now() < deadline) {
      // Each attempt is cut off at the deadline: if they never come back, nobody joins the room.
      const attempt = new AbortController();
      const timer = setTimeout(() => attempt.abort(), deadline - Date.now());
      try {
        const channel = await Promise.race([
          this.options.reconnect(attempt.signal),
          new Promise<never>((_, reject) => attempt.signal.addEventListener('abort', () => reject(new ConnectionLost()))),
        ]);
        const { received: theyGot, early } = await this.resume(channel);
        if (this.closed) return channel.close();
        this.attach(channel, early);
        for (const message of this.outbox.slice(theyGot)) channel.send(message);
        this.options.onStatus?.('connected');
        return;
      } catch {
        if (Date.now() < deadline) await new Promise((r) => setTimeout(r, RETRY_MS));
      } finally {
        clearTimeout(timer);
      }
    }
    this.fail(new ConnectionLost('your opponent lost connection and did not come back'));
  }

  /** Swaps received-message counts on a fresh channel before handing it the game. */
  private resume(channel: Channel): Promise<{ received: number; early: unknown[] }> {
    return new Promise((resolve, reject) => {
      const early: unknown[] = []; // their resent messages can land right behind their resume
      let received: number | null = null;
      const timer = setTimeout(() => (channel.close(), reject(new ConnectionLost('resume timed out'))), RESUME_TIMEOUT_MS);
      channel.onMessage((raw) => {
        if (received !== null) return void early.push(raw);
        const m = parseMessage(raw);
        if (m?.type !== 'resume') return;
        clearTimeout(timer);
        received = m.received;
        resolve({ received, early });
      });
      channel.onClose(() => (clearTimeout(timer), reject(new ConnectionLost())));
      channel.send({ type: 'resume', received: this.received });
    });
  }

  private fail(reason: Error): void {
    if (this.closed) return;
    this.closed = reason;
    for (const w of this.waiters.splice(0)) w.reject(reason);
    this.channel.close();
    for (const cb of this.closeListeners) cb(reason);
  }
}
