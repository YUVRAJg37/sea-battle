import { SHIPS, SHIP_TYPES, shipForAbility, type ShipType } from '../engine';
import type { Mode } from '../game/targeting';
import type { PlayerStats } from '../game/stats';
import { MODE_INFO } from './modes';
import { CHAT_PRESETS } from './chat';

export type Screen = 'title' | 'lobby' | 'placing' | 'battle' | 'over';

export interface AbilityView {
  mode: Mode;
  ready: boolean;
  cooldown: number; // turns left
  lost: boolean;
}

export interface ShipStatus {
  type: ShipType;
  sunk: boolean;
}

export interface LogLine {
  text: string;
  kind: 'mine' | 'enemy' | 'hint';
}

export interface LobbyView {
  stage: 'start' | 'waiting' | 'connecting';
  code: string;
  error: string;
  copied: boolean;
}

export type FairPlayView = { status: 'checking' | 'verified' | 'unverified' } | { status: 'cheated'; detail: string };

export interface HudView {
  screen: Screen;
  online: boolean;
  chatOpen: boolean;
  soundLabel: string;
  fairPlay: FairPlayView | null;
  againLabel: string;
  againDisabled: boolean;
  leaveLabel: string;
  overNote: string;
  lobby: LobbyView;
  notice: { title: string; body: string } | null;
  readyLabel: string;
  howTo: boolean;
  turnLabel: string;
  banner: string;
  tone: 'amber' | 'red' | 'green';
  log: LogLine[];
  mode: Mode;
  abilities: AbilityView[];
  canStart: boolean;
  showRotate: boolean;
  viewLabel: string;
  fleets: { mine: ShipStatus[]; enemy: ShipStatus[] } | null;
  result: { won: boolean; mine: PlayerStats; enemy: PlayerStats } | null;
}

export interface HudHandlers {
  onButton(act: string): void;
  onMode(mode: Mode): void;
  onJoin(code: string): void;
  onChat(text: string): void;
}

const STAT_ROWS: [string, (s: PlayerStats) => string][] = [
  ['Turns taken', (s) => String(s.turns)],
  ['Shells on target', (s) => `${s.hits} of ${s.shots}`],
  ['Accuracy', (s) => `${s.accuracy}%`],
  ['Weapons used', (s) => String(s.abilities)],
  ['Ships lost', (s) => `${s.shipsLost} of ${SHIP_TYPES.length}`],
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') =>
  Object.assign(document.createElement(tag), { className, textContent: text });

const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** DOM overlay. Stateless: call `render` with the full view each time something changes. */
export function createHud({ onButton, onMode, onJoin, onChat }: HudHandlers): { render(view: HudView): void } {
  const $ = (id: string) => document.getElementById(id)!;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-act]')) {
    button.addEventListener('click', () => onButton(button.dataset.act!));
  }
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    onJoin(($('join-code') as HTMLInputElement).value);
  });
  // Keep the chat panel just above the bottom controls, however tall they wrap on a phone.
  const bottom = document.querySelector<HTMLElement>('.hud-bottom')!;
  new ResizeObserver(() => document.documentElement.style.setProperty('--hud-bottom', `${bottom.offsetHeight}px`)).observe(bottom);
  $('chat-chips').replaceChildren(
    ...CHAT_PRESETS.map((text) => {
      const chip = el('button', '', text);
      chip.type = 'button';
      chip.addEventListener('click', () => onChat(text));
      return chip;
    }),
  );
  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chat-input') as HTMLInputElement;
    onChat(input.value);
    input.value = '';
  });

  $('howto-abilities').replaceChildren(
    ...SHIP_TYPES.map((type) => {
      const { ability, cooldown } = SHIPS[type];
      const info = MODE_INFO[ability];
      const li = el('li');
      li.innerHTML = info.icon; // constant SVG
      li.append(el('strong', '', info.label), el('span', 'ship-name', `${capitalize(type)} · reload ${cooldown}`), el('span', 'desc', info.description));
      return li;
    }),
  );

  function slot(a: AbilityView, index: number, active: boolean): HTMLButtonElement {
    const info = MODE_INFO[a.mode];
    const button = el('button', 'slot');
    button.classList.toggle('fire', a.mode === 'shot');
    button.classList.toggle('active', active);
    button.innerHTML = info.icon; // constant SVG
    button.append(el('span', 'name', info.label));
    button.disabled = !a.ready;
    button.title = info.description;
    button.setAttribute('aria-pressed', String(active));

    let note = '';
    if (a.lost) {
      button.classList.add('lost');
      button.append(el('span', 'note', 'Lost'));
      note = ' Lost with its ship.';
    } else if (a.cooldown > 0 && a.mode !== 'shot') {
      const reload = el('span', 'reload');
      reload.style.setProperty('--p', String(a.cooldown / SHIPS[shipForAbility(a.mode)].cooldown));
      button.append(el('span', 'note', a.cooldown === 1 ? '1 turn' : `${a.cooldown} turns`), reload);
      note = ` Ready in ${a.cooldown} turns.`;
    } else {
      button.append(el('kbd', 'key', String(index + 1)));
    }
    button.setAttribute('aria-label', `${info.label}. ${info.description}${note}`);
    button.addEventListener('click', () => onMode(a.mode));
    return button;
  }

  function renderFleet(id: string, ships: ShipStatus[]) {
    $(id).replaceChildren(
      ...ships.map(({ type, sunk }) => {
        const bar = el('div', sunk ? 'ship sunk' : 'ship');
        bar.style.width = `${SHIPS[type].length * 7}px`;
        bar.title = `${capitalize(type)}${sunk ? ', sunk' : ''}`;
        return bar;
      }),
    );
    $(id).setAttribute('aria-label', `${ships.filter((s) => !s.sunk).length} of ${ships.length} ships afloat`);
  }

  let howToOpen = false;

  return {
    render(v) {
      $('title').hidden = v.screen !== 'title';
      $('lobby').hidden = v.screen !== 'lobby';
      $('over').hidden = v.screen !== 'over' || v.notice !== null;
      $('notice').hidden = !v.notice;
      if (v.notice) {
        $('notice-title').textContent = v.notice.title;
        $('notice-body').textContent = v.notice.body;
      }
      const waiting = v.lobby.stage !== 'start';
      $('lobby-start').hidden = waiting;
      $('lobby-wait').hidden = !waiting;
      $('lobby-error').textContent = v.lobby.error;
      $('room-code').textContent = v.lobby.code;
      $('lobby-status').textContent = v.lobby.stage === 'waiting' ? 'Waiting for your opponent to join. Send them the link or the code.' : 'Connecting to your opponent…';
      $('copy-label').textContent = v.lobby.copied ? 'Link copied' : 'Copy invite link';
      $('howto').hidden = !v.howTo;
      // Move focus into the sheet when it opens and back to where it was opened from when it closes.
      if (v.howTo !== howToOpen) {
        howToOpen = v.howTo;
        document.querySelector<HTMLButtonElement>(v.howTo ? '[data-act="close-howto"]' : '[data-act="howto"]')?.focus();
      }
      $('hud').hidden = v.screen === 'title' || v.screen === 'lobby' || v.screen === 'over';
      $('placing').hidden = v.screen !== 'placing';
      $('battle').hidden = v.screen !== 'battle';

      $('turn-label').textContent = v.turnLabel;
      for (const button of document.querySelectorAll<HTMLElement>('.chat-toggle')) button.hidden = !v.online;
      for (const button of document.querySelectorAll<HTMLElement>('.sound-toggle')) button.textContent = v.soundLabel;
      $('chat-panel').hidden = !(v.online && v.chatOpen);
      $('chat-bubbles').hidden = !v.online;
      ($('again') as HTMLButtonElement).disabled = v.againDisabled;
      $('again').textContent = v.againLabel;
      $('leave').textContent = v.leaveLabel;
      $('over-note').textContent = v.overNote;
      const fair = $('fair-play');
      fair.dataset.status = v.fairPlay?.status ?? '';
      fair.textContent = !v.fairPlay ? ''
        : v.fairPlay.status === 'checking' ? 'Checking fair play…'
        : v.fairPlay.status === 'verified' ? 'Fair play verified: every hit and miss they reported matches the fleet they revealed.'
        : v.fairPlay.status === 'cheated' ? `Cheating detected: ${v.fairPlay.detail}.`
        : "Fair play couldn't be checked: your opponent left before revealing their fleet.";

      $('banner').textContent = v.banner;
      ($('banner').parentElement as HTMLElement).dataset.tone = v.tone;
      $('log').replaceChildren(...v.log.map((line) => el('p', line.kind, line.text)));
      ($('start') as HTMLButtonElement).disabled = !v.canStart;
      $('start').textContent = v.readyLabel;
      $('rotate-battle').hidden = !v.showRotate;
      $('view-toggle').innerHTML = `${v.viewLabel} <kbd>V</kbd>`; // constant labels

      $('fleets').hidden = !v.fleets;
      if (v.fleets) {
        renderFleet('fleet-mine', v.fleets.mine);
        renderFleet('fleet-enemy', v.fleets.enemy);
      }
      $('abilities').replaceChildren(...v.abilities.map((a, i) => slot(a, i, a.mode === v.mode)));

      if (v.result) {
        const { won, mine, enemy } = v.result;
        const title = $('result-title');
        title.textContent = won ? 'Victory' : 'Defeat';
        title.className = won ? 'won' : 'lost';
        $('result-sub').textContent = won
          ? `Enemy fleet destroyed in ${mine.turns} turns.`
          : `Your fleet went down on turn ${enemy.turns}.`;
        $('stats').replaceChildren(
          el('span', 'head'), el('span', 'head meta value', 'You'), el('span', 'head meta value', 'Enemy'),
          ...STAT_ROWS.flatMap(([label, value]) => [el('span', 'label', label), el('span', 'value', value(mine)), el('span', 'value', value(enemy))]),
        );
      }
    },
  };
}
