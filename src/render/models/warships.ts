import * as THREE from 'three';
import { SHIPS, type ShipType } from '../../engine';
import { ball, barrel, block, capsule, deckRing, hull, merge, paint, place, post, strip, type Part } from './parts';
import { palette, type Palette, type PaletteName } from './palettes';

// Every model runs along +x (stern → bow) from 0 to its length in cells, centered on z = 0,
// waterline at y = 0. Starboard is +z.

/** Gun turret on the centerline: `barrels` guns pointing to the bow, or aft. */
function turret(p: Palette, x: number, deckY: number, barrels: number, scale = 1, aft = false): Part[] {
  const s = scale;
  const parts = [
    post(0.16 * s, 0.05, [0, 0.025, 0], p.trim, 16),
    block([0.36 * s, 0.14 * s, 0.28 * s], [0, 0.12 * s, 0], p.superstructure, 0.82),
  ];
  for (let i = 0; i < barrels; i++) {
    const z = (i - (barrels - 1) / 2) * 0.075 * s;
    parts.push(barrel(0.024 * s, 0.34 * s, [0.12 * s, 0.12 * s, z], p.gun));
  }
  return parts.map((part) => place(part, aft ? Math.PI : 0, [x, deckY, 0]));
}

/** Modern single-barrel gun in a sloped housing. */
function modernGun(p: Palette, x: number, deckY: number): Part[] {
  return [
    block([0.25, 0.11, 0.21], [x, deckY + 0.055, 0], p.superstructure, 0.7),
    barrel(0.02, 0.28, [x + 0.06, deckY + 0.075, 0], p.gun),
  ];
}

/** Grid of missile launch cells set into the deck. */
function vls(p: Palette, x: number, deckY: number, length: number, width: number): Part[] {
  const parts = [block([length, 0.03, width], [x, deckY + 0.012, 0], p.trim)];
  for (let i = 1; i < 4; i++) parts.push(strip([0.01, 0.032, width * 0.9], [x - length / 2 + (i * length) / 4, deckY + 0.013, 0], p.gun));
  return parts;
}

/** Helicopter landing spot: circle and an H. */
function helipad(p: Palette, x: number, deckY: number, radius: number): Part[] {
  const y = deckY + 0.008;
  return [
    deckRing(radius, [x, y, 0], p.marking),
    strip([0.014, 0.01, radius * 1.1], [x - radius * 0.3, y, 0], p.marking),
    strip([0.014, 0.01, radius * 1.1], [x + radius * 0.3, y, 0], p.marking),
    strip([radius * 0.6, 0.01, 0.014], [x, y, 0], p.marking),
  ];
}

/** Close-in weapon system: white dome on a pedestal. */
function ciws(p: Palette, x: number, y: number, z = 0): Part[] {
  return [post(0.035, 0.05, [x, y + 0.025, z], p.superstructure), ball(0.042, [x, y + 0.075, z], 0xffffff)];
}

/** Tapered mast with a yard, a radar panel and a radome on top. */
function mast(p: Palette, x: number, y: number, height: number, z = 0): Part[] {
  return [
    post(0.035, height, [x, y + height / 2, z], p.trim, 8, 0.012),
    strip([0.025, 0.015, 0.26], [x, y + height * 0.7, z], p.trim),
    block([0.03, 0.06, 0.15], [x + 0.03, y + height * 0.5, z], p.trim),
    ball(0.05, [x, y + height + 0.02, z], 0xffffff),
  ];
}

/** Superstructure block with a band of dark bridge windows on the forward face. */
function bridge(p: Palette, x: number, y: number, size: [number, number, number], taper = 0.86): Part[] {
  const [l, h, w] = size;
  const frontX = x + (l / 2) * (1 - (1 - taper) * 0.8);
  return [
    block(size, [x, y + h / 2, 0], p.superstructure, taper),
    strip([0.012, h * 0.22, w * taper * 0.86], [frontX, y + h * 0.75, 0], p.window),
  ];
}

/** Oval funnel with a dark cap. */
function funnel(p: Palette, x: number, y: number, height: number, radius: number): Part[] {
  return [
    paint(new THREE.CylinderGeometry(radius * 0.85, radius, height, 16).scale(1.4, 1, 1).translate(x, y + height / 2, 0), p.funnel),
    paint(new THREE.CylinderGeometry(radius * 0.8, radius * 0.85, 0.035, 16).scale(1.4, 1, 1).translate(x, y + height + 0.017, 0), 0x14181c),
  ];
}

/** Lifeboats slung along both sides. */
function lifeboats(p: Palette, xs: number[], y: number, z: number): Part[] {
  return xs.flatMap((x) => [-z, z].map((side) => capsule(0.032, 0.12, [x, y, side], p.accent)));
}

/** Parked jet: fuselage, swept wings, tail. Points along +x. */
function jet(p: Palette, x: number, y: number, z: number, heading: number): Part[] {
  const parts = [
    capsule(0.02, 0.2, [0, 0, 0], p.superstructure),
    block([0.1, 0.012, 0.22], [-0.01, 0, 0], p.superstructure, 0.45),
    block([0.04, 0.06, 0.012], [-0.1, 0.03, 0], p.superstructure),
    block([0.05, 0.01, 0.1], [-0.1, 0.004, 0], p.superstructure),
  ];
  return parts.map((part) => place(part, heading, [x, y + 0.025, z]));
}

/**
 * Angled landing strip from the stern toward the port bow: a lighter band with a dashed centre line.
 * Wide shapes rather than hairlines, so the diagonal doesn't alias into stair-steps.
 */
function angledDeck(p: Palette, deckY: number): Part[] {
  const [length, angle, center] = [2.6, 0.12, new THREE.Vector3(1.6, deckY + 0.004, -0.2)];
  const band = place(strip([length, 0.004, 0.24], [0, 0, 0], p.deck), angle, [center.x, center.y, center.z]);
  const dashes = Array.from({ length: 8 }, (_, i) =>
    place(strip([0.16, 0.004, 0.03], [-length / 2 + 0.2 + i * 0.31, 0, 0], p.marking), angle, [center.x, center.y + 0.002, center.z]),
  );
  return [band, ...dashes];
}

function carrier(p: Palette): Part[] {
  const L = SHIPS.carrier.length;
  const deckY = 0.42;
  const parts: Part[] = [
    hull({ length: L, beam: 0.64, freeboard: 0.3, draft: 0.14, bow: 0.22 }, { top: p.hull, boot: p.boot, bottom: p.bottom, deck: p.deck }),
    // Flight deck overhangs the hull, wider to port, with a centerline, an angled landing line and elevators.
    block([L - 0.15, 0.08, 0.86], [L / 2, deckY - 0.04, -0.06], p.flightDeck, 0.97),
    strip([L - 0.8, 0.005, 0.02], [L / 2 + 0.2, deckY + 0.003, -0.06], p.marking),
    ...angledDeck(p, deckY),
    strip([0.34, 0.006, 0.26], [L * 0.3, deckY + 0.002, 0.2], p.trim),
    strip([0.34, 0.006, 0.26], [L * 0.72, deckY + 0.002, -0.38], p.trim),
    // Island on the starboard edge.
    ...bridge(p, L * 0.55, deckY, [0.62, 0.22, 0.15], 0.9).map((part) => part.translate(0, 0, 0.3)),
    block([0.36, 0.14, 0.12], [L * 0.57, deckY + 0.29, 0.3], p.superstructure, 0.85),
    ...funnel(p, L * 0.5, deckY + 0.22, 0.12, 0.05).map((part) => part.translate(0, 0, 0.3)),
    ...mast(p, L * 0.58, deckY + 0.36, 0.26, 0.3),
    ...ciws(p, L * 0.95, deckY, -0.3),
    ...ciws(p, 0.15, deckY, 0.3),
  ];
  for (const [x, z, h] of [[0.5, -0.3, 0.6], [0.85, -0.3, 0.6], [1.2, -0.3, 0.6], [1.55, 0.18, -0.6], [3.9, 0.12, 0], [4.2, 0.12, 0]] as const) {
    parts.push(...jet(p, x, deckY, z, h));
  }
  return parts;
}

function battleship(p: Palette): Part[] {
  const L = SHIPS.battleship.length;
  const deckY = 0.28;
  return [
    hull({ length: L, beam: 0.66, freeboard: deckY, draft: 0.16, bow: 0.32 }, { top: p.hull, boot: p.boot, bottom: p.bottom, deck: p.deck }),
    ...turret(p, L * 0.78, deckY, 3, 1.15),
    block([0.34, 0.08, 0.32], [L * 0.66, deckY + 0.04, 0], p.deck),
    ...turret(p, L * 0.66, deckY + 0.08, 3, 1.15),
    ...turret(p, L * 0.15, deckY, 3, 1.15, true),
    ...bridge(p, L * 0.5, deckY, [0.7, 0.16, 0.4]),
    ...bridge(p, L * 0.52, deckY + 0.16, [0.42, 0.16, 0.3]),
    ...bridge(p, L * 0.54, deckY + 0.32, [0.22, 0.14, 0.18]),
    ...funnel(p, L * 0.36, deckY, 0.34, 0.09),
    ...mast(p, L * 0.28, deckY, 0.42),
    ...[0.4, 0.58].flatMap((f) => [-0.22, 0.22].flatMap((z) => turret(p, 0, 0, 2, 0.45).map((part) => part.translate(L * f, deckY, z)))),
    ...lifeboats(p, [L * 0.3, L * 0.44], deckY + 0.08, 0.3),
  ];
}

function cruiser(p: Palette): Part[] {
  const L = SHIPS.cruiser.length;
  const deckY = 0.26;
  return [
    hull({ length: L, beam: 0.58, freeboard: deckY, draft: 0.14, bow: 0.34 }, { top: p.hull, boot: p.boot, bottom: p.bottom, deck: p.deck }),
    ...modernGun(p, L * 0.84, deckY),
    ...vls(p, L * 0.71, deckY, 0.3, 0.22),
    ...bridge(p, L * 0.52, deckY, [0.72, 0.24, 0.42]),
    block([0.42, 0.14, 0.32], [L * 0.5, deckY + 0.31, 0], p.superstructure, 0.8),
    strip([0.012, 0.1, 0.13], [L * 0.5 + 0.18, deckY + 0.3, 0.07], p.trim),
    strip([0.012, 0.1, 0.13], [L * 0.5 + 0.18, deckY + 0.3, -0.07], p.trim),
    ...mast(p, L * 0.47, deckY + 0.38, 0.3),
    ...funnel(p, L * 0.36, deckY + 0.1, 0.16, 0.06),
    ...vls(p, L * 0.27, deckY, 0.22, 0.2),
    ...ciws(p, L * 0.62, deckY + 0.24),
    ...helipad(p, L * 0.1, deckY, 0.13),
    ...lifeboats(p, [L * 0.42], deckY + 0.08, 0.27),
  ];
}

function destroyer(p: Palette): Part[] {
  const L = SHIPS.destroyer.length;
  const deckY = 0.22;
  return [
    hull({ length: L, beam: 0.5, freeboard: deckY, draft: 0.12, bow: 0.4 }, { top: p.hull, boot: p.boot, bottom: p.bottom, deck: p.deck }),
    ...modernGun(p, L * 0.8, deckY),
    ...vls(p, L * 0.67, deckY, 0.2, 0.18),
    ...bridge(p, L * 0.46, deckY, [0.5, 0.2, 0.34], 0.78),
    ...mast(p, L * 0.44, deckY + 0.2, 0.3),
    ...funnel(p, L * 0.32, deckY + 0.04, 0.14, 0.05),
    ...ciws(p, L * 0.25, deckY),
    ...helipad(p, L * 0.1, deckY, 0.11),
  ];
}

function submarine(p: Palette): Part[] {
  const L = SHIPS.submarine.length;
  return [
    capsule(0.2, L - 0.65, [L / 2, -0.06, 0], p.sub),
    block([L - 0.8, 0.04, 0.14], [L / 2 + 0.05, 0.1, 0], p.sub),
    post(0.026, 0.014, [L * 0.35, 0.125, 0], p.trim),
    post(0.026, 0.014, [L * 0.8, 0.125, 0], p.trim),
    block([0.44, 0.26, 0.13], [L * 0.64, 0.24, 0], p.sub, 0.78),
    block([0.11, 0.02, 0.44], [L * 0.66, 0.28, 0], p.sub),
    post(0.012, 0.18, [L * 0.66, 0.46, 0.02], p.trim, 6),
    post(0.012, 0.13, [L * 0.62, 0.43, -0.02], p.trim, 6),
    block([0.18, 0.02, 0.34], [0.26, -0.05, 0], p.sub),
    block([0.18, 0.3, 0.02], [0.26, -0.05, 0], p.sub),
    barrel(0.035, 0.04, [0.04, -0.06, 0], 0x9a7b45),
  ];
}

const BUILDERS: Record<ShipType, (p: Palette) => Part[]> = { carrier, battleship, cruiser, destroyer, submarine };
const cache = new Map<string, THREE.BufferGeometry>();

/** One merged, vertex-colored geometry per ship type and palette (cached). */
export function warshipGeometry(type: ShipType, paletteName: PaletteName = 'naval'): THREE.BufferGeometry {
  const key = `${type}:${paletteName}`;
  let geometry = cache.get(key);
  if (!geometry) cache.set(key, (geometry = merge(BUILDERS[type](palette(paletteName, type)))));
  return geometry;
}

/** Hull width at midships, used to size the foam ring around each ship. */
export const BEAM: Record<ShipType, number> = { carrier: 0.8, battleship: 0.66, cruiser: 0.58, destroyer: 0.5, submarine: 0.4 };
