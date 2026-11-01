import * as THREE from 'three';

const GRAVITY = 9.8;
const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const materials = new Map<number, THREE.Material>();

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number; // 1 → 0, also used as scale
}

/** Short-lived particle bursts for explosions and splashes. */
export class Effects {
  private particles: Particle[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  burst(at: THREE.Vector3, color: number, count = 16): void {
    let material = materials.get(color);
    if (!material) materials.set(color, (material = new THREE.MeshBasicMaterial({ color })));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(at);
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3);
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity, life: 1 });
    }
  }

  explosion(at: THREE.Vector3): void {
    this.burst(at, 0xff7043, 18);
    this.burst(at, 0x37474f, 8);
  }

  splash(at: THREE.Vector3): void {
    this.burst(at, 0xe3f2fd, 10);
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.velocity.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt * 1.2;
      p.mesh.scale.setScalar(Math.max(p.life, 0));
      if (p.life <= 0) this.scene.remove(p.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
