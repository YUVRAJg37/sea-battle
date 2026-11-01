import * as THREE from 'three';
import { THEME } from './theme';

const GRAVITY = 9.8;
const FIRE_INTERVAL = 0.07;
const cube = new THREE.BoxGeometry(1, 1, 1);
const shellGeo = new THREE.SphereGeometry(0.13, 8, 6);
const torpedoGeo = new THREE.CapsuleGeometry(0.09, 0.5, 2, 6).rotateZ(Math.PI / 2);
const pingGeo = new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2);
const materials = new Map<number, THREE.MeshBasicMaterial>();

function material(color: number): THREE.MeshBasicMaterial {
  let m = materials.get(color);
  if (!m) materials.set(color, (m = new THREE.MeshBasicMaterial({ color })));
  return m;
}

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
const jitter = (spread: number) => (Math.random() - 0.5) * spread;

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number; // 1 → 0
  decay: number; // life lost per second
  gravity: number;
  size: number;
  grow: number; // smoke grows as it fades, sparks shrink
}

interface Anim {
  t: number; // 0 → 1
  duration: number;
  step(t: number): void;
  done(): void;
}

/** Particles, persistent fires and short animations (shell flights, pings). */
export class Effects {
  private particles: Particle[] = [];
  private fires: { at: THREE.Vector3; clock: number }[] = [];
  private anims: Anim[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Runs `step(t)` every frame with t going 0 → 1 over `duration` seconds. */
  animate(duration: number, step: (t: number) => void): Promise<void> {
    return new Promise((done) => this.anims.push({ t: 0, duration, step, done }));
  }

  explosion(at: THREE.Vector3): void {
    for (let i = 0; i < 18; i++) {
      this.spawn(at, pick(THEME.fire), new THREE.Vector3(jitter(4), 2 + Math.random() * 3, jitter(4)), { life: 0.8 });
    }
    for (let i = 0; i < 6; i++) {
      this.spawn(at, THEME.smoke, new THREE.Vector3(jitter(1), 1 + Math.random(), jitter(1)), { life: 1.4, gravity: 0, size: 0.2, grow: 2 });
    }
  }

  splash(at: THREE.Vector3): void {
    for (let i = 0; i < 12; i++) {
      this.spawn(at, THEME.water, new THREE.Vector3(jitter(1.5), 2.5 + Math.random() * 2, jitter(1.5)), { life: 0.9, size: 0.1 });
    }
  }

  /** Keeps flames and smoke rising from this point until `clear()`. */
  addFire(at: THREE.Vector3): void {
    this.fires.push({ at: at.clone(), clock: Math.random() * FIRE_INTERVAL });
  }

  /** A shell arcing from `from` to `to`. Resolves on impact. */
  async shell(from: THREE.Vector3, to: THREE.Vector3, color: number = THEME.amber): Promise<void> {
    const mesh = new THREE.Mesh(shellGeo, material(color));
    this.scene.add(mesh);
    const height = 2.5 + from.distanceTo(to) * 0.25;
    await this.animate(0.9, (t) => {
      mesh.position.lerpVectors(from, to, t).y += height * 4 * t * (1 - t);
      if (Math.random() < 0.6) this.spawn(mesh.position, THEME.smoke, new THREE.Vector3(), { life: 0.5, gravity: 0, size: 0.08, grow: 1.5 });
    });
    this.scene.remove(mesh);
  }

  /** A torpedo running along the water from `from` to `to`, leaving a wake. */
  async torpedo(from: THREE.Vector3, to: THREE.Vector3): Promise<void> {
    const mesh = new THREE.Mesh(torpedoGeo, material(0x263238));
    mesh.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    this.scene.add(mesh);
    await this.animate(0.25 + from.distanceTo(to) * 0.12, (t) => {
      mesh.position.lerpVectors(from, to, t);
      if (Math.random() < 0.7) this.spawn(mesh.position, THEME.water, new THREE.Vector3(jitter(0.6), 0.6, jitter(0.6)), { life: 0.6, size: 0.08 });
    });
    this.scene.remove(mesh);
  }

  /** An expanding radar ring. */
  async ping(at: THREE.Vector3): Promise<void> {
    const ringMat = new THREE.MeshBasicMaterial({ color: THEME.amber, transparent: true });
    const ring = new THREE.Mesh(pingGeo, ringMat);
    ring.position.copy(at);
    this.scene.add(ring);
    await this.animate(1, (t) => {
      ring.scale.setScalar(0.2 + t * 1.6);
      ringMat.opacity = 1 - t;
    });
    this.scene.remove(ring);
    ringMat.dispose();
  }

  update(dt: number): void {
    for (const a of this.anims) {
      a.t = Math.min(1, a.t + dt / a.duration);
      a.step(a.t);
      if (a.t >= 1) a.done();
    }
    this.anims = this.anims.filter((a) => a.t < 1);

    for (const fire of this.fires) {
      for (fire.clock += dt; fire.clock > FIRE_INTERVAL; fire.clock -= FIRE_INTERVAL) {
        const at = fire.at.clone().add(new THREE.Vector3(jitter(0.3), 0, jitter(0.3)));
        this.spawn(at, pick(THEME.fire), new THREE.Vector3(jitter(0.3), 1.2, jitter(0.3)), { life: 0.5, gravity: 0, size: 0.1 });
        if (Math.random() < 0.12) this.spawn(at, THEME.smoke, new THREE.Vector3(jitter(0.2), 0.8, jitter(0.2)), { life: 1.2, gravity: 0, size: 0.1, grow: 1.5 });
      }
    }

    for (const p of this.particles) {
      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= p.decay * dt;
      const scale = p.grow ? 1 + (1 - p.life) * p.grow : p.life;
      p.mesh.scale.setScalar(Math.max(0, p.size * scale * Math.min(1, p.life * 4)));
      if (p.life <= 0) this.scene.remove(p.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /** Removes everything and finishes any running animations. */
  clear(): void {
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles = [];
    this.fires = [];
    for (const a of this.anims) a.done();
    this.anims = [];
  }

  private spawn(
    at: THREE.Vector3,
    color: number,
    velocity: THREE.Vector3,
    { life = 1, gravity = GRAVITY, size = 0.12, grow = 0 } = {},
  ): void {
    const mesh = new THREE.Mesh(cube, material(color));
    mesh.position.copy(at);
    mesh.scale.setScalar(size);
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity, life: 1, decay: 1 / life, gravity, size, grow });
  }
}
