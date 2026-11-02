import { EDGES, PIECE_TYPES, SHIP_TYPES, inBounds, shipCells, type Action, type Cell, type Edge, type Fleet, type Outcome, type Ship } from '../engine';

/** Bumped whenever messages change shape, so mismatched clients refuse each other cleanly. */
export const PROTOCOL_VERSION = 4;
const MAX_MESSAGE_BYTES = 8 * 1024;
export const MAX_CHAT_LENGTH = 140;

/** Everything two peers say to each other over the data channel. */
export type Message =
  | { type: 'hello'; version: number }
  // Fleet placed. Commits to the fleet and to a random seed without revealing either.
  | { type: 'ready'; commitment: string; seedCommitment: string }
  // Sent once both are ready: the seeds together pick who fires first.
  | { type: 'seed'; seed: number; salt: string }
  | { type: 'action'; action: Action }
  | { type: 'outcome'; outcome: Outcome }
  // After the last shot: the fleet and salt behind the commitment, so the other side can check every report.
  | { type: 'reveal'; fleet: Fleet; salt: string }
  | { type: 'chat'; text: string }
  | { type: 'rematch' }
  // After a reconnect: how many of the peer's messages we received, so they resend the rest.
  | { type: 'resume'; received: number }
  // Leaving on purpose, so the other side doesn't wait for a reconnect.
  | { type: 'bye' };

export type MessageType = Message['type'];

/**
 * Parses a message from the peer. Anything malformed returns null: the peer is untrusted, and
 * the rules engine assumes well-formed actions.
 */
export function parseMessage(raw: unknown): Message | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  switch (m.type) {
    case 'hello':
      return isInt(m.version) ? { type: 'hello', version: m.version } : null;
    case 'ready':
      return isHash(m.commitment) && isHash(m.seedCommitment) ? { type: 'ready', commitment: m.commitment, seedCommitment: m.seedCommitment } : null;
    case 'seed':
      return isInt(m.seed) && isSalt(m.salt) ? { type: 'seed', seed: m.seed, salt: m.salt } : null;
    case 'action':
      return isAction(m.action) ? { type: 'action', action: m.action } : null;
    case 'outcome':
      return isOutcome(m.outcome) ? { type: 'outcome', outcome: m.outcome } : null;
    case 'reveal':
      return Array.isArray(m.fleet) && m.fleet.length === PIECE_TYPES.length && m.fleet.every(isShip) && isSalt(m.salt)
        ? { type: 'reveal', fleet: m.fleet, salt: m.salt }
        : null;
    case 'chat': {
      const text = typeof m.text === 'string' ? cleanChat(m.text) : '';
      return text ? { type: 'chat', text } : null;
    }
    case 'rematch':
      return { type: 'rematch' };
    case 'resume':
      return isInt(m.received) && m.received >= 0 ? { type: 'resume', received: m.received } : null;
    case 'bye':
      return { type: 'bye' };
    default:
      return null;
  }
}

/** Trims, strips control characters and caps length. Rendered with textContent, never as HTML. */
export function cleanChat(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isSalt = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

function isCell(v: unknown): v is Cell {
  return isObject(v) && isInt(v.x) && isInt(v.y) && inBounds({ x: v.x, y: v.y }) && Object.keys(v).length === 2;
}

const isCells = (v: unknown): v is Cell[] => Array.isArray(v) && v.length <= 100 && v.every(isCell);
const isDir = (v: unknown) => v === 'h' || v === 'v';

function isShip(v: unknown): v is Ship {
  if (!isObject(v) || !PIECE_TYPES.includes(v.type as Ship['type']) || !isDir(v.dir) || !isCell(v.origin)) return false;
  return shipCells(v as unknown as Ship).every(inBounds);
}

function isAction(v: unknown): v is Action {
  if (!isObject(v)) return false;
  switch (v.type) {
    case 'shot':
      return isCell(v.target);
    case 'airstrike':
      return isCell(v.origin) && isDir(v.dir);
    case 'salvo':
      return Array.isArray(v.targets) && v.targets.length === 2 && v.targets.every(isCell);
    case 'radar':
      return isCell(v.center);
    case 'torpedo':
      return isInt(v.lane) && v.lane >= 0 && v.lane < 10 && EDGES.includes(v.from as Edge);
    case 'ricochet':
      return isCell(v.target) && EDGES.includes(v.toward as Edge);
    default:
      return false;
  }
}

function isOutcome(v: unknown): v is Outcome {
  return (
    isObject(v) &&
    isCells(v.hits) &&
    isCells(v.misses) &&
    Array.isArray(v.sunk) && v.sunk.length <= SHIP_TYPES.length && v.sunk.every((s) => isShip(s) && s.type !== 'decoy') &&
    (v.radarCount === undefined || (isInt(v.radarCount) && v.radarCount >= 0 && v.radarCount <= 9))
  );
}
