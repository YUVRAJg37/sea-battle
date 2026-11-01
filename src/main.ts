import './style.css';
import {
  canUseAbility, inBounds, randomFleet, sameCell, shipAt, shipCells, validateAction, validateFleet, SHIPS, SHIP_TYPES,
  type Action, type Cell, type Dir, type Fleet, type PlayerId, type ShipType, type TurnRecord,
} from './engine';
import { Match, ME, THEM } from './game/match';
import { aim, type Mode } from './game/targeting';
import { describeTurn } from './game/describe';
import { statsFor } from './game/stats';
import { aiBot } from './bot/ai';
import { SeaScene, type View } from './render/scene';
import { createHud, type HudView, type Screen } from './ui/hud';
import { MODE_INFO } from './ui/modes';

const PLACING_HINT = 'Tap a ship to pick it up, then tap the water to drop it.';

// Board labels are drawn onto a canvas, so the font has to be ready first. Offline it falls back to monospace.
await document.fonts.load('600 48px "Chakra Petch"').catch(() => undefined);

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
// Shared
let pointed: Cell | null = null; // cell under the pointer on the active board
let view: View = 'overview';
let status = '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const flip = (d: Dir): Dir => (d === 'h' ? 'v' : 'h');
const myTurn = () => screen === 'battle' && !busy && match!.state.turn === ME;

// --- Placement ---

const fits = (cells: Cell[]) => cells.every((c) => inBounds(c) && !shipAt(fleet, c));

function previewPlacement() {
  if (!held || !pointed) return scene.mine.setPreview([]);
  const cells = shipCells({ ...held, origin: pointed });
  scene.mine.setPreview(cells.filter(inBounds), fits(cells));
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
  status = held ? `Moving the ${held.type}. Tap the water to drop it, Rotate to turn it.` : PLACING_HINT;
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
      status = 'Salvo: pick the second target.';
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
    status = error[0]!.toUpperCase() + error.slice(1) + '.';
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
  scene.sync(match!.state, match!.fleet);
  // Keep our result on screen under the enemy's reply so it isn't missed.
  status = byMe ? describeTurn(record, true) : `${status}\n${describeTurn(record, false)}`;
  render();
}

function selectMode(next: Mode) {
  if (!myTurn()) return;
  if (next === 'scout') return fire({ type: 'scout' });
  mode = next === mode ? 'shot' : next; // tapping the active ability turns it off
  salvoFirst = null;
  status = MODE_INFO[mode].description;
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
  status = PLACING_HINT;
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
      status = PLACING_HINT;
      break;
    case 'start':
      if (held || validateFleet(fleet)) return;
      match = new Match(fleet, aiBot());
      scene.mine.setPreview([]);
      screen = 'battle';
      status = 'Pick a target on the enemy grid.';
      focus('enemy');
      break;
    case 'view':
      focus(view === 'mine' ? 'enemy' : 'mine');
      break;
  }
  render();
}

function banner(): Pick<HudView, 'banner' | 'bannerTone'> {
  if (screen === 'placing') return { banner: 'Deploy your fleet', bannerTone: 'green' };
  const state = match?.state;
  if (!state) return { banner: '', bannerTone: 'green' };
  if (state.winner !== null) return state.winner === ME ? { banner: 'Victory', bannerTone: 'green' } : { banner: 'Defeat', bannerTone: 'red' };
  const turn = busy ? acting ?? state.turn : state.turn;
  if (turn === THEM) return { banner: 'Enemy turn', bannerTone: 'red' };
  return { banner: busy ? 'Firing' : `Your turn · ${Math.floor(state.log.length / 2) + 1}`, bannerTone: 'amber' };
}

function render() {
  const state = match?.state;
  const fleetStatus = (player: PlayerId) =>
    SHIP_TYPES.map((type) => ({ type, sunk: state!.players[player].sunk.some((s) => s.type === type) }));
  hud.render({
    screen,
    howTo,
    ...banner(),
    status,
    mode,
    canStart: !held && validateFleet(fleet) === null,
    showRotate: mode === 'airstrike',
    viewLabel: view === 'mine' ? 'Enemy grid' : 'My fleet',
    fleets: state ? { mine: fleetStatus(ME), enemy: fleetStatus(THEM) } : null,
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
  if (e.key === 'r' || e.key === 'R') onButton('rotate');
  if (e.key === 'Escape' && howTo) onButton('close-howto');
});

focus('overview');
