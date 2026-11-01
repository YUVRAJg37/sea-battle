import './style.css';
import {
  canUseAbility, inBounds, randomFleet, sameCell, shipAt, shipCells, validateAction, validateFleet, SHIPS, SHIP_TYPES,
  type Action, type Cell, type Dir, type Fleet, type GameState, type PlayerId, type ShipType, type TurnRecord,
} from './engine';
import { Match, ME, THEM } from './game/match';
import { aim, type Mode } from './game/targeting';
import { describeTurn } from './game/describe';
import { statsFor } from './game/stats';
import { aiBot } from './bot/ai';
import { SeaScene, type View } from './render/scene';
import { createHud, type HudView, type LogLine, type Screen } from './ui/hud';
import { MODE_INFO } from './ui/modes';

const PLACING_HINT = 'Tap a ship to pick it up, then tap the water to drop it.';
const hint = (text: string): LogLine[] => [{ text, kind: 'hint' }];

// Board labels are drawn onto a canvas, so the font has to be ready first. Offline it falls back to monospace.
await document.fonts.load('600 48px "Oxanium"').catch(() => undefined);

const canvas = document.querySelector('canvas')!;
const scene = new SeaScene(canvas);
const hud = createHud({ onButton, onMode: selectMode });

let screen: Screen = 'title';
let howTo = false;
// Placement
let fleet: Fleet = randomFleet(Math.random);
let held: { type: ShipType; dir: Dir } | null = null;
// Battle
let match: Match | null = null;
let mode: Mode = 'shot';
let dir: Dir = 'h';
let salvoFirst: Cell | null = null;
let busy = false;
let acting: PlayerId | null = null; // whose turn is animating; the state has already moved on
let shown: GameState | null = null; // state as the player has seen it, so the HUD doesn't spoil a shot in flight
// Shared
let pointed: Cell | null = null; // cell under the pointer on the active board
let view: View = 'overview';
let log: LogLine[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const flip = (d: Dir): Dir => (d === 'h' ? 'v' : 'h');
const myTurn = () => screen === 'battle' && !busy && match!.state.turn === ME;

// --- Placement ---

const fits = (cells: Cell[]) => cells.every((c) => inBounds(c) && !shipAt(fleet, c));

function previewPlacement() {
  if (!held || !pointed) return scene.mine.setPreview([]);
  const cells = shipCells({ ...held, origin: pointed });
  scene.mine.setPreview(cells.filter(inBounds), fits(cells) ? 'ok' : 'bad');
}

function tapPlacing(cell: Cell) {
  if (held) {
    const ship = { ...held, origin: cell };
    if (!fits(shipCells(ship))) return;
    fleet = [...fleet, ship];
    held = null;
  } else {
    const ship = shipAt(fleet, cell);
    if (!ship) return;
    fleet = fleet.filter((s) => s !== ship);
    held = { type: ship.type, dir: ship.dir };
  }
  scene.sync(null, fleet);
  previewPlacement();
  log = hint(held ? `Moving the ${held.type}. Tap the water to drop it, or rotate it.` : PLACING_HINT);
  render();
}

// --- Battle ---

function previewAim() {
  if (!myTurn()) return scene.enemy.setPreview([]);
  scene.enemy.setPreview(pointed ? aim(mode, pointed, dir, salvoFirst).cells : salvoFirst ? [salvoFirst] : []);
}

function tapBattle(cell: Cell, isMouse: boolean) {
  if (!myTurn()) return;
  // On touch there's no hover: the first tap aims, tapping the same cell again fires.
  const confirmed = isMouse || (pointed !== null && sameCell(pointed, cell));
  pointed = cell;
  if (!confirmed) return previewAim();

  const { action } = aim(mode, cell, dir, salvoFirst);
  if (!action) {
    if (mode === 'salvo' && !salvoFirst) {
      salvoFirst = cell;
      pointed = null;
      log = hint('Salvo: pick the second target.');
      previewAim();
      render();
    }
    return;
  }
  fire(action);
}

function fire(action: Action) {
  const error = validateAction(match!.state, action);
  if (error) {
    log = hint(error[0]!.toUpperCase() + error.slice(1) + '.');
    salvoFirst = null;
    previewAim();
    return render();
  }
  void takeTurns(action);
}

async function takeTurns(action: Action) {
  const m = match!;
  busy = true;
  acting = ME;
  salvoFirst = null;
  pointed = null;
  previewAim();
  render();

  await playRecord(await m.play(action));
  if (m.state.winner === null) {
    await sleep(700);
    focus('mine');
    await sleep(600);
    await playRecord(await m.opponentTurn());
    if (m.state.winner === null) {
      await sleep(900);
      focus('enemy');
    }
  }
  if (m !== match) return; // the player left to the menu mid-turn
  if (m.state.winner !== null) {
    await sleep(1800); // let the last ship sink before the report
    screen = 'over';
    focus('overview');
  }
  if (mode !== 'shot' && !canUseAbility(m.state, ME, mode)) mode = 'shot';
  busy = false;
  render();
}

async function playRecord(record: TurnRecord) {
  const byMe = record.attacker === ME;
  acting = record.attacker;
  render();
  await scene.playTurn(record, byMe);
  shown = match!.state;
  scene.sync(shown, match!.fleet);
  // Keep our result on screen above the enemy's reply so it isn't missed.
  const line: LogLine = { text: describeTurn(record, byMe), kind: byMe ? 'mine' : 'enemy' };
  log = byMe ? [line] : [...log.filter((l) => l.kind === 'mine'), line];
  render();
}

function selectMode(next: Mode) {
  if (!myTurn()) return;
  if (next !== 'shot' && !canUseAbility(match!.state, ME, next)) return; // hotkeys can reach weapons that aren't ready
  if (next === 'scout') return fire({ type: 'scout' });
  mode = next === mode ? 'shot' : next; // tapping the active ability turns it off
  salvoFirst = null;
  log = hint(MODE_INFO[mode].description);
  previewAim();
  render();
}

// --- Screens ---

function focus(next: View) {
  view = next;
  scene.focus(next);
  render();
}

function newPlacement() {
  match = null;
  fleet = randomFleet(Math.random);
  held = null;
  mode = 'shot';
  busy = false;
  scene.reset();
  scene.sync(null, fleet);
  screen = 'placing';
  log = hint(PLACING_HINT);
  focus('mine');
}

function onButton(act: string) {
  switch (act) {
    case 'play':
    case 'again':
      newPlacement();
      break;
    case 'menu':
      match = null;
      scene.reset();
      screen = 'title';
      focus('overview');
      break;
    case 'howto':
      howTo = true;
      break;
    case 'close-howto':
      howTo = false;
      break;
    case 'rotate':
      if (held) {
        held = { ...held, dir: flip(held.dir) };
        previewPlacement();
      } else if (screen === 'battle') {
        dir = flip(dir);
        previewAim();
      }
      break;
    case 'random':
      fleet = randomFleet(Math.random);
      held = null;
      scene.mine.setPreview([]);
      scene.sync(null, fleet);
      log = hint(PLACING_HINT);
      break;
    case 'start':
      if (held || validateFleet(fleet)) return;
      match = new Match(fleet, aiBot());
      shown = match.state;
      scene.mine.setPreview([]);
      screen = 'battle';
      log = hint('Pick a target on the enemy grid.');
      focus('enemy');
      break;
    case 'view':
      focus(view === 'mine' ? 'enemy' : 'mine');
      break;
  }
  render();
}

function turnCard(): Pick<HudView, 'turnLabel' | 'banner' | 'tone'> {
  if (screen === 'placing') return { turnLabel: 'Deployment', banner: 'Position your fleet', tone: 'green' };
  const state = match?.state;
  if (!state) return { turnLabel: '', banner: '', tone: 'green' };
  if (shown && shown.winner !== null) {
    return { turnLabel: 'Battle over', banner: shown.winner === ME ? 'Victory' : 'Defeat', tone: shown.winner === ME ? 'green' : 'red' };
  }
  const turnLabel = `Turn ${Math.floor(state.log.length / 2) + 1}`;
  const turn = busy ? acting ?? state.turn : state.turn;
  if (turn === THEM) return { turnLabel, banner: 'Enemy firing', tone: 'red' };
  return { turnLabel, banner: busy ? 'Firing' : 'Your move', tone: 'amber' };
}

function render() {
  const state = match?.state;
  const fleetStatus = (player: PlayerId) =>
    SHIP_TYPES.map((type) => ({ type, sunk: shown!.players[player].sunk.some((s) => s.type === type) }));
  hud.render({
    screen,
    howTo,
    ...turnCard(),
    log,
    mode,
    canStart: !held && validateFleet(fleet) === null,
    showRotate: mode === 'airstrike',
    viewLabel: view === 'mine' ? 'Enemy grid' : 'My fleet',
    fleets: state && shown ? { mine: fleetStatus(ME), enemy: fleetStatus(THEM) } : null,
    result: state && state.winner !== null ? { won: state.winner === ME, mine: statsFor(state, ME), enemy: statsFor(state, THEM) } : null,
    abilities: !state ? [] : [
      { mode: 'shot', ready: myTurn(), cooldown: 0, lost: false },
      ...SHIP_TYPES.map((type) => ({
        mode: SHIPS[type].ability,
        ready: myTurn() && canUseAbility(state, ME, SHIPS[type].ability),
        cooldown: state.players[ME].cooldowns[type],
        lost: state.players[ME].sunk.some((s) => s.type === type),
      })),
    ],
  });
}

// --- Input: only the board in view takes taps ---

function cellUnderPointer(e: PointerEvent): Cell | null {
  const board = screen === 'placing' ? 'mine' : screen === 'battle' ? 'enemy' : null;
  if (!board || board !== view || howTo) return null;
  return scene.cellUnder(e, board === 'mine' ? scene.mine : scene.enemy);
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointed = cellUnderPointer(e);
  if (screen === 'placing') previewPlacement();
  else previewAim();
});

canvas.addEventListener('pointerup', (e) => {
  const cell = cellUnderPointer(e);
  if (!cell) return;
  if (screen === 'placing') tapPlacing(cell);
  else tapBattle(cell, e.pointerType === 'mouse');
});

addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (howTo) {
    if (key === 'escape') onButton('close-howto');
    return;
  }
  if (key === 'r') onButton('rotate');
  if (key === 'v' && screen === 'battle') onButton('view');
  // A focused button already handles Enter itself.
  const buttonFocused = document.activeElement instanceof HTMLButtonElement;
  if (key === 'enter' && !buttonFocused && (screen === 'title' || screen === 'over')) onButton(screen === 'title' ? 'play' : 'again');
  const slot = Number(key) - 1; // 1–6 pick Fire and the five weapons, in rack order
  if (screen === 'battle' && slot >= 0 && slot <= SHIP_TYPES.length) selectMode(slot === 0 ? 'shot' : SHIPS[SHIP_TYPES[slot - 1]!].ability);
});

focus('overview');
