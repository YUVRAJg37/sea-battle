import * as THREE from 'three';
import { ball, block, capsule, merge, paint, post, type Part } from './models/parts';
import { outline, toonMaterial } from './shipMaterial';
import { WATER_LEVEL, waveHeight } from './water';
import type { Effects } from './effects';

// Small details that make the sea feel alive. Everything stays off the two grids (x ∈ ±[2, 12],
// z ∈ [-5, 5]) so nothing can be mistaken for a shot marker.

const material = toonMaterial();

function toonMesh(parts: Part[]): THREE.Mesh {
  const geometry = merge(parts);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.add(outline(geometry));
  return mesh;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/**
 * Where sea life can surface (beyond the near and far edges, or in the gap) and a heading that
 * runs parallel to the nearest grid edge, so a leap never crosses a board.
 */
function surfacingSpot(): { from: THREE.Vector3; heading: number } {
  const zone = pick(['near', 'far', 'gap'] as const);
  const flip = Math.random() < 0.5 ? Math.PI : 0;
  if (zone === 'gap') return { from: new THREE.Vector3(rand(-1, 1), 0, rand(-3, 3)), heading: Math.PI / 2 + flip };
  return { from: new THREE.Vector3(rand(-9, 9), 0, zone === 'near' ? rand(6.2, 7.5) : rand(-7.5, -6.2)), heading: flip };
}

/** Tilts and lifts an object so it rides the swell at its (x, z). */
function float(object: THREE.Object3D, time: number, sink = 0.02): void {
  const { x, z } = object.position;
  object.position.y = waveHeight(x, z, time) - sink;
  object.rotation.x = (waveHeight(x, z + 0.3, time) - waveHeight(x, z - 0.3, time)) * 1.2;
  object.rotation.z = -(waveHeight(x + 0.3, z, time) - waveHeight(x - 0.3, z, time)) * 1.2;
}

// --- Buoys -----------------------------------------------------------------

interface Buoy {
  mesh: THREE.Mesh;
  lamp: THREE.MeshBasicMaterial;
  color: THREE.Color;
  phase: number;
}

function buoy(color: number, x: number, z: number): Buoy {
  const mesh = toonMesh([
    post(0.2, 0.1, [0, 0.05, 0], 0x2a3138, 16),
    post(0.15, 0.32, [0, 0.26, 0], color, 16, 0.06),
    post(0.13, 0.06, [0, 0.22, 0], 0xf1f4f7, 16, 0.11),
    post(0.012, 0.16, [0.04, 0.5, 0], 0x2a3138, 5),
    post(0.012, 0.16, [-0.04, 0.5, 0], 0x2a3138, 5),
  ]);
  const lamp = new THREE.MeshBasicMaterial({ color });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), lamp);
  bulb.position.y = 0.6;
  mesh.add(bulb);
  mesh.position.set(x, 0, z);
  return { mesh, lamp, color: new THREE.Color(color), phase: Math.random() * 3 };
}

// --- Floating debris --------------------------------------------------------

function crate(): Part[] {
  return [block([0.26, 0.2, 0.26], [0, 0.05, 0], 0x9a6b3f), block([0.27, 0.03, 0.27], [0, 0.1, 0], 0x7a5230)];
}

function barrel(): Part[] {
  return [
    paint(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 14).rotateZ(Math.PI / 2), 0xc4472e),
    paint(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 14).rotateZ(Math.PI / 2).translate(0.08, 0, 0), 0x2a3138),
    paint(new THREE.CylinderGeometry(0.105, 0.105, 0.03, 14).rotateZ(Math.PI / 2).translate(-0.08, 0, 0), 0x2a3138),
  ];
}

function log(): Part[] {
  return [capsule(0.06, 0.55, [0, 0, 0], 0x6b4a2e), post(0.02, 0.12, [0.1, 0.06, 0.03], 0x6b4a2e, 5)];
}

// --- Leapers: dolphins and fish ---------------------------------------------

function dolphin(): THREE.Mesh {
  return toonMesh([
    capsule(0.085, 0.42, [0, 0, 0], 0x6d8fa8),
    capsule(0.06, 0.3, [0.02, -0.03, 0], 0xd5e2ec), // pale belly
    capsule(0.025, 0.08, [0.33, -0.01, 0], 0x6d8fa8), // snout
    block([0.12, 0.12, 0.02], [0.02, 0.1, 0], 0x5a7a92, 0.35), // dorsal fin
    block([0.06, 0.015, 0.22], [-0.3, 0, 0], 0x5a7a92, 0.6), // flukes
  ]);
}

function fish(): THREE.Mesh {
  return toonMesh([capsule(0.025, 0.09, [0, 0, 0], 0xc9d6df), block([0.04, 0.05, 0.008], [-0.08, 0, 0], 0xa9b9c4, 0.4)]);
}

interface Leap {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  heading: number;
  length: number;
  height: number;
  duration: number;
  t: number;
  splashed: boolean;
}

// --- Distant scenery ---------------------------------------------------------

function rock(x: number, z: number, size: number): Part {
  return paint(new THREE.IcosahedronGeometry(size, 0).scale(1, 0.55, 0.9).translate(x, size * 0.15, z), 0x5d6670);
}

const BEAM_LENGTH = 9;

/** Light cone that fades out along its length, so it has no visible end. */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0xffe7a8) } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      void main() {
        vAlong = position.x / ${BEAM_LENGTH.toFixed(1)}; // 0 at the lamp, 1 at the far end
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlong;
      void main() { gl_FragColor = vec4(uColor, pow(1.0 - vAlong, 2.0) * 0.16); }
    `,
  });
}

function lighthouseIsland(): { mesh: THREE.Mesh; beam: THREE.Mesh } {
  const tower: Part[] = [
    post(1.8, 0.2, [0, 0.05, 0], 0xd9c79b, 20), // sand
    rock(-0.9, 0.3, 0.9),
    rock(0.8, -0.4, 0.7),
    rock(0.3, 0.9, 0.5),
    ball(0.35, [-1.1, 0.35, -0.6], 0x3f7d4f),
    ball(0.28, [1.1, 0.3, 0.5], 0x3f7d4f),
    post(0.32, 2.2, [0, 1.3, 0], 0xf1f4f7, 16, 0.22),
  ];
  for (const y of [0.7, 1.5]) tower.push(post(0.3, 0.3, [0, y, 0], 0xc4372e, 16, 0.27));
  tower.push(post(0.34, 0.06, [0, 2.42, 0], 0x2a3138, 16), post(0.18, 0.3, [0, 2.6, 0], 0xffe7a8, 12), post(0.24, 0.3, [0, 2.9, 0], 0xc4372e, 12, 0.02));
  const mesh = toonMesh(tower);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, BEAM_LENGTH, 16, 1, true).rotateZ(Math.PI / 2).translate(BEAM_LENGTH / 2, 0, 0), beamMaterial());
  beam.position.y = 2.6;
  mesh.add(beam);
  return { mesh, beam };
}

function palmIsland(): THREE.Mesh {
  const parts: Part[] = [post(1.5, 0.2, [0, 0.05, 0], 0xd9c79b, 20), rock(0.7, 0.5, 0.6), rock(-0.8, -0.3, 0.45)];
  for (const [x, z, lean] of [[-0.3, 0.2, 0.25], [0.3, -0.3, -0.2]] as const) {
    parts.push(paint(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6).translate(0, 0.7, 0).rotateZ(lean).translate(x, 0.1, z), 0x7a5a3a));
    const topX = x - Math.sin(lean) * 1.4;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(paint(new THREE.BoxGeometry(0.7, 0.03, 0.16).translate(0.32, 0, 0).rotateZ(-0.35).rotateY(a).translate(topX, 1.5, z), 0x3f8f52));
    }
  }
  return toonMesh(parts);
}

function whale(): { back: THREE.Mesh; fluke: THREE.Mesh } {
  return {
    back: toonMesh([paint(new THREE.SphereGeometry(1, 16, 10).scale(1.6, 0.4, 0.55), 0x2f3d4a), block([0.3, 0.2, 0.04], [-0.6, 0.38, 0], 0x2f3d4a, 0.4)]),
    fluke: toonMesh([block([0.25, 0.5, 0.1], [0, 0.25, 0], 0x2f3d4a, 0.6), block([0.2, 0.08, 1.1], [0, 0.55, 0], 0x2f3d4a, 0.7)]),
  };
}

/** Buoys, debris, leaping dolphins and fish, distant islands and a whale. Returns a per-frame update. */
export function createOceanLife(scene: THREE.Scene, effects: Effects): (dt: number, time: number) => void {
  // Channel buoys down the gap between the grids: red to port, green to starboard.
  const buoys = [buoy(0xd23b30, -1.3, -3.6), buoy(0x2fa65a, 1.3, -1.2), buoy(0xd23b30, -1.3, 1.2), buoy(0x2fa65a, 1.3, 3.6)];
  for (const b of buoys) scene.add(b.mesh);

  const debris = [
    [crate, -9, 6.6], [barrel, -4, -6.8], [log, 4.5, 6.9], [crate, 10, -6.5], [barrel, 0.4, 6.2], [log, -11.5, -6.6],
  ].map(([build, x, z]) => {
    const mesh = toonMesh((build as () => Part[])());
    mesh.position.set(x as number, 0, z as number);
    mesh.rotation.y = Math.random() * Math.PI;
    scene.add(mesh);
    return { mesh, home: mesh.position.clone(), phase: Math.random() * 10 };
  });

  const { mesh: lighthouse, beam } = lighthouseIsland();
  lighthouse.position.set(-17, -0.3, -26);
  const palms = palmIsland();
  palms.position.set(15, -0.3, -30);
  palms.rotation.y = 0.6;
  const islet = toonMesh([rock(0, 0, 1.1), rock(0.9, 0.4, 0.6)]);
  islet.position.set(27, -0.3, -19);
  scene.add(lighthouse, palms, islet);

  const leaps: Leap[] = [];
  const dolphins = [dolphin(), dolphin()];
  const fishes = [fish(), fish(), fish()];
  for (const m of [...dolphins, ...fishes]) {
    m.visible = false;
    scene.add(m);
  }
  let nextDolphin = rand(3, 6);
  let nextFish = rand(1, 3);

  /** Queues a leap; `delay` seconds pass (hidden) before it breaks the surface. */
  const startLeap = (mesh: THREE.Mesh, from: THREE.Vector3, heading: number, length: number, height: number, duration: number, delay = 0) => {
    if (leaps.some((l) => l.mesh === mesh)) return;
    leaps.push({ mesh, from, heading, length, height, duration, t: -delay / duration, splashed: false });
  };
  const splash = (at: THREE.Vector3, big: boolean) => effects.droplets(at, big ? 11 : 4, big ? 2.3 : 1.2, big ? 0.12 : 0.06);

  const { back, fluke } = whale();
  back.visible = fluke.visible = false;
  scene.add(back, fluke);
  let whaleClock = rand(6, 10); // counts down to the next surfacing, then runs the surfacing
  let whaleT = -1;
  const whaleSpot = new THREE.Vector3();

  return (dt, time) => {
    for (const b of buoys) {
      float(b.mesh, time, 0.05);
      const on = (time + b.phase) % 2.4 < 0.5;
      b.lamp.color.copy(b.color).multiplyScalar(on ? 1.6 : 0.25);
    }

    for (const d of debris) {
      d.mesh.position.x = d.home.x + Math.sin(time * 0.08 + d.phase) * 0.6;
      d.mesh.position.z = d.home.z + Math.cos(time * 0.06 + d.phase) * 0.3;
      float(d.mesh, time);
    }

    beam.rotation.y = time * 0.8;

    // Spawn leapers now and then; dolphins come in pairs.
    if ((nextDolphin -= dt) <= 0) {
      nextDolphin = rand(7, 13);
      const { from, heading } = surfacingSpot();
      startLeap(dolphins[0]!, from, heading, 2.2, 0.9, 1.3);
      // The second dolphin follows a beat later, alongside and further from the grids.
      const side = Math.abs(from.z) > 5 ? new THREE.Vector3(0, 0, 0.4 * Math.sign(from.z)) : new THREE.Vector3(-0.4 * Math.sign(from.x || 1), 0, 0);
      startLeap(dolphins[1]!, from.clone().add(side), heading, 2.1, 0.8, 1.25, 0.28);
    }
    if ((nextFish -= dt) <= 0) {
      nextFish = rand(1.5, 4);
      const mesh = fishes.find((f) => !f.visible);
      const { from, heading } = surfacingSpot();
      if (mesh) startLeap(mesh, from, heading, 0.6, 0.35, 0.55);
    }

    for (const leap of leaps) {
      const before = leap.t;
      leap.t = Math.min(1, leap.t + dt / leap.duration);
      if (leap.t < 0) continue;
      if (before <= 0) {
        leap.mesh.visible = true;
        splash(leap.from.clone().setY(WATER_LEVEL), leap.length > 1);
      }
      const dir = new THREE.Vector3(Math.cos(leap.heading), 0, -Math.sin(leap.heading));
      const ground = waveHeight(leap.from.x, leap.from.z, time);
      leap.mesh.position.copy(leap.from).addScaledVector(dir, leap.length * leap.t);
      leap.mesh.position.y = ground - 0.1 + leap.height * 4 * leap.t * (1 - leap.t);
      leap.mesh.rotation.set(0, leap.heading, Math.atan((leap.height * 4 * (1 - 2 * leap.t)) / leap.length));
      if (leap.t > 0.92 && !leap.splashed) {
        leap.splashed = true;
        splash(leap.mesh.position.clone().setY(ground), leap.length > 1);
      }
      if (leap.t >= 1) leap.mesh.visible = false;
    }
    for (let i = leaps.length - 1; i >= 0; i--) if (leaps[i]!.t >= 1) leaps.splice(i, 1);

    // A whale surfaces far out, swimming along +x: back rolls up, spouts, then the tail flicks as it dives.
    if (whaleT < 0) {
      if ((whaleClock -= dt) <= 0) {
        whaleT = 0;
        whaleSpot.set(rand(-20, 20), 0, rand(-24, -16));
      }
    } else {
      whaleT += dt / 6;
      const water = waveHeight(whaleSpot.x, whaleSpot.z, time);
      const surfacing = Math.sin(Math.min(1, whaleT / 0.7) * Math.PI); // up and back down over the first 70%
      back.visible = whaleT < 0.7;
      back.position.set(whaleSpot.x + whaleT * 2, water - 0.45 + surfacing * 0.45, whaleSpot.z);
      if (whaleT > 0.25 && whaleT - dt / 6 <= 0.25) effects.spout(back.position.clone().setY(water + 0.3));
      fluke.visible = whaleT > 0.68 && whaleT < 0.95;
      fluke.position.set(whaleSpot.x + 1.8, water - 0.6 + Math.sin(((whaleT - 0.68) / 0.27) * Math.PI) * 0.8, whaleSpot.z);
      if (whaleT >= 1) {
        whaleT = -1;
        whaleClock = rand(14, 22);
      }
    }
  };
}
