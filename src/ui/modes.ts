import type { Mode } from '../game/targeting';

const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Display name, help text and icon for each thing the player can fire. */
export const MODE_INFO: Record<Mode, { label: string; description: string; icon: string }> = {
  shot: {
    label: 'Fire',
    description: 'Fire one shell at a cell.',
    icon: icon('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  },
  airstrike: {
    label: 'Airstrike',
    description: 'Hits 3 cells in a line. Rotate to turn it.',
    icon: icon('<path d="M12 2c1 0 1.5 1 1.5 2v5l7 4v2l-7-2v4l2 2v1.5L12 19l-3.5 1.5V19l2-2v-4l-7 2v-2l7-4V4c0-1 .5-2 1.5-2z"/>'),
  },
  salvo: {
    label: 'Salvo',
    description: 'Fire at two cells this turn.',
    icon: icon('<circle cx="7.5" cy="12" r="4.5"/><circle cx="16.5" cy="12" r="4.5"/>'),
  },
  radar: {
    label: 'Radar',
    description: 'Counts ship cells in a 3×3 area.',
    icon: icon('<circle cx="12" cy="12" r="1.5"/><path d="M12 12l6-6"/><path d="M20 12a8 8 0 1 1-4-6.9"/><path d="M16 12a4 4 0 1 1-2-3.5"/>'),
  },
  torpedo: {
    label: 'Torpedo',
    description: 'Runs along a row and hits the first ship. Rotate to switch the side it launches from.',
    icon: icon('<rect x="2" y="9" width="15" height="6" rx="3"/><path d="M17 12h3M20 9l2 3-2 3"/>'),
  },
  scout: {
    label: 'Scout',
    description: 'Reveals one enemy ship cell.',
    icon: icon('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  },
};
