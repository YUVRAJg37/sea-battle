import type { Mode } from '../game/targeting';

export type Phase = 'placing' | 'battle' | 'over';

export interface AbilityView {
  mode: Mode;
  label: string;
  ready: boolean;
  note: string; // e.g. turns left on cooldown, or "lost"
}

export interface HudView {
  phase: Phase;
  status: string;
  mode: Mode;
  abilities: AbilityView[];
  canStart: boolean;
  viewLabel: string;
}

export interface HudHandlers {
  onButton(act: string): void;
  onMode(mode: Mode): void;
}

/** DOM overlay. Stateless: call `render` with the full view each time something changes. */
export function createHud({ onButton, onMode }: HudHandlers): { render(view: HudView): void } {
  const $ = (id: string) => document.getElementById(id)!;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-act]')) {
    button.addEventListener('click', () => onButton(button.dataset.act!));
  }

  return {
    render(view) {
      $('status').textContent = view.status;
      for (const phase of ['placing', 'battle', 'over'] as const) $(phase).hidden = view.phase !== phase;
      ($('start') as HTMLButtonElement).disabled = !view.canStart;
      $('view-toggle').textContent = view.viewLabel;
      $('abilities').replaceChildren(
        ...view.abilities.map((a) => {
          const button = document.createElement('button');
          button.textContent = a.label;
          if (a.note) button.append(Object.assign(document.createElement('small'), { textContent: a.note }));
          button.disabled = !a.ready;
          button.classList.toggle('active', a.mode === view.mode);
          button.setAttribute('aria-pressed', String(a.mode === view.mode));
          button.addEventListener('click', () => onMode(a.mode));
          return button;
        }),
      );
    },
  };
}
