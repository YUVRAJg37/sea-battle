import type { Link } from '../net/link';
import { cleanChat } from '../net/protocol';

/** One-tap messages; most chat on a phone is one of these. */
export const CHAT_PRESETS = ['Nice shot!', 'Good game', 'So close!', 'Your move…', '😬', '🔥', '😂', '🫡'];

const BUBBLE_MS = 6000;
const MAX_BUBBLES = 4;
const SEND_GAP_MS = 800; // our own pace
const FLOOD_WINDOW_MS = 5000; // theirs: at most FLOOD_MAX messages per window
const FLOOD_MAX = 5;

export interface Chat {
  /** Sends a message; returns false if it was empty or too soon after the last one. */
  send(text: string): boolean;
}

/** Chat over the link. Messages appear as bubbles at the top right and fade after a few seconds. */
export function createChat(link: Link, onReceive?: () => void): Chat {
  const recent: number[] = [];
  let lastSent = 0;

  link.on('chat', ({ text }) => {
    const now = Date.now();
    while (recent.length && now - recent[0]! > FLOOD_WINDOW_MS) recent.shift();
    if (recent.length >= FLOOD_MAX) return;
    recent.push(now);
    bubble('Opponent', text, 'them');
    onReceive?.();
  });

  return {
    send(raw) {
      const text = cleanChat(raw);
      if (!text || Date.now() - lastSent < SEND_GAP_MS) return false;
      lastSent = Date.now();
      link.send({ type: 'chat', text });
      bubble('You', text, 'mine');
      return true;
    },
  };
}

function bubble(who: string, text: string, kind: 'mine' | 'them') {
  const list = document.getElementById('chat-bubbles')!;
  const item = document.createElement('p');
  item.className = `bubble ${kind}`;
  item.append(Object.assign(document.createElement('span'), { className: 'who', textContent: who }), ` ${text}`); // text, never HTML
  list.append(item);
  while (list.children.length > MAX_BUBBLES) list.firstElementChild!.remove();
  setTimeout(() => item.classList.add('fade'), BUBBLE_MS - 600);
  setTimeout(() => item.remove(), BUBBLE_MS);
}
