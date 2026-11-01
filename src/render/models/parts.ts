import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Small toolkit for building low-poly models from primitives. Every part is non-indexed (so flat
 * shading is per face) and carries a vertex color, so a whole ship merges into one geometry and
 * draws in a single call.
 */

export type Part = THREE.BufferGeometry;

export function paint(geometry: THREE.BufferGeometry, color: number): Part {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Only position + color, so parts merge with the hand-built hull; normals are computed after merging.
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

export function box(size: [number, number, number], at: [number, number, number], color: number): Part {
  return paint(new THREE.BoxGeometry(...size).translate(...at), color);
}

/** Cylinder standing up (axis along y). */
export function post(radius: number, height: number, at: [number, number, number], color: number, segments = 8): Part {
  return paint(new THREE.CylinderGeometry(radius, radius, height, segments).translate(...at), color);
}

/** Cylinder lying along +x, starting at `at`. */
export function barrel(radius: number, length: number, at: [number, number, number], color: number): Part {
  return paint(
    new THREE.CylinderGeometry(radius * 0.8, radius, length, 6).rotateZ(-Math.PI / 2).translate(at[0] + length / 2, at[1], at[2]),
    color,
  );
}

/** Applies a rotation about y (around the part's own origin) then a translation. */
export function place(part: Part, rotationY: number, at: [number, number, number]): Part {
  return part.rotateY(rotationY).translate(...at);
}

export function merge(parts: Part[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('model parts have mismatched attributes');
  merged.computeVertexNormals();
  return merged;
}

/** Box whose top face is scaled by `taper`, giving sloped, stealthy-looking sides. */
export function block(size: [number, number, number], at: [number, number, number], color: number, taper = 0.8): Part {
  const g = new THREE.BoxGeometry(...size);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setXYZ(i, pos.getX(i) * taper, pos.getY(i), pos.getZ(i) * taper);
  }
  return paint(g.translate(...at), color);
}

export function ball(radius: number, at: [number, number, number], color: number): Part {
  return paint(new THREE.IcosahedronGeometry(radius, 1).translate(...at), color);
}

/** Flat ring lying on the deck (helipad circle). */
export function deckRing(radius: number, at: [number, number, number], color: number): Part {
  return paint(new THREE.TorusGeometry(radius, 0.012, 3, 20).rotateX(Math.PI / 2).translate(...at), color);
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

const STATIONS = 14;
const BOOT = 0.045; // height of the waterline stripe

/**
 * Lofted hull along +x from 0 to `length`: square-ish stern, flared pointed bow with a slight
 * sheer, and a dark stripe at the waterline.
 */
export function hull(s: HullSpec, colors: HullColors): Part {
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    const deckHalf = (s.beam / 2) * halfWidth(t, s.bow);
    const waterHalf = (s.beam / 2) * 0.9 * halfWidth(t, s.bow * 1.25); // finer at the waterline: the bow flares out above it
    const deck = s.freeboard + Math.max(0, t - 0.7) * 0.35; // bow rises a little
    const x = t * s.length;
    // Port deck edge → down to the keel → up to the starboard deck edge.
    rings.push([
      new THREE.Vector3(x, deck, -deckHalf),
      new THREE.Vector3(x, BOOT, -waterHalf),
      new THREE.Vector3(x, 0, -waterHalf * 0.98),
      new THREE.Vector3(x, -s.draft, -waterHalf * 0.35),
      new THREE.Vector3(x, -s.draft, waterHalf * 0.35),
      new THREE.Vector3(x, 0, waterHalf * 0.98),
      new THREE.Vector3(x, BOOT, waterHalf),
      new THREE.Vector3(x, deck, deckHalf),
    ]);
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
    return lo < 0 ? colors.bottom : hi <= BOOT + 1e-6 ? colors.boot : colors.top;
  };

  for (let i = 0; i < STATIONS; i++) {
    const [r, n] = [rings[i]!, rings[i + 1]!];
    for (let k = 0; k < last; k++) {
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

/** Width profile 0..1 along the hull: narrower stern, full midships, pointed bow. */
function halfWidth(t: number, bow: number): number {
  if (t < 0.1) return 0.82 + (t / 0.1) * 0.18;
  const bowStart = 1 - Math.min(bow, 0.6);
  if (t <= bowStart) return 1;
  const u = (t - bowStart) / (1 - bowStart);
  return 1 - u ** 1.6;
}
