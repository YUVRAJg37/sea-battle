// All balance numbers live here.

export const BOARD_SIZE = 10;

export const SHIPS = {
  carrier: { length: 5, ability: 'airstrike', cooldown: 4 },
  battleship: { length: 4, ability: 'salvo', cooldown: 3 },
  cruiser: { length: 3, ability: 'radar', cooldown: 3 },
  submarine: { length: 3, ability: 'torpedo', cooldown: 4 },
  destroyer: { length: 2, ability: 'ricochet', cooldown: 3 },
} as const;

export type ShipType = keyof typeof SHIPS;
export type Ability = (typeof SHIPS)[ShipType]['ability'];

export const SHIP_TYPES = Object.keys(SHIPS) as ShipType[];

/** Everything placed on the board: the warships plus the decoy, a one-cell fake that reports hits but never sinks. */
export type PieceType = ShipType | 'decoy';
export const PIECE_TYPES: PieceType[] = [...SHIP_TYPES, 'decoy'];
export const pieceLength = (type: PieceType): number => (type === 'decoy' ? 1 : SHIPS[type].length);

export const AIRSTRIKE_LENGTH = 3;
export const RADAR_RADIUS = 1; // 3x3 area
export const RICOCHET_SKIP = 2; // a missed ricochet lands this many cells further on

export function shipForAbility(ability: Ability): ShipType {
  return SHIP_TYPES.find((t) => SHIPS[t].ability === ability)!;
}
