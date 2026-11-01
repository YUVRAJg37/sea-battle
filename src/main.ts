import './style.css';
import {
  canUseAbility, inBounds, randomFleet, sameCell, shipAt, shipCells, validateAction, validateFleet, SHIPS, SHIP_TYPES,
  type Action, type Cell, type Dir, type Fleet, type ShipType, type TurnRecord,
} from './engine';
import { Match, ME, THEM } from './game/match';
import { aim, type Mode } from './game/targeting';
import { describeTurn } from './game/describe';
import { aiBot } from './bot/ai';
import { createStage } from './render/stage';
import { createOcean } from './render/ocean';
import { Board3D } from './render/board3d';
import { Effects } from './render/effects';
import { createHud, type Phase } from './ui/hud';

const BOARD_OFFSET = 7; // boards sit at x = ±7
const PLACING_HINT = 'Tap a ship to pick it up, then tap the water to drop it.';

const canvas = document.querySelector('canvas')!;
const stage = createStage(canvas);
const animateOcean = createOcean(stage.scene);
const effects = new Effects(stage.scene);
const mine = new Board3D(stage.scene, -BOARD_OFFSET, 0x1b5e20);
const enemy = new Board3D(stage.scene, BOARD_OFFSET, 0x8e1b1b);
stage.onFrame((dt, t) => {
  animateOcean(t);
  effects.update(dt);
});

// Placement
let fleet: Fleet = randomFleet(Math.random);
let held: { type: ShipType; dir: Dir } | null = null;
// Battle
let match: Match | null = null;
let mode: Mode = 'shot';
let dir: Dir = 'h';
let salvoFirst: Cell | null = null;
let busy = false;
// Shared
let pointed: Cell | null = null; // cell under the pointer on the active board
let viewing: 'mine' | 'enemy' = 'mine';
let status = PLACING_HINT;

const hud = createHud({ onButton, onMode: selectMode });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const flip = (d: Dir): Dir => (d === 'h' ? 'v' : 'h');
const phase = (): Phase => (!match ? 'placing' : match.state.winner !== null ? 'over' : 'battle');
const myTurn = () => phase() === 'battle' && !busy && match!.state.turn === ME;

// --- Placement ---

const fits = (cells: Cell[]) => cells.every((c) => inBounds(c) && !shipAt(fleet, c));

function previewPlacement() {
  if (!held || !pointed) return mine.setPreview([]);
  const cells = shipCells({ ...held, origin: pointed });
  mine.setPreview(cells.filter(inBounds), fits(cells));
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
  mine.setShips(fleet);
  previewPlacement();
  status = held ? `Moving ${held.type}. Tap water to drop it, Rotate to turn it.` : PLACING_HINT;
  render();
}

// --- Battle ---

function previewAim() {
  if (!myTurn()) return enemy.setPreview([]);
  enemy.setPreview(pointed ? aim(mode, pointed, dir, salvoFirst).cells : salvoFirst ? [salvoFirst] : []);
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
    status = error;
    salvoFirst = null;
    previewAim();
    return render();
  }
  void takeTurns(action);
}

async function takeTurns(action: Action) {
  const m = match!;
  busy = true;
  salvoFirst = null;
  pointed = null;
  previewAim();
  render();

  show(await m.play(action));
  if (m.state.winner === null) {
    await sleep(900);
    focus('mine');
    await sleep(500);
    show(await m.opponentTurn());
    if (m.state.winner === null) {
      await sleep(1100);
      focus('enemy');
    }
  }
  if (mode !== 'shot' && !canUseAbility(m.state, ME, mode)) mode = 'shot';
  busy = false;
  render();
}

function show(record: TurnRecord) {
  const byMe = record.attacker === ME;
  const board = byMe ? enemy : mine;
  const { action, outcome } = record;
  for (const c of outcome.hits) effects.explosion(board.cellPosition(c, 0.3));
  for (const c of outcome.misses) effects.splash(board.cellPosition(c));
  if (action.type === 'radar') board.addLabel(action.center, String(outcome.radarCount));
  if (outcome.scouted) board.addScout(outcome.scouted);
  syncBoards();

  // Keep our result on screen under the enemy's reply so it isn't missed.
  status = byMe ? describeTurn(record, true) : `${status}\n${describeTurn(record, false)}`;
  const winner = match!.state.winner;
  if (winner !== null) status += winner === ME ? ' Victory!' : ' Your fleet is lost.';
  render();
}

function selectMode(next: Mode) {
  if (!myTurn()) return;
  if (next === 'scout') return fire({ type: 'scout' });
  mode = next === mode ? 'shot' : next; // tapping the active ability turns it off
  salvoFirst = null;
  status = mode === 'shot' ? 'Pick a target.' : `${mode}: pick a target${mode === 'airstrike' ? ', Rotate to turn' : ''}.`;
  previewAim();
  render();
}

// --- Shared ---

function syncBoards() {
  mine.setShips(match?.fleet ?? fleet);
  if (!match) return;
  mine.setMarks(match.state.players[ME].marks);
  enemy.setShips(match.state.players[THEM].sunk);
  enemy.setMarks(match.state.players[THEM].marks);
}

function focus(target: 'mine' | 'enemy') {
  viewing = target;
  stage.focusOn((target === 'mine' ? mine : enemy).centerX);
  render();
}

function onButton(act: string) {
  switch (act) {
    case 'rotate':
      if (held) {
        held = { ...held, dir: flip(held.dir) };
        previewPlacement();
      } else if (phase() === 'battle') {
        dir = flip(dir);
        previewAim();
      }
      break;
    case 'random':
      fleet = randomFleet(Math.random);
      held = null;
      mine.setPreview([]);
      syncBoards();
      status = PLACING_HINT;
      break;
    case 'start':
      if (held || validateFleet(fleet)) return;
      match = new Match(fleet, aiBot());
      mine.setPreview([]);
      status = 'Your turn: pick a target on the enemy board.';
      focus('enemy');
      break;
    case 'view':
      focus(viewing === 'mine' ? 'enemy' : 'mine');
      break;
    case 'again':
      match = null;
      fleet = randomFleet(Math.random);
      mode = 'shot';
      mine.reset();
      enemy.reset();
      syncBoards();
      status = PLACING_HINT;
      focus('mine');
      break;
  }
  render();
}

function render() {
  const state = match?.state;
  hud.render({
    phase: phase(),
    status,
    mode,
    canStart: !held && validateFleet(fleet) === null,
    viewLabel: viewing === 'mine' ? 'Enemy waters' : 'My fleet',
    abilities: !state ? [] : [
      { mode: 'shot', label: 'Shot', ready: myTurn(), note: '' },
      ...SHIP_TYPES.map((type) => {
        const ability = SHIPS[type].ability;
        const lost = state.players[ME].sunk.some((s) => s.type === type);
        const cooldown = state.players[ME].cooldowns[type];
        return {
          mode: ability,
          label: ability[0]!.toUpperCase() + ability.slice(1),
          ready: myTurn() && canUseAbility(state, ME, ability),
          note: lost ? 'lost' : cooldown ? String(cooldown) : '',
        };
      }),
    ],
  });
}

// --- Input: only the board in view takes taps ---

function cellUnderPointer(e: PointerEvent): Cell | null {
  const board = phase() === 'placing' ? mine : enemy;
  if ((board === mine) !== (viewing === 'mine')) return null;
  return board.cellAt(stage.raycast(e));
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  pointed = cellUnderPointer(e);
  if (phase() === 'placing') previewPlacement();
  else previewAim();
});

canvas.addEventListener('pointerup', (e) => {
  const cell = cellUnderPointer(e);
  if (!cell) return;
  if (phase() === 'placing') tapPlacing(cell);
  else tapBattle(cell, e.pointerType === 'mouse');
});

syncBoards();
focus('mine');
