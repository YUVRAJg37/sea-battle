import * as THREE from 'three';
import { PIXEL_RATIO } from './stage';

// Soft round sprites rendered as one THREE.Points draw call. Particles live in a ring buffer:
// when full, the oldest slot is reused, so the cost stays fixed however busy the battle gets.

const vertexShader = /* glsl */ `
  uniform float uViewportHeight;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // World-space size → pixels at this depth.
    gl_PointSize = aSize * projectionMatrix[1][1] * uViewportHeight * 0.5 / -mv.z;
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, r) * vAlpha);
  }
`;

export interface SpawnOptions {
  life?: number; // seconds
  gravity?: number;
  size?: number; // world units
  grow?: number; // extra size multiple reached at end of life
  alpha?: number;
  drag?: number; // velocity damping per second
}

export class ParticleSystem {
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly velocity: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly gravity: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly grow: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly drag: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private next = 0;
  private readonly tmp = new THREE.Color();

  constructor(scene: THREE.Scene, private readonly max: number, additive: boolean) {
    this.position = new Float32Array(max * 3);
    this.color = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.velocity = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uViewportHeight: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const points = new THREE.Points(this.geometry, this.material);
    points.frustumCulled = false;
    points.renderOrder = additive ? 2 : 1;
    scene.add(points);
  }

  spawn(at: THREE.Vector3, velocity: THREE.Vector3, color: number, o: SpawnOptions = {}): void {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.position.set([at.x, at.y, at.z], i * 3);
    this.velocity.set([velocity.x, velocity.y, velocity.z], i * 3);
    this.tmp.set(color);
    this.color.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.age[i] = 0;
    this.life[i] = o.life ?? 1;
    this.gravity[i] = o.gravity ?? 0;
    this.baseSize[i] = o.size ?? 0.2;
    this.grow[i] = o.grow ?? 0;
    this.baseAlpha[i] = o.alpha ?? 1;
    this.drag[i] = o.drag ?? 0;
  }

  update(dt: number): void {
    this.material.uniforms.uViewportHeight!.value = innerHeight * PIXEL_RATIO;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i]! >= this.life[i]!) {
        this.alpha[i] = 0;
        continue;
      }
      this.age[i]! += dt;
      const t = Math.min(1, this.age[i]! / this.life[i]!);
      const damping = Math.max(0, 1 - this.drag[i]! * dt);
      const v = i * 3;
      this.velocity[v]! *= damping;
      this.velocity[v + 2]! *= damping;
      this.velocity[v + 1] = this.velocity[v + 1]! * damping - this.gravity[i]! * dt;
      for (let k = 0; k < 3; k++) this.position[v + k]! += this.velocity[v + k]! * dt;
      this.size[i] = this.baseSize[i]! * (1 + this.grow[i]! * t);
      this.alpha[i] = this.baseAlpha[i]! * (1 - t) * Math.min(1, t * 12); // quick fade in, linear fade out
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) this.geometry.attributes[name]!.needsUpdate = true;
  }

  clear(): void {
    this.age.fill(0);
    this.life.fill(0);
  }
}
