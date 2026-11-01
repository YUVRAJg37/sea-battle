import { Color } from 'three';
import type { ShipType } from '../../engine';

/** Paint roles every warship model uses. */
export interface Palette {
  hull: number;
  boot: number; // waterline stripe
  bottom: number; // below the waterline, seen when a ship rolls over
  deck: number;
  superstructure: number;
  trim: number; // masts, radar, small fittings
  gun: number;
  funnel: number;
  window: number;
  accent: number; // lifeboats, trim lines
  marking: number; // deck lines, helipads
  flightDeck: number;
  sub: number;
}

export type PaletteName = 'teamMine' | 'teamEnemy' | 'naval' | 'vivid';

const TEAM_MINE: Palette = {
  hull: 0x24406b,
  boot: 0xf1f4f7,
  bottom: 0xb7413a,
  deck: 0x2f8f83,
  superstructure: 0xf1f4f7,
  trim: 0x3b4a5e,
  gun: 0x27323f,
  funnel: 0x24406b,
  window: 0x0f2233,
  accent: 0xffc857,
  marking: 0xf1f4f7,
  flightDeck: 0x2c3a4a,
  sub: 0x1f3352,
};

const TEAM_ENEMY: Palette = {
  hull: 0x2e3036,
  boot: 0xd94a3d,
  bottom: 0x6e2222,
  deck: 0x5b2b2f,
  superstructure: 0xdcd5ce,
  trim: 0x45474e,
  gun: 0x1d1e22,
  funnel: 0xb2342f,
  window: 0x1a1214,
  accent: 0xe05b4f,
  marking: 0xe8ded5,
  flightDeck: 0x2a2b30,
  sub: 0x25262b,
};

const NAVAL: Palette = {
  hull: 0x8a9aa9,
  boot: 0x1c2228,
  bottom: 0xb7413a,
  deck: 0x4b5661,
  superstructure: 0xf0f2f4,
  trim: 0x46525e,
  gun: 0x323b45,
  funnel: 0x2a323a,
  window: 0x14202a,
  accent: 0xff8a3d,
  marking: 0xffffff,
  flightDeck: 0x3a424a,
  sub: 0x2a3138,
};

const VIVID_HULLS: Record<ShipType, number> = {
  carrier: 0x3a7bd5,
  battleship: 0xd64545,
  cruiser: 0x2eb872,
  destroyer: 0xf2b632,
  submarine: 0x7b5cd6,
};

export function palette(name: PaletteName, type: ShipType): Palette {
  if (name === 'teamMine') return TEAM_MINE;
  if (name === 'teamEnemy') return TEAM_ENEMY;
  if (name === 'naval') return NAVAL;
  const hull = VIVID_HULLS[type];
  return {
    ...NAVAL,
    hull,
    funnel: hull,
    sub: hull,
    boot: 0xffffff,
    deck: new Color(hull).lerp(new Color(0xffffff), 0.45).getHex(), // decks carry the class colour too: it's what you see from above
    superstructure: 0xffffff,
    accent: 0xffd34d,
    flightDeck: 0x3d4652,
  };
}
