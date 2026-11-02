import * as THREE from 'three';
import { ParticleSystem } from './particles';
import { aircraftGeometry } from './models/warships';
import { outline, toonMaterial } from './shipMaterial';
import { THEME } from './theme';

const FIRE_INTERVAL = 0.06;
/** Stretches every flight and impact animation; 1 is the original speed. */
export const PACE = 1.4;
const MAX_PARTICLES = 1500; // per system; tuned for mid-range phones
const shellGeo = new THREE.SphereGeometry(0.1, 8, 6);
const shellMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
const torpedoGeo = new THREE.CapsuleGeometry(0.08, 0.45, 2, 6).rotateZ(Math.PI / 2);
const torpedoMat = new THREE.MeshStandardMaterial({ color: 0x263238 });
const ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
const bombGeo = new THREE.CapsuleGeometry(0.05, 0.14, 2, 6);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x2a323a });
// Open tapered tube, base at y = 0, for the water column a miss throws up.
const columnGeo = new THREE.CylinderGeometry(0.1, 0.22, 1, 12, 1, true).translate(0, 0.5, 0);

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;
const jitter = (spread: number) => (Math.random() - 0.5) * spread;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface Anim {
  t: number; // 0 → 1
  duration: number;
  step(t: number): void;
  done(): void;
}

/** Explosions, splashes, fires, projectile flights and rings. */
export class Effects {
  private readonly glow: ParticleSystem; // additive: flames, flashes, sparks
  private readonly haze: ParticleSystem; // normal blend: smoke, spray
  private readonly flash = new THREE.PointLight(0xffa860, 0, 7, 1.6);
  private fires: { at: THREE.Vector3; clock: number }[] = [];
  private anims: Anim[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.haze = new ParticleSystem(scene, MAX_PARTICLES, false);
    this.glow = new ParticleSystem(scene, MAX_PARTICLES, true);
    scene.add(this.flash);
  }

  /** Runs `step(t)` every frame with t going 0 → 1 over `duration` seconds (times PACE). */
  animate(duration: number, step: (t: number) => void): Promise<void> {
    return new Promise((done) => this.anims.push({ t: 0, duration: duration * PACE, step, done }));
  }

  /** Fireball, sparks, smoke, a shockwave ring and a flash of light. */
  explosion(at: THREE.Vector3): void {
    this.glow.spawn(at, v3(0, 0.5, 0), 0xfff0c0, { life: 0.25, size: 1.6, grow: 0.6 });
    for (let i = 0; i < 10; i++) {
      this.glow.spawn(at, v3(jitter(2), 1 + Math.random() * 1.5, jitter(2)), pick(THEME.fire), { life: 0.6, size: 0.45, grow: 0.8, drag: 2 });
    }
    for (let i = 0; i < 22; i++) {
      this.glow.spawn(at, v3(jitter(6), 2 + Math.random() * 4, jitter(6)), 0xffc070, { life: 0.7, gravity: 9.8, size: 0.07 });
    }
    for (let i = 0; i < 8; i++) {
      this.haze.spawn(at, v3(jitter(1), 0.8 + Math.random(), jitter(1)), THEME.smoke, { life: 2, size: 0.4, grow: 2, alpha: 0.7, drag: 1 });
    }
    void this.ring(at.clone().setY(0.05), 0xffd9a0, 1.4, 0.45, 0.7);
    this.flash.position.copy(at).y += 0.6;
    this.flash.intensity = 40;
  }

  /** A tall column of white water that rises and collapses, spray falling back, and a ripple. */
  splash(at: THREE.Vector3): void {
    void this.column(at);
    for (let i = 0; i < 30; i++) {
      this.haze.spawn(at, v3(jitter(1.2), 3.5 + Math.random() * 2.5, jitter(1.2)), THEME.water, { life: 1.1, gravity: 9.8, size: 0.28, grow: 0.4, alpha: 0.95 });
    }
    for (let i = 0; i < 8; i++) {
      this.haze.spawn(at, v3(jitter(1.6), 0.5, jitter(1.6)), THEME.water, { life: 1.6, size: 0.45, grow: 1.8, alpha: 0.35, drag: 2 });
    }
    void this.ring(at.clone().setY(0.03), THEME.water, 0.9, 1.4, 0.5);
  }

  /** A small splash: a few droplets and a faint ripple. For fish, dolphins and other sea life. */
  droplets(at: THREE.Vector3, count = 8, speed = 2, size = 0.1): void {
    for (let i = 0; i < count; i++) {
      this.haze.spawn(at, v3(jitter(speed * 0.5), speed * (0.6 + Math.random() * 0.6), jitter(speed * 0.5)), THEME.water, { life: 0.7, gravity: 9.8, size, alpha: 0.85 });
    }
    void this.ring(at.clone().setY(at.y + 0.02), THEME.water, size * 4, 0.8, 0.35);
  }

  /** A whale's spout: a plume of mist that rises and drifts. */
  spout(at: THREE.Vector3): void {
    for (let i = 0; i < 24; i++) {
      this.haze.spawn(at, v3(jitter(0.4), 2.5 + Math.random() * 1.5, jitter(0.4)), THEME.water, { life: 1.4, gravity: 1.5, size: 0.35, grow: 2, alpha: 0.6, drag: 1 });
    }
  }

  /** Gun flash and a puff of smoke where a shell leaves. */
  muzzle(at: THREE.Vector3): void {
    this.glow.spawn(at, v3(0, 0, 0), 0xffe7a8, { life: 0.12, size: 0.9 });
    for (let i = 0; i < 4; i++) {
      this.haze.spawn(at, v3(jitter(0.6), 0.5, jitter(0.6)), 0x8a96a3, { life: 1.2, size: 0.25, grow: 2, alpha: 0.5, drag: 1.5 });
    }
  }

  /** Keeps flames and smoke rising from this point until `clear()`. */
  addFire(at: THREE.Vector3): void {
    this.fires.push({ at: at.clone(), clock: Math.random() * FIRE_INTERVAL });
  }

  /** A glowing shell arcing from `from` to `to`. Resolves on impact. A low `height` makes a quick skip. */
  async shell(from: THREE.Vector3, to: THREE.Vector3, height = 2.5 + from.distanceTo(to) * 0.25): Promise<void> {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    this.scene.add(mesh);
    await this.animate(height < 1 ? 0.45 : 0.9, (t) => {
      mesh.position.lerpVectors(from, to, t).y += height * 4 * t * (1 - t);
      this.glow.spawn(mesh.position, v3(0, 0, 0), 0xffb060, { life: 0.25, size: 0.18 });
    });
    this.scene.remove(mesh);
  }

  /**
   * A jet flies from `from` to `to`, dropping a bomb on each target as it passes over. `onDrop`
   * fires as each bomb is released. Resolves when the last bomb lands.
   */
  async airstrike(from: THREE.Vector3, to: THREE.Vector3, targets: THREE.Vector3[], onDrop?: () => void): Promise<void> {
    const geometry = aircraftGeometry();
    const jet = new THREE.Mesh(geometry, toonMaterial());
    jet.add(outline(geometry));
    jet.scale.setScalar(1.6);
    jet.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    this.scene.add(jet);

    const path = to.clone().sub(from);
    const length = path.length();
    const dropAt = targets.map((t) => t.clone().sub(from).dot(path) / (length * length)); // 0..1 along the path
    const bombs: Promise<void>[] = [];
    let released = 0;
    await this.animate(1.6, (t) => {
      jet.position.lerpVectors(from, to, t);
      jet.rotation.z = Math.sin(t * Math.PI) * 0.08; // slight nose-up as it pulls through
      this.haze.spawn(jet.position, v3(0, 0, 0), 0xb8c7d4, { life: 0.8, size: 0.12, grow: 2, alpha: 0.3 });
      while (released < targets.length && t >= dropAt[released]! - 0.12) {
        bombs.push(this.bomb(jet.position.clone(), targets[released]!));
        onDrop?.();
        released++;
      }
    });
    this.scene.remove(jet);
    (jet.material as THREE.Material).dispose();
    await Promise.all(bombs);
  }

  /** A torpedo running along the water from `from` to `to`, leaving a wake. */
  async torpedo(from: THREE.Vector3, to: THREE.Vector3): Promise<void> {
    const mesh = new THREE.Mesh(torpedoGeo, torpedoMat);
    mesh.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x);
    this.scene.add(mesh);
    await this.animate(0.25 + from.distanceTo(to) * 0.12, (t) => {
      mesh.position.lerpVectors(from, to, t);
      this.haze.spawn(mesh.position.clone().setY(0.05), v3(jitter(0.8), 0.3, jitter(0.8)), THEME.water, { life: 0.9, size: 0.18, grow: 1.2, alpha: 0.7, drag: 2 });
    });
    this.scene.remove(mesh);
  }

  private async bomb(from: THREE.Vector3, to: THREE.Vector3): Promise<void> {
    const mesh = new THREE.Mesh(bombGeo, bombMat);
    this.scene.add(mesh);
    await this.animate(0.45, (t) => {
      mesh.position.lerpVectors(from, to, t);
      mesh.position.y = from.y + (to.y - from.y) * t * t; // falls faster as it drops
    });
    this.scene.remove(mesh);
  }

  /** An expanding radar ring. */
  ping(at: THREE.Vector3): Promise<void> {
    return this.ring(at, THEME.amber, 1.8, 1);
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
        const at = fire.at.clone().add(v3(jitter(0.25), 0, jitter(0.25)));
        this.glow.spawn(at, v3(jitter(0.2), 0.9 + Math.random() * 0.5, jitter(0.2)), pick(THEME.fire), { life: 0.6, size: 0.42, grow: -0.6, alpha: 0.9 });
        if (Math.random() < 0.35) {
          this.haze.spawn(at.setY(at.y + 0.4), v3(0.2 + jitter(0.1), 0.8, jitter(0.1)), THEME.smoke, { life: 2.4, size: 0.3, grow: 2.4, alpha: 0.5 });
        }
      }
    }

    this.flash.intensity *= Math.exp(-dt * 12);
    this.glow.update(dt);
    this.haze.update(dt);
  }

  /** Removes everything and finishes any running animations. */
  clear(): void {
    this.glow.clear();
    this.haze.clear();
    this.fires = [];
    for (const a of this.anims) a.done();
    this.anims = [];
  }

  private async column(at: THREE.Vector3): Promise<void> {
    const material = new THREE.MeshBasicMaterial({ color: THEME.water, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const column = new THREE.Mesh(columnGeo, material);
    column.position.copy(at);
    this.scene.add(column);
    await this.animate(1.1, (t) => {
      const rise = Math.sin(Math.min(1, t * 1.6) * Math.PI); // up fast, then falls back
      column.scale.set(1 + t * 1.5, 0.05 + rise * 2.2, 1 + t * 1.5);
      material.opacity = 0.85 * (1 - t);
    });
    this.scene.remove(column);
    material.dispose();
  }

  private async ring(at: THREE.Vector3, color: number, scale: number, duration: number, opacity = 1): Promise<void> {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, material);
    ring.position.copy(at);
    this.scene.add(ring);
    await this.animate(duration, (t) => {
      ring.scale.setScalar(0.15 + t * scale);
      material.opacity = opacity * (1 - t);
    });
    this.scene.remove(ring);
    material.dispose();
  }
}
