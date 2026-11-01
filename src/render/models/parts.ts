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

export interface HullSpec {
  length: number;
  beam: number; // full width at the widest point
  freeboard: number; // deck height above the waterline
  draft: number; // keel depth below the waterline
  bow: number; // fraction of the length that tapers to the bow
}

const STATIONS = 12;

/**
 * Lofted hull along +x from 0 to `length`: square-ish stern, pointed bow with a slight sheer.
 * Hull sides above the waterline get `topColor`, below it `bottomColor`, the deck `deckColor`.
 */
export function hull(s: HullSpec, colors: { top: number; bottom: number; deck: number }): Part {
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= STATIONS; i++) {
    const t = i / STATIONS;
    const half = (s.beam / 2) * halfWidth(t, s.bow);
    const deck = s.freeboard + Math.max(0, t - 0.75) * 0.3; // bow rises a little
    const x = t * s.length;
    // Port deck edge → down to the keel → up to the starboard deck edge.
    rings.push([
      new THREE.Vector3(x, deck, -half),
      new THREE.Vector3(x, 0, -half * 0.96),
      new THREE.Vector3(x, -s.draft, -half * 0.35),
      new THREE.Vector3(x, -s.draft, half * 0.35),
      new THREE.Vector3(x, 0, half * 0.96),
      new THREE.Vector3(x, deck, half),
    ]);
  }

  const positions: number[] = [];
  const vertexColors: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: number) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const col = new THREE.Color(color);
    for (let k = 0; k < 3; k++) vertexColors.push(col.r, col.g, col.b);
  };

  for (let i = 0; i < STATIONS; i++) {
    const [r, n] = [rings[i]!, rings[i + 1]!];
    for (let k = 0; k < 5; k++) {
      const color = Math.min(r[k]!.y, r[k + 1]!.y) < 0 ? colors.bottom : colors.top;
      tri(r[k]!, n[k + 1]!, r[k + 1]!, color);
      tri(r[k]!, n[k]!, n[k + 1]!, color);
    }
    tri(r[0]!, r[5]!, n[5]!, colors.deck);
    tri(r[0]!, n[5]!, n[0]!, colors.deck);
  }
  const stern = rings[0]!;
  const center = new THREE.Vector3(0, (s.freeboard - s.draft) / 2, 0);
  for (let k = 0; k < 6; k++) tri(center, stern[k]!, stern[(k + 1) % 6]!, colors.top);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  return geometry;
}

/** Width profile 0..1 along the hull: narrower stern, full midships, pointed bow. */
function halfWidth(t: number, bow: number): number {
  if (t < 0.12) return 0.8 + (t / 0.12) * 0.2;
  const bowStart = 1 - bow;
  if (t <= bowStart) return 1;
  const u = (t - bowStart) / bow;
  return 1 - u ** 1.7;
}
