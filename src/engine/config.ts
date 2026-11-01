// All balance numbers live here.

export const BOARD_SIZE = 10;

export const SHIPS = {
  carrier: { length: 5, ability: 'airstrike', cooldown: 4 },
  battleship: { length: 4, ability: 'salvo', cooldown: 3 },
  cruiser: { length: 3, ability: 'radar', cooldown: 3 },
  submarine: { length: 3, ability: 'torpedo', cooldown: 4 },
  destroyer: { length: 2, ability: 'scout', cooldown: 5 },
} as const;

export type ShipType = keyof typeof SHIPS;
export type Ability = (typeof SHIPS)[ShipType]['ability'];

export const SHIP_TYPES = Object.keys(SHIPS) as ShipType[];

export const AIRSTRIKE_LENGTH = 3;
export const RADAR_RADIUS = 1; // 3x3 area

export function shipForAbility(ability: Ability): ShipType {
  return SHIP_TYPES.find((t) => SHIPS[t].ability === ability)!;
}
