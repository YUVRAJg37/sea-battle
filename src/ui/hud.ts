import { SHIPS, SHIP_TYPES, shipForAbility, type ShipType } from '../engine';
import type { Mode } from '../game/targeting';
import type { PlayerStats } from '../game/stats';
import { MODE_INFO } from './modes';

export type Screen = 'title' | 'placing' | 'battle' | 'over';

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

export interface HudView {
  screen: Screen;
  howTo: boolean;
  banner: string;
  bannerTone: 'amber' | 'red' | 'green';
  status: string;
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
}

const STAT_ROWS: [string, (s: PlayerStats) => string][] = [
  ['Turns', (s) => String(s.turns)],
  ['Shells landed', (s) => `${s.hits} / ${s.shots}`],
  ['Accuracy', (s) => `${s.accuracy}%`],
  ['Abilities used', (s) => String(s.abilities)],
  ['Ships lost', (s) => `${s.shipsLost} / ${SHIP_TYPES.length}`],
];

/** DOM overlay. Stateless: call `render` with the full view each time something changes. */
export function createHud({ onButton, onMode }: HudHandlers): { render(view: HudView): void } {
  const $ = (id: string) => document.getElementById(id)!;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-act]')) {
    button.addEventListener('click', () => onButton(button.dataset.act!));
  }

  $('howto-abilities').replaceChildren(
    ...SHIP_TYPES.map((type) => {
      const { ability, cooldown } = SHIPS[type];
      const info = MODE_INFO[ability];
      const li = document.createElement('li');
      li.innerHTML = `${info.icon}<strong>${info.label}</strong>`; // constant markup, no user data
      li.append(span(`${info.description} ${capitalize(type)}, recharges in ${cooldown} turns.`));
      return li;
    }),
  );

  function abilityButton(a: AbilityView, active: boolean): HTMLButtonElement {
    const info = MODE_INFO[a.mode];
    const button = document.createElement('button');
    button.className = 'ability';
    button.innerHTML = info.icon; // constant SVG
    button.append(span(info.label));
    button.title = info.description;
    button.disabled = !a.ready;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    let note = '';
    if (a.lost) {
      button.classList.add('lost');
      button.append(span('Lost', 'badge'));
      note = ' Lost with its ship.';
    } else if (a.cooldown > 0 && a.mode !== 'shot') {
      button.classList.add('cooling');
      button.style.setProperty('--p', String(a.cooldown / SHIPS[shipForAbility(a.mode)].cooldown));
      button.append(span(String(a.cooldown), 'badge'));
      note = ` Ready in ${a.cooldown} turns.`;
    }
    button.setAttribute('aria-label', `${info.label}. ${info.description}${note}`);
    button.addEventListener('click', () => onMode(a.mode));
    return button;
  }

  function renderFleet(id: string, ships: ShipStatus[]) {
    $(id).replaceChildren(
      ...ships.map(({ type, sunk }) => {
        const bar = document.createElement('div');
        bar.className = sunk ? 'ship sunk' : 'ship';
        bar.style.width = `${SHIPS[type].length * 7}px`;
        bar.title = `${capitalize(type)}${sunk ? ' (sunk)' : ''}`;
        return bar;
      }),
    );
    $(id).setAttribute('aria-label', `${ships.filter((s) => !s.sunk).length} of ${ships.length} ships afloat`);
  }

  return {
    render(v) {
      $('title').hidden = v.screen !== 'title';
      $('over').hidden = v.screen !== 'over';
      $('howto').hidden = !v.howTo;
      $('hud').hidden = v.screen === 'title';
      $('panel').hidden = v.screen === 'over';
      $('placing').hidden = v.screen !== 'placing';
      $('battle').hidden = v.screen !== 'battle';

      $('banner').textContent = v.banner;
      $('banner').dataset.tone = v.bannerTone;
      $('status').textContent = v.status;
      ($('start') as HTMLButtonElement).disabled = !v.canStart;
      $('rotate-battle').hidden = !v.showRotate;
      $('view-toggle').textContent = v.viewLabel;

      $('fleets').hidden = !v.fleets;
      if (v.fleets) {
        renderFleet('fleet-mine', v.fleets.mine);
        renderFleet('fleet-enemy', v.fleets.enemy);
      }
      $('abilities').replaceChildren(...v.abilities.map((a) => abilityButton(a, a.mode === v.mode)));

      if (v.result) {
        const { won, mine, enemy } = v.result;
        $('result-title').textContent = won ? 'Victory' : 'Defeat';
        $('result-title').style.color = won ? 'var(--green)' : 'var(--red)';
        $('stats').querySelector('tbody')!.replaceChildren(
          ...STAT_ROWS.map(([label, value]) => {
            const tr = document.createElement('tr');
            for (const text of [label, value(mine), value(enemy)]) tr.append(Object.assign(document.createElement('td'), { textContent: text }));
            return tr;
          }),
        );
      }
    },
  };
}

function span(text: string, className = ''): HTMLSpanElement {
  return Object.assign(document.createElement('span'), { textContent: text, className });
}

const capitalize = (s: string) => s[0]!.toUpperCase() + s.slice(1);
