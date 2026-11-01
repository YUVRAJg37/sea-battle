import * as THREE from 'three';
import { SHIPS, type ShipType } from '../../engine';
import { ball, barrel, block, box, deckRing, hull, merge, paint, place, post, type HullColors, type Part } from './parts';

// Every model runs along +x (stern → bow) from 0 to its length in cells, centered on z = 0,
// waterline at y = 0. Starboard is +z.

const C = {
  hull: 0x8796a4, // haze gray
  boot: 0x1c2228, // waterline stripe
  bottom: 0x8a3b32, // anti-fouling red, seen when a ship rolls over
  deck: 0x56616b,
  superstructure: 0xc3ccd4,
  dark: 0x3c4650,
  gun: 0x2f3841,
  funnel: 0x2a323a,
  window: 0x14202a,
  white: 0xeef2f5,
  amber: 0xffc857,
  orange: 0xff8a3d, // lifeboats
  flightDeck: 0x394149,
  sub: 0x262d34,
};

const HULL: HullColors = { top: C.hull, boot: C.boot, bottom: C.bottom, deck: C.deck };

/** Gun turret on the centerline: `barrels` guns pointing to the bow, or aft. */
function turret(x: number, deckY: number, barrels: number, scale = 1, aft = false): Part[] {
  const s = scale;
  const parts = [
    post(0.15 * s, 0.05, [0, 0.025, 0], C.dark, 10),
    block([0.36 * s, 0.13 * s, 0.28 * s], [0, 0.115 * s, 0], C.superstructure, 0.8),
  ];
  for (let i = 0; i < barrels; i++) {
    const z = (i - (barrels - 1) / 2) * 0.075 * s;
    parts.push(barrel(0.024 * s, 0.34 * s, [0.12 * s, 0.11 * s, z], C.gun));
  }
  return parts.map((p) => place(p, aft ? Math.PI : 0, [x, deckY, 0]));
}

/** Modern single-barrel gun in a faceted housing. */
function modernGun(x: number, deckY: number): Part[] {
  return [
    block([0.24, 0.1, 0.2], [x, deckY + 0.05, 0], C.superstructure, 0.65),
    barrel(0.018, 0.28, [x + 0.06, deckY + 0.07, 0], C.gun),
  ];
}

/** Grid of vertical missile launch cells set into the deck. */
function vls(x: number, deckY: number, length: number, width: number): Part[] {
  const parts = [box([length, 0.02, width], [x, deckY + 0.01, 0], C.dark)];
  for (let i = 1; i < 4; i++) parts.push(box([0.008, 0.022, width], [x - length / 2 + (i * length) / 4, deckY + 0.011, 0], C.gun));
  parts.push(box([length, 0.022, 0.008], [x, deckY + 0.011, 0], C.gun));
  return parts;
}

/** Helicopter landing spot: white circle and an H. */
function helipad(x: number, deckY: number, radius: number): Part[] {
  const y = deckY + 0.008;
  return [
    deckRing(radius, [x, y, 0], C.white),
    box([0.012, 0.01, radius * 1.1], [x - radius * 0.3, y, 0], C.white),
    box([0.012, 0.01, radius * 1.1], [x + radius * 0.3, y, 0], C.white),
    box([radius * 0.6, 0.01, 0.012], [x, y, 0], C.white),
  ];
}

/** Close-in weapon system: small white dome on a pedestal. */
function ciws(x: number, y: number, z = 0): Part[] {
  return [post(0.035, 0.05, [x, y + 0.025, z], C.superstructure, 8), ball(0.04, [x, y + 0.07, z], C.white)];
}

/** Tapered lattice-style mast with a yard, a radar panel and a radome on top. */
function mast(x: number, y: number, height: number, z = 0): Part[] {
  return [
    block([0.08, height, 0.08], [x, y + height / 2, z], C.dark, 0.35),
    box([0.03, 0.015, 0.26], [x, y + height * 0.7, z], C.dark),
    box([0.02, 0.05, 0.14], [x + 0.03, y + height * 0.5, z], C.dark),
    ball(0.045, [x, y + height + 0.02, z], C.white),
  ];
}

/** Superstructure block with a band of dark bridge windows on the forward face. */
function bridge(x: number, y: number, size: [number, number, number], taper = 0.85): Part[] {
  const [l, h, w] = size;
  return [
    block(size, [x, y + h / 2, 0], C.superstructure, taper),
    box([0.012, h * 0.22, w * taper * 0.9], [x + (l * (1 + taper)) / 4 + 0.003, y + h * 0.78, 0], C.window),
  ];
}

function funnel(x: number, y: number, height: number, radius: number): Part[] {
  return [
    paint(new THREE.CylinderGeometry(radius * 0.85, radius, height, 10).scale(1.4, 1, 1).translate(x, y + height / 2, 0), C.funnel),
    post(radius * 0.9, 0.03, [x, y + height + 0.015, 0], 0x0d0f11, 10),
  ];
}

/** Orange lifeboats slung along both sides. */
function lifeboats(xs: number[], y: number, z: number): Part[] {
  return xs.flatMap((x) =>
    [-z, z].map((side) => paint(new THREE.CapsuleGeometry(0.03, 0.12, 2, 6).rotateZ(Math.PI / 2).translate(x, y, side), C.orange)),
  );
}

/** Parked jet: fuselage, swept wings, tail. Points along +x. */
function jet(x: number, y: number, z: number, heading: number): Part[] {
  const parts = [
    box([0.24, 0.025, 0.035], [0, 0, 0], C.superstructure),
    block([0.1, 0.01, 0.2], [-0.01, 0, 0], C.superstructure, 0.4),
    box([0.04, 0.05, 0.01], [-0.1, 0.03, 0], C.superstructure),
    box([0.05, 0.008, 0.09], [-0.1, 0.005, 0], C.superstructure),
  ];
  return parts.map((p) => place(p, heading, [x, y + 0.02, z]));
}

function carrier(): Part[] {
  const L = SHIPS.carrier.length;
  const deckY = 0.42;
  const parts: Part[] = [
    hull({ length: L, beam: 0.64, freeboard: 0.3, draft: 0.14, bow: 0.2 }, HULL),
    // Flight deck overhangs the hull, wider to port, with a centerline, an angled landing line and two elevators.
    block([L - 0.15, 0.08, 0.86], [L / 2, deckY - 0.04, -0.06], C.flightDeck, 0.96),
    box([L - 0.8, 0.005, 0.018], [L / 2 + 0.2, deckY + 0.003, -0.06], C.white),
    place(box([2.4, 0.005, 0.018], [0, 0, 0], C.white), 0.16, [L * 0.42, deckY + 0.003, -0.2]),
    place(box([2.4, 0.005, 0.012], [0, 0, 0], C.amber), 0.16, [L * 0.42, deckY + 0.003, -0.32]),
    box([0.34, 0.006, 0.26], [L * 0.3, deckY + 0.002, 0.2], 0x2c3238),
    box([0.34, 0.006, 0.26], [L * 0.72, deckY + 0.002, -0.38], 0x2c3238),
    // Island on the starboard edge: two tiers, a funnel and a mast.
    ...bridge(L * 0.55, deckY, [0.62, 0.22, 0.15], 0.9).map((p) => p.translate(0, 0, 0.3)),
    block([0.36, 0.14, 0.12], [L * 0.57, deckY + 0.29, 0.3], C.superstructure, 0.85),
    ...funnel(L * 0.5, deckY + 0.22, 0.12, 0.05).map((p) => p.translate(0, 0, 0.3)),
    ...mast(L * 0.58, deckY + 0.36, 0.26, 0.3),
    ...ciws(L * 0.95, deckY, -0.3),
    ...ciws(0.15, deckY, 0.3),
  ];
  for (const [x, z, h] of [[0.5, -0.3, 0.6], [0.85, -0.3, 0.6], [1.2, -0.3, 0.6], [1.55, 0.18, -0.6], [3.9, 0.12, 0], [4.2, 0.12, 0]] as const) {
    parts.push(...jet(x, deckY, z, h));
  }
  return parts;
}

function battleship(): Part[] {
  const L = SHIPS.battleship.length;
  const deckY = 0.28;
  return [
    hull({ length: L, beam: 0.66, freeboard: deckY, draft: 0.16, bow: 0.3 }, HULL),
    ...turret(L * 0.78, deckY, 3, 1.15),
    box([0.34, 0.08, 0.32], [L * 0.66, deckY + 0.04, 0], C.deck),
    ...turret(L * 0.66, deckY + 0.08, 3, 1.15),
    ...turret(L * 0.15, deckY, 3, 1.15, true),
    // Tiered tower bridge.
    ...bridge(L * 0.5, deckY, [0.7, 0.16, 0.4]),
    ...bridge(L * 0.52, deckY + 0.16, [0.42, 0.16, 0.3]),
    ...bridge(L * 0.54, deckY + 0.32, [0.22, 0.14, 0.18]),
    ...funnel(L * 0.36, deckY, 0.34, 0.09),
    ...mast(L * 0.28, deckY, 0.42),
    // Secondary guns along both sides.
    ...[0.4, 0.58].flatMap((f) => [-0.22, 0.22].flatMap((z) => turret(0, 0, 2, 0.45).map((p) => p.translate(L * f, deckY, z)))),
    ...lifeboats([L * 0.3, L * 0.44], deckY + 0.08, 0.3),
  ];
}

function cruiser(): Part[] {
  const L = SHIPS.cruiser.length;
  const deckY = 0.26;
  return [
    hull({ length: L, beam: 0.58, freeboard: deckY, draft: 0.14, bow: 0.32 }, HULL),
    ...modernGun(L * 0.84, deckY),
    ...vls(L * 0.71, deckY, 0.3, 0.22),
    ...bridge(L * 0.52, deckY, [0.72, 0.24, 0.42]),
    block([0.42, 0.14, 0.32], [L * 0.5, deckY + 0.31, 0], C.superstructure, 0.8),
    // Flat radar arrays on the forward faces.
    box([0.01, 0.1, 0.14], [L * 0.5 + 0.19, deckY + 0.3, 0.07], C.dark),
    box([0.01, 0.1, 0.14], [L * 0.5 + 0.19, deckY + 0.3, -0.07], C.dark),
    ...mast(L * 0.47, deckY + 0.38, 0.3),
    ...funnel(L * 0.36, deckY + 0.1, 0.16, 0.06),
    ...vls(L * 0.27, deckY, 0.22, 0.2),
    ...ciws(L * 0.62, deckY + 0.24),
    ...helipad(L * 0.1, deckY, 0.13),
    ...lifeboats([L * 0.42], deckY + 0.08, 0.27),
  ];
}

function destroyer(): Part[] {
  const L = SHIPS.destroyer.length;
  const deckY = 0.22;
  return [
    hull({ length: L, beam: 0.5, freeboard: deckY, draft: 0.12, bow: 0.38 }, HULL),
    ...modernGun(L * 0.8, deckY),
    ...vls(L * 0.67, deckY, 0.2, 0.18),
    ...bridge(L * 0.46, deckY, [0.5, 0.2, 0.34], 0.78),
    ...mast(L * 0.44, deckY + 0.2, 0.3),
    ...funnel(L * 0.32, deckY + 0.04, 0.14, 0.05),
    ...ciws(L * 0.25, deckY),
    ...helipad(L * 0.1, deckY, 0.11),
  ];
}

function submarine(): Part[] {
  const L = SHIPS.submarine.length;
  const radius = 0.2;
  const body = new THREE.CapsuleGeometry(radius, L - 2 * radius - 0.25, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.8, 1);
  return [
    paint(body.translate(L / 2, -0.06, 0), C.sub),
    // Flat casing along the top, with hatches.
    box([L - 0.8, 0.03, 0.12], [L / 2 + 0.05, 0.1, 0], 0x2e363e),
    post(0.025, 0.012, [L * 0.35, 0.12, 0], C.dark, 8),
    post(0.025, 0.012, [L * 0.8, 0.12, 0], C.dark, 8),
    // Sail (conning tower) with dive planes, periscopes and a mast.
    block([0.44, 0.26, 0.13], [L * 0.64, 0.24, 0], C.sub, 0.75),
    box([0.1, 0.018, 0.44], [L * 0.66, 0.28, 0], C.sub),
    post(0.012, 0.18, [L * 0.66, 0.46, 0.02], C.dark, 5),
    post(0.012, 0.13, [L * 0.62, 0.43, -0.02], C.dark, 5),
    // Cross-shaped tail and a propeller hub.
    box([0.18, 0.02, 0.34], [0.26, -0.05, 0], C.sub),
    box([0.18, 0.3, 0.02], [0.26, -0.05, 0], C.sub),
    barrel(0.035, 0.04, [0.04, -0.06, 0], 0x6b5a3c),
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
export const BEAM: Record<ShipType, number> = { carrier: 0.8, battleship: 0.66, cruiser: 0.58, destroyer: 0.5, submarine: 0.4 };
