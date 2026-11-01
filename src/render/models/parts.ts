import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Small toolkit for building stylized models from primitives. Every part carries only position
 * and a vertex color, so a whole ship merges into one geometry and draws in a single call.
 * Normals are computed once after merging, smooth across gentle curves and creased at hard edges.
 */

export type Part = THREE.BufferGeometry;

const CREASE = THREE.MathUtils.degToRad(40);

export function paint(geometry: THREE.BufferGeometry, color: number): Part {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

/** Box with softly rounded edges; `taper` < 1 shrinks the top face for sloped sides. */
export function block(size: [number, number, number], at: [number, number, number], color: number, taper = 1): Part {
  const radius = Math.min(0.025, Math.min(...size) * 0.3);
  const g = new RoundedBoxGeometry(...size, 2, radius);
  if (taper !== 1) {
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const lift = (pos.getY(i) / size[1] + 0.5) * (1 - taper); // 0 at the bottom face, 1 - taper at the top
      pos.setXYZ(i, pos.getX(i) * (1 - lift), pos.getY(i), pos.getZ(i) * (1 - lift));
    }
  }
  return paint(g.translate(...at), color);
}

/** Thin flat strip (deck markings, window bands) — too thin to round. */
export function strip(size: [number, number, number], at: [number, number, number], color: number): Part {
  return paint(new THREE.BoxGeometry(...size).translate(...at), color);
}

/** Cylinder standing up (axis along y). */
export function post(radius: number, height: number, at: [number, number, number], color: number, segments = 12, topRadius = radius): Part {
  return paint(new THREE.CylinderGeometry(topRadius, radius, height, segments).translate(...at), color);
}

/** Gun barrel lying along +x, starting at `at`, with a slight taper. */
export function barrel(radius: number, length: number, at: [number, number, number], color: number): Part {
  return paint(
    new THREE.CylinderGeometry(radius * 0.8, radius, length, 8).rotateZ(-Math.PI / 2).translate(at[0] + length / 2, at[1], at[2]),
    color,
  );
}

export function ball(radius: number, at: [number, number, number], color: number): Part {
  return paint(new THREE.SphereGeometry(radius, 12, 8).translate(...at), color);
}

/** Capsule lying along +x, centered on `at`. */
export function capsule(radius: number, length: number, at: [number, number, number], color: number): Part {
  return paint(new THREE.CapsuleGeometry(radius, length, 3, 10).rotateZ(Math.PI / 2).translate(...at), color);
}

/** Flat ring lying on the deck (helipad circle). */
export function deckRing(radius: number, at: [number, number, number], color: number): Part {
  return paint(new THREE.TorusGeometry(radius, 0.012, 3, 24).rotateX(Math.PI / 2).translate(...at), color);
}

/** Rotates a part about y (around the world origin, so build it at the origin first) then moves it. */
export function place(part: Part, rotationY: number, at: [number, number, number]): Part {
  return part.rotateY(rotationY).translate(...at);
}

export function merge(parts: Part[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('model parts have mismatched attributes');
  return toCreasedNormals(merged, CREASE);
}

export interface HullSpec {
  length: number;
  beam: number; // full width of the deck at the widest point
  freeboard: number; // deck height above the waterline
  draft: number; // keel depth below the waterline
  bow: number; // fraction of the length that tapers to the bow
}

export interface HullColors {
  top: number;
  boot: number; // stripe along the waterline
  bottom: number;
  deck: number;
}

const STATIONS = 24;
const BOOT = 0.045; // height of the waterline stripe

/**
 * Lofted hull along +x from 0 to `length`: rounded stern, flared pointed bow with a sheer line,
 * round bilges and a dark stripe at the waterline.
 */
export function hull(s: HullSpec, colors: HullColors): Part {
  // Half-section from the deck edge down to the keel, as (width share, height) pairs.
  const section: [number, number][] = [
    [1, s.freeboard],
    [0.97, s.freeboard * 0.5],
    [0.92, BOOT],
    [0.9, 0],
    [0.84, -s.draft * 0.45],
    [0.62, -s.draft * 0.85],
    [0.25, -s.draft],
  ];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    const deckHalf = (s.beam / 2) * halfWidth(t, s.bow);
    const lowHalf = (s.beam / 2) * halfWidth(t, s.bow * 1.25); // finer below: the bow flares out above the water
    const sheer = Math.max(0, t - 0.65) ** 1.5 * 0.5; // bow rises
    const x = t * s.length;
    const side = section.map(([w, y], k) => {
      const half = k < 2 ? deckHalf : lowHalf;
      return new THREE.Vector3(x, y + (k < 2 ? sheer * (k === 0 ? 1 : 0.5) : 0), -half * w);
    });
    // Port side top → keel, then the mirror back up to the starboard deck edge.
    rings.push([...side, ...side.slice().reverse().map((v) => new THREE.Vector3(v.x, v.y, -v.z))]);
  }
  const last = rings[0]!.length - 1;

  const positions: number[] = [];
  const vertexColors: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const col = new THREE.Color(color);
    for (let k = 0; k < 3; k++) vertexColors.push(col.r, col.g, col.b);
  };
  const stripColor = (a: THREE.Vector3, b: THREE.Vector3) => {
    const [lo, hi] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    return lo < -1e-6 ? colors.bottom : hi <= BOOT + 1e-6 ? colors.boot : colors.top;
  };

  for (let i = 0; i < STATIONS; i++) {
    const [r, n] = [rings[i]!, rings[i + 1]!];
    for (let k = 0; k < last; k++) {
      if (r[k]!.z === r[k + 1]!.z && r[k]!.y === r[k + 1]!.y) continue; // zero-width strip at the bow tip
      const color = stripColor(r[k]!, r[k + 1]!);
      tri(r[k]!, n[k + 1]!, r[k + 1]!, color);
      tri(r[k]!, n[k]!, n[k + 1]!, color);
    }
    tri(r[0]!, r[last]!, n[last]!, colors.deck);
    tri(r[0]!, n[last]!, n[0]!, colors.deck);
  }
  const stern = rings[0]!;
  const center = new THREE.Vector3(0, (s.freeboard - s.draft) / 2, 0);
  for (let k = 0; k <= last; k++) tri(center, stern[k]!, stern[(k + 1) % (last + 1)]!, colors.top);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  return geometry;
}

/** Width profile 0..1 along the hull: rounded stern, full midships, curved pointed bow. */
function halfWidth(t: number, bow: number): number {
  if (t < 0.12) return 0.78 + 0.22 * Math.sin((t / 0.12) * (Math.PI / 2));
  const bowStart = 1 - Math.min(bow, 0.6);
  if (t <= bowStart) return 1;
  const u = (t - bowStart) / (1 - bowStart);
  return Math.cos(u * (Math.PI / 2)) ** 0.8;
}
