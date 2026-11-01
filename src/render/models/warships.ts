import * as THREE from 'three';
import { SHIPS, type ShipType } from '../../engine';
import { barrel, box, hull, merge, paint, place, post, type Part } from './parts';

// Every model runs along +x from 0 to its length in cells, centered on z = 0, waterline at y = 0.

const C = {
  hull: 0x7d8b99,
  bottom: 0x8a3b32, // anti-fouling red, seen when a ship rolls over
  deck: 0x55616c,
  superstructure: 0xc9d1d8,
  turret: 0x93a1ae,
  gun: 0x3c4650,
  funnel: 0x2d3640,
  flightDeck: 0x3b434b,
  marking: 0xe8e8e8,
  amber: 0xffc857,
  sub: 0x2b333b,
  window: 0x1b2833,
};

/** Rotating gun turret with `barrels` guns pointing along +x (or aft when `aft`). */
function turret(x: number, deckY: number, barrels: number, scale = 1, aft = false): Part[] {
  const s = scale;
  const parts = [
    post(0.15 * s, 0.05, [0, 0.025, 0], C.deck, 8),
    box([0.34 * s, 0.13 * s, 0.26 * s], [0, 0.11 * s, 0], C.turret),
  ];
  for (let i = 0; i < barrels; i++) {
    const z = (i - (barrels - 1) / 2) * 0.08 * s;
    parts.push(barrel(0.025 * s, 0.32 * s, [0.12 * s, 0.11 * s, z], C.gun));
  }
  return parts.map((p) => place(p, aft ? Math.PI : 0, [x, deckY, 0]));
}

/** Stacked bridge block with a row of dark windows facing the bow. */
function bridge(x: number, deckY: number, length: number, height: number, width: number): Part[] {
  return [
    box([length, height, width], [x, deckY + height / 2, 0], C.superstructure),
    box([length * 0.7, height * 0.8, width * 0.8], [x - length * 0.1, deckY + height * 1.4, 0], C.superstructure),
    box([0.02, height * 0.25, width * 0.7], [x + length * 0.25 + 0.01, deckY + height * 1.55, 0], C.window),
  ];
}

function funnel(x: number, deckY: number, height: number, radius: number): Part[] {
  return [
    post(radius, height, [x, deckY + height / 2, 0], C.funnel, 8),
    post(radius * 1.05, 0.04, [x, deckY + height, 0], 0x111111, 8),
  ];
}

function mast(x: number, deckY: number, height: number): Part[] {
  return [
    post(0.02, height, [x, deckY + height / 2, 0], C.gun, 5),
    box([0.04, 0.02, 0.22], [x, deckY + height * 0.75, 0], C.gun),
    box([0.08, 0.05, 0.08], [x, deckY + height, 0], C.superstructure),
  ];
}

function carrier(): Part[] {
  const L = SHIPS.carrier.length;
  const deckY = 0.42;
  const parts = [
    hull({ length: L, beam: 0.62, freeboard: 0.32, draft: 0.14, bow: 0.22 }, { top: C.hull, bottom: C.bottom, deck: C.deck }),
    // Flight deck overhangs the hull, wider to port.
    box([L - 0.25, 0.06, 0.8], [L / 2 - 0.05, deckY - 0.03, -0.05], C.flightDeck),
    box([L - 0.6, 0.065, 0.025], [L / 2 - 0.1, deckY, -0.05], C.marking),
    box([0.5, 0.066, 0.025], [L * 0.75, deckY, -0.2], C.amber),
    // Island on the starboard edge.
    box([0.7, 0.32, 0.16], [L * 0.55, deckY + 0.16, 0.27], C.superstructure),
    box([0.03, 0.06, 0.13], [L * 0.55 + 0.36, deckY + 0.26, 0.27], C.window),
    ...mast(L * 0.52, deckY + 0.32, 0.3).map((p) => p.translate(0, 0, 0.27)),
  ];
  // A few parked jets.
  for (const [x, z] of [[0.7, -0.25], [1.1, -0.25], [1.5, -0.25], [3.6, 0.0]] as const) {
    parts.push(
      box([0.22, 0.03, 0.05], [x, deckY + 0.03, z], C.turret),
      box([0.07, 0.025, 0.2], [x - 0.02, deckY + 0.03, z], C.turret),
    );
  }
  return parts;
}

function battleship(): Part[] {
  const L = SHIPS.battleship.length;
  const deckY = 0.28;
  return [
    hull({ length: L, beam: 0.64, freeboard: deckY, draft: 0.16, bow: 0.28 }, { top: C.hull, bottom: C.bottom, deck: C.deck }),
    ...turret(L * 0.74, deckY, 3, 1.1),
    ...turret(L * 0.62, deckY + 0.08, 3, 1.1),
    box([0.3, 0.08, 0.3], [L * 0.62, deckY + 0.04, 0], C.deck),
    ...turret(L * 0.16, deckY, 3, 1.1, true),
    ...bridge(L * 0.46, deckY, 0.55, 0.22, 0.34),
    ...funnel(L * 0.34, deckY, 0.32, 0.09),
    ...mast(L * 0.44, deckY + 0.5, 0.35),
  ];
}

function cruiser(): Part[] {
  const L = SHIPS.cruiser.length;
  const deckY = 0.26;
  return [
    hull({ length: L, beam: 0.58, freeboard: deckY, draft: 0.14, bow: 0.3 }, { top: C.hull, bottom: C.bottom, deck: C.deck }),
    ...turret(L * 0.74, deckY, 2),
    ...turret(L * 0.18, deckY, 2, 1, true),
    ...bridge(L * 0.52, deckY, 0.5, 0.2, 0.3),
    ...funnel(L * 0.36, deckY, 0.26, 0.08),
    ...mast(L * 0.5, deckY + 0.46, 0.32),
  ];
}

function destroyer(): Part[] {
  const L = SHIPS.destroyer.length;
  const deckY = 0.22;
  return [
    hull({ length: L, beam: 0.5, freeboard: deckY, draft: 0.12, bow: 0.35 }, { top: C.hull, bottom: C.bottom, deck: C.deck }),
    ...turret(L * 0.72, deckY, 1, 0.9),
    ...bridge(L * 0.5, deckY, 0.4, 0.17, 0.26),
    ...funnel(L * 0.32, deckY, 0.2, 0.06),
    ...mast(L * 0.47, deckY + 0.38, 0.28),
  ];
}

function submarine(): Part[] {
  const L = SHIPS.submarine.length;
  const radius = 0.2;
  const body = new THREE.CapsuleGeometry(radius, L - 2 * radius - 0.3, 4, 10).rotateZ(Math.PI / 2).scale(1, 0.85, 1);
  return [
    paint(body.translate(L / 2, -0.04, 0), C.sub),
    // Sail (conning tower) with dive planes, and a cross-shaped tail.
    box([0.42, 0.28, 0.12], [L * 0.62, 0.24, 0], C.sub),
    box([0.08, 0.02, 0.4], [L * 0.62, 0.3, 0], C.sub),
    post(0.015, 0.16, [L * 0.66, 0.46, 0], C.gun, 5),
    box([0.2, 0.02, 0.36], [0.28, -0.04, 0], C.sub),
    box([0.2, 0.3, 0.02], [0.28, -0.04, 0], C.sub),
  ];
}

const BUILDERS: Record<ShipType, () => Part[]> = { carrier, battleship, cruiser, destroyer, submarine };
const cache = new Map<ShipType, THREE.BufferGeometry>();

/** One merged, vertex-colored geometry per ship type (cached). */
export function warshipGeometry(type: ShipType): THREE.BufferGeometry {
  let geometry = cache.get(type);
  if (!geometry) cache.set(type, (geometry = merge(BUILDERS[type]())));
  return geometry;
}

/** Hull width at midships, used to size the foam ring around each ship. */
export const BEAM: Record<ShipType, number> = { carrier: 0.8, battleship: 0.64, cruiser: 0.58, destroyer: 0.5, submarine: 0.4 };
