import './style.css';
import {
  EDGES, canUseAbility, inBounds, randomFleet, sameCell, shipAt, shipCells, validateAction, validateFleet, SHIPS, SHIP_TYPES,
  type Action, type Cell, type Dir, type Edge, type Fleet, type GameState, type PlayerId, type ShipType, type TurnRecord,
} from './engine';
import { Match, ME, THEM } from './game/match';
import { aim, type Mode } from './game/targeting';
import { describeTurn } from './game/describe';
import { statsFor } from './game/stats';
import { aiBot } from './bot/ai';
import { checkFairPlay, handshake, startRound, type FairPlay, type Round, type Session } from './game/online';
import { Cancelled, ConnectionLost } from './net/channel';
import { createChat, type Chat } from './ui/chat';
import { connect, newRoomCode, normalizeRoomCode } from './net/connect';
import { SeaScene, type View } from './render/scene';
import { SETTING_LABEL, Sound } from './audio/sound';
import { createHud, type HudView, type LobbyView, type LogLine, type Screen } from './ui/hud';
import { MODE_INFO } from './ui/modes';

const PLACING_HINT = 'Tap a ship to pick it up, then tap the water to drop it.';
const hint = (text: string): LogLine[] => [{ text, kind: 'hint' }];

// Board labels are drawn onto a canvas, so the font has to be ready first. Offline it falls back to monospace.
await document.fonts.load('600 48px "Oxanium"').catch(() => undefined);

const canvas = document.querySelector('canvas')!;
const sound = new Sound();
const scene = new SeaScene(canvas, sound);
// Browsers only start audio after the player interacts.
for (const type of ['pointerdown', 'keydown'] as const) addEventListener(type, () => sound.unlock());
const hud = createHud({ onButton, onMode: selectMode, onJoin: joinRoom, onChat: (text) => chat?.send(text) && render() });

let screen: Screen = 'title';
let howTo = false;
// Placement
let fleet: Fleet = randomFleet(Math.random);
let held: { type: ShipType; dir: Dir } | null = null;
// Battle
let match: Match | null = null;
let mode: Mode = 'shot';
let dir: Dir = 'h'; // airstrike orientation
let torpedoSide: Edge = 'left'; // edge the torpedo launches from
let salvoFirst: Cell | null = null;
let busy = false;
let acting: PlayerId | null = null; // whose turn is animating; the state has already moved on
let shown: GameState | null = null; // state as the player has seen it, so the HUD doesn't spoil a shot in flight
// Shared
let pointed: Cell | null = null; // cell under the pointer on the active board
let view: View = 'overview';
let log: LogLine[] = [];
// Online
let session: Session | null = null;
let connecting: AbortController | null = null;
let waitingForPeer = false; // our fleet is ready, theirs isn't yet
let lobby: LobbyView = { stage: 'start', code: '', error: '', copied: false };
let reconnecting = false; // the link dropped and is trying to come back
let peerGone = false; // the opponent left the room (no rematch possible)
let round: Round | null = null; // this round's commitments, checked at the end
let fairPlay: FairPlay | { status: 'checking' } | null = null;
let rematch = { mine: false, theirs: false };
let chat: Chat | null = null;
let chatOpen = false;
let notice: HudView['notice'] = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sentence = (s: string) => s[0]!.toUpperCase() + s.slice(1) + (s.endsWith('.') ? '' : '.');
const flip = (d: Dir): Dir => (d === 'h' ? 'v' : 'h');
const myTurn = () => screen === 'battle' && !busy && !reconnecting && match!.state.turn === ME;

// --- Placement ---

const fits = (cells: Cell[]) => cells.every((c) => inBounds(c) && !shipAt(fleet, c));

function previewPlacement() {
  if (!held || !pointed) return scene.mine.setPreview([]);
  const cells = shipCells({ ...held, origin: pointed });
  scene.mine.setPreview(cells.filter(inBounds), fits(cells) ? 'ok' : 'bad');
}

function tapPlacing(cell: Cell) {
  if (waitingForPeer) return; // fleet is locked in once we're ready
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
  sound.place();
  previewPlacement();
  log = hint(held ? `Moving the ${held.type}. Tap the water to drop it, or rotate it.` : PLACING_HINT);
  render();
}

// --- Battle ---

function previewAim() {
  const cells = !myTurn() ? [] : pointed ? aim(mode, pointed, dir, salvoFirst, torpedoSide).cells : salvoFirst ? [salvoFirst] : [];
  scene.enemy.setPreview(cells);
  // The torpedo's whole lane lights up, so an arrow on its first cell shows which way it runs.
  scene.enemy.setArrow(mode === 'torpedo' && cells.length ? cells[0]! : null, torpedoSide);
}

function tapBattle(cell: Cell, isMouse: boolean) {
  if (!myTurn()) return;
  // On touch there's no hover: the first tap aims, tapping the same cell again fires.
  const confirmed = isMouse || (pointed !== null && sameCell(pointed, cell));
  pointed = cell;
  if (!confirmed) {
    log = hint('Tap the same cell again to fire.');
    previewAim();
    return render();
  }

  const { action } = aim(mode, cell, dir, salvoFirst, torpedoSide);
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
  try {
    await playRecord(await m.play(action));
    if (m.state.winner === null) await enemyTurn(m);
  } catch (e) {
    return connectionLost(e);
  }
  await endTurns(m);
}

/** The opponent's move. The bot answers at once; a remote player takes as long as they take. */
async function enemyTurn(m: Match) {
  busy = true;
  await sleep(700);
  if (m !== match) return;
  acting = THEM;
  focus('mine');
  if (!session) await sleep(600);
  await playRecord(await m.opponentTurn());
  if (m.state.winner === null) {
    await sleep(900);
    focus('enemy');
  }
}

async function endTurns(m: Match) {
  if (m !== match) return; // the player left to the menu mid-turn
  if (m.state.winner !== null) {
    void checkOpponent(m);
    await sleep(1800); // let the last ship sink before the report
    if (m !== match) return;
    screen = 'over';
    if (m.state.winner === ME) sound.victory();
    else sound.defeat();
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
  if (record.outcome.sunk.length) {
    sound.sink();
    await scene.dramatizeSinking(record.outcome.sunk[0]!, byMe);
  }
}

function selectMode(next: Mode) {
  if (!myTurn()) return;
  if (next !== 'shot' && !canUseAbility(match!.state, ME, next)) return; // hotkeys can reach weapons that aren't ready
  if (next === 'scout') return fire({ type: 'scout' });
  mode = next === mode ? 'shot' : next; // tapping the active ability turns it off
  sound.select();
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
  notice = null;
  waitingForPeer = false;
  round = null;
  fairPlay = null;
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

function startBattle(m: Match) {
  match = m;
  shown = m.state;
  scene.mine.setPreview([]);
  screen = 'battle';
  if (m.state.turn === ME) {
    log = hint('Pick a target on the enemy grid.');
    focus('enemy');
    return;
  }
  log = hint('Your opponent fires first.');
  void (async () => {
    try {
      await enemyTurn(m);
    } catch (e) {
      return connectionLost(e);
    }
    await endTurns(m);
  })();
}

// --- Online ---

function setRoomInUrl(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function leaveSession() {
  connecting?.abort();
  connecting = null;
  const s = session;
  session = null;
  waitingForPeer = false;
  reconnecting = false;
  s?.link.close(); // says goodbye, so they don't wait for us to come back
}

function openLobby(error = '') {
  leaveSession();
  match = null;
  notice = null;
  scene.reset();
  setRoomInUrl(null);
  lobby = { stage: 'start', code: '', error, copied: false };
  screen = 'lobby';
  focus('overview');
}

async function enterRoom(code: string) {
  leaveSession();
  const attempt = (connecting = new AbortController());
  screen = 'lobby';
  lobby = { stage: 'connecting', code, error: '', copied: false };
  setRoomInUrl(code);
  focus('overview');
  try {
    const { channel, role } = await connect(code, (stage) => ((lobby.stage = stage), render()), attempt.signal);
    const s = await handshake(channel, role, {
      // After a drop, both browsers rejoin the same room and the link picks up where it left off.
      reconnect: (abort) => connect(code, () => {}, abort).then((c) => c.channel),
      onStatus: (status) => session === s && ((reconnecting = status === 'reconnecting'), render()),
    });
    if (attempt.signal.aborted) return s.link.close();
    connecting = null;
    session = s;
    peerGone = false;
    chat = createChat(s.link, () => sound.chat());
    s.link.onClose((reason) => session === s && linkClosed(reason));
    s.link.on('rematch', () => ((rematch.theirs = true), maybeRematch()));
    newPlacement();
  } catch (e) {
    if (!attempt.signal.aborted) openLobby(sentence(e instanceof Error ? e.message : String(e)));
  }
}

function joinRoom(input: string) {
  const code = normalizeRoomCode(input);
  if (!code) {
    lobby.error = 'Room codes are 6 letters and numbers.';
    return render();
  }
  void enterRoom(code);
}

async function copyInvite() {
  const url = location.href;
  try {
    // Phones get the share sheet; desktops copy the link.
    if (navigator.share && matchMedia('(hover: none)').matches) return await navigator.share({ title: 'Sea Battle', text: 'Join my Sea Battle room', url });
    await navigator.clipboard.writeText(url);
    lobby.copied = true;
    render();
    setTimeout(() => ((lobby.copied = false), render()), 2000);
  } catch {
    // Share sheet dismissed or clipboard blocked: the code is on screen to read out instead.
  }
}

async function readyOnline() {
  const s = session!;
  waitingForPeer = true;
  held = null;
  scene.mine.setPreview([]);
  log = hint('Fleet locked in. Waiting for your opponent to finish deploying…');
  render();
  try {
    round = await startRound(s, fleet);
  } catch (e) {
    return connectionLost(e);
  }
  if (s !== session) return;
  waitingForPeer = false;
  startBattle(new Match(fleet, s.opponent, round.first));
}

/** Once someone wins: swap fleets, check every report they gave us, and show their whole fleet. */
async function checkOpponent(m: Match) {
  const s = session;
  if (!s || !round) return;
  fairPlay = { status: 'checking' };
  render();
  const result = await checkFairPlay(s, round, m.state.log, m.fleet);
  if (m !== match) return;
  fairPlay = result;
  if (result.status !== 'unverified') scene.enemy.setShips(result.fleet);
  render();
}

function maybeRematch() {
  if (rematch.mine && rematch.theirs && session) {
    rematch = { mine: false, theirs: false };
    newPlacement();
    log = hint('Rematch! ' + PLACING_HINT);
  }
  render();
}

function linkClosed(reason: Error) {
  session = null;
  reconnecting = false;
  waitingForPeer = false;
  peerGone = true;
  chat = null;
  const left = /left/.test(reason.message);
  if (screen === 'placing' || (screen === 'battle' && match?.state.winner === null)) {
    notice = { title: left ? 'Opponent left' : 'Connection lost', body: sentence(reason.message) };
    busy = false;
  }
  render();
}

/** A network failure mid-game ends the match with a notice. Anything else is a bug: let it surface. */
function connectionLost(e: unknown) {
  if (e instanceof Cancelled) return;
  if (!(e instanceof ConnectionLost)) throw e;
  if (!notice) linkClosed(e);
}

function onButton(act: string) {
  sound.click();
  switch (act) {
    case 'sound':
      sound.cycleSetting();
      break;
    case 'play':
      newPlacement();
      break;
    case 'again':
      if (session) {
        rematch.mine = true;
        session.link.send({ type: 'rematch' });
        maybeRematch();
      } else if (!peerGone) newPlacement();
      break;
    case 'menu':
      leaveSession();
      setRoomInUrl(null);
      match = null;
      notice = null;
      peerGone = false;
      chat = null;
      chatOpen = false;
      rematch = { mine: false, theirs: false };
      scene.reset();
      screen = 'title';
      focus('overview');
      break;
    case 'online':
      openLobby();
      break;
    case 'chat':
      chatOpen = !chatOpen;
      if (chatOpen) requestAnimationFrame(() => document.getElementById('chat-input')?.focus({ preventScroll: true }));
      break;
    case 'create-room':
      void enterRoom(newRoomCode());
      break;
    case 'leave-room':
      openLobby();
      break;
    case 'copy-link':
      void copyInvite();
      break;
    case 'howto':
      howTo = true;
      chatOpen = false;
      break;
    case 'close-howto':
      howTo = false;
      break;
    case 'rotate':
      if (waitingForPeer) break;
      if (held) {
        held = { ...held, dir: flip(held.dir) };
        previewPlacement();
      } else if (screen === 'battle') {
        if (mode === 'torpedo') torpedoSide = EDGES[(EDGES.indexOf(torpedoSide) + 1) % EDGES.length]!; // left → top → right → bottom
        else dir = flip(dir);
        previewAim();
      }
      break;
    case 'random':
      if (waitingForPeer) break;
      fleet = randomFleet(Math.random);
      held = null;
      scene.mine.setPreview([]);
      scene.sync(null, fleet);
      log = hint(PLACING_HINT);
      break;
    case 'start':
      if (held || validateFleet(fleet) || waitingForPeer) return;
      if (session) void readyOnline();
      else startBattle(new Match(fleet, aiBot()));
      break;
    case 'view':
      focus(view === 'mine' ? 'enemy' : 'mine');
      break;
  }
  render();
}

function turnCard(): Pick<HudView, 'turnLabel' | 'banner' | 'tone'> {
  if (reconnecting) return { turnLabel: 'Connection lost', banner: 'Reconnecting…', tone: 'red' };
  if (screen === 'placing') {
    return { turnLabel: session ? 'Deployment · online' : 'Deployment', banner: waitingForPeer ? 'Waiting for opponent' : 'Position your fleet', tone: 'green' };
  }
  const state = match?.state;
  if (!state) return { turnLabel: '', banner: '', tone: 'green' };
  if (shown && shown.winner !== null) {
    return { turnLabel: 'Battle over', banner: shown.winner === ME ? 'Victory' : 'Defeat', tone: shown.winner === ME ? 'green' : 'red' };
  }
  const turnLabel = `Turn ${Math.floor(state.log.length / 2) + 1}`;
  const turn = busy ? acting ?? state.turn : state.turn;
  if (turn === THEM) return { turnLabel, banner: 'Enemy turn', tone: 'red' };
  return { turnLabel, banner: busy ? 'Firing' : 'Your move', tone: 'amber' };
}

function overActions(): Pick<HudView, 'againLabel' | 'againDisabled' | 'leaveLabel' | 'overNote'> {
  if (!session && !peerGone) return { againLabel: 'Play again', againDisabled: false, leaveLabel: 'Main menu', overNote: '' };
  if (peerGone) return { againLabel: 'Rematch', againDisabled: true, leaveLabel: 'Main menu', overNote: 'Your opponent left the room.' };
  if (rematch.mine) return { againLabel: 'Waiting for opponent…', againDisabled: true, leaveLabel: 'Leave room', overNote: '' };
  if (rematch.theirs) return { againLabel: 'Accept rematch', againDisabled: false, leaveLabel: 'Leave room', overNote: 'Your opponent wants a rematch.' };
  return { againLabel: 'Rematch', againDisabled: false, leaveLabel: 'Leave room', overNote: '' };
}

function render() {
  sound.setMood(screen === 'battle' ? 'battle' : 'calm');
  const state = match?.state;
  const fleetStatus = (player: PlayerId) =>
    SHIP_TYPES.map((type) => ({ type, sunk: shown!.players[player].sunk.some((s) => s.type === type) }));
  hud.render({
    screen,
    howTo,
    lobby,
    notice,
    online: session !== null,
    chatOpen,
    soundLabel: SETTING_LABEL[sound.setting],
    fairPlay: fairPlay && (fairPlay.status === 'cheated' ? { status: 'cheated', detail: fairPlay.detail } : { status: fairPlay.status }),
    ...overActions(),
    readyLabel: waitingForPeer ? 'Waiting…' : 'Ready',
    ...turnCard(),
    log,
    mode,
    canStart: !held && !waitingForPeer && validateFleet(fleet) === null,
    showRotate: mode === 'airstrike' || mode === 'torpedo',
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
  // Typing in a text box shouldn't fire hotkeys, except Escape to close the chat.
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof HTMLInputElement && e.key !== 'Escape')) return;
  const key = e.key.toLowerCase();
  if (howTo) {
    if (key === 'escape') onButton('close-howto');
    return;
  }
  if (key === 'escape' && chatOpen) return onButton('chat');
  if (key === 'r') onButton('rotate');
  if (key === 'v' && screen === 'battle') onButton('view');
  // A focused button already handles Enter itself.
  const buttonFocused = document.activeElement instanceof HTMLButtonElement;
  if (key === 'enter' && !buttonFocused && (screen === 'title' || screen === 'over')) onButton(screen === 'title' ? 'play' : 'again');
  const slot = Number(key) - 1; // 1–6 pick Fire and the five weapons, in rack order
  if (screen === 'battle' && slot >= 0 && slot <= SHIP_TYPES.length) selectMode(slot === 0 ? 'shot' : SHIPS[SHIP_TYPES[slot - 1]!].ability);
});

// Opening an invite link joins that room straight away.
const invited = normalizeRoomCode(new URL(location.href).searchParams.get('room') ?? '');
if (invited) void enterRoom(invited);
else focus('overview');
