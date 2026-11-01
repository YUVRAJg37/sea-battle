import { SHIP_TYPES, inBounds, shipCells, type Action, type Cell, type Outcome, type Ship } from '../engine';

/** Bumped whenever messages change shape, so mismatched clients refuse each other cleanly. */
export const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 8 * 1024;

/** Everything two peers say to each other over the data channel. */
export type Message =
  | { type: 'hello'; version: number }
  | { type: 'ready'; seed: number } // fleet placed; seeds pick who fires first
  | { type: 'action'; action: Action }
  | { type: 'outcome'; outcome: Outcome };

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
      return isInt(m.seed) ? { type: 'ready', seed: m.seed } : null;
    case 'action':
      return isAction(m.action) ? { type: 'action', action: m.action } : null;
    case 'outcome':
      return isOutcome(m.outcome) ? { type: 'outcome', outcome: m.outcome } : null;
    default:
      return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

function isCell(v: unknown): v is Cell {
  return isObject(v) && isInt(v.x) && isInt(v.y) && inBounds({ x: v.x, y: v.y }) && Object.keys(v).length === 2;
}

const isCells = (v: unknown): v is Cell[] => Array.isArray(v) && v.length <= 100 && v.every(isCell);
const isDir = (v: unknown) => v === 'h' || v === 'v';

function isShip(v: unknown): v is Ship {
  if (!isObject(v) || !SHIP_TYPES.includes(v.type as Ship['type']) || !isDir(v.dir) || !isCell(v.origin)) return false;
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
      return isInt(v.row) && v.row >= 0 && v.row < 10 && (v.from === 'left' || v.from === 'right');
    case 'scout':
      return true;
    default:
      return false;
  }
}

function isOutcome(v: unknown): v is Outcome {
  return (
    isObject(v) &&
    isCells(v.hits) &&
    isCells(v.misses) &&
    Array.isArray(v.sunk) && v.sunk.length <= SHIP_TYPES.length && v.sunk.every(isShip) &&
    (v.radarCount === undefined || (isInt(v.radarCount) && v.radarCount >= 0 && v.radarCount <= 9)) &&
    (v.scouted === undefined || isCell(v.scouted))
  );
}
