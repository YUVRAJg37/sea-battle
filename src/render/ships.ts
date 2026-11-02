import * as THREE from 'three';
import { BOARD_SIZE, pieceLength, type Ship } from '../engine';
import { BEAM, warshipGeometry } from './models/warships';
import { outline, toonMaterial } from './shipMaterial';

const SINK_SECONDS = 2.2;

const foamTextures = new Map<boolean, THREE.Texture>();

/** Soft white glow drawn as a ring of foam: a rounded rectangle under each hull, a circle round a mine. */
function foam(round: boolean): THREE.Texture {
  const cached = foamTextures.get(round);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = round ? 256 : 64;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'blur(6px)';
  ctx.strokeStyle = 'rgba(230, 245, 255, 0.9)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  if (round) ctx.arc(128, 128, 96, 0, Math.PI * 2);
  else ctx.roundRect(14, 14, 228, 36, 18);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  foamTextures.set(round, texture);
  return texture;
}

/**
 * A ship on a board: places the model, bobs it on the swell, darkens and lists it as it takes
 * damage, and rolls it under when sunk.
 */
export class ShipView {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly material: THREE.MeshToonMaterial;
  private readonly foamMaterial: THREE.MeshBasicMaterial;
  private readonly phase = Math.random() * Math.PI * 2;
  private damage = 0; // 0..1 share of cells hit
  private sinkProgress: number | null = null;

  constructor(readonly ship: Ship) {
    const length = pieceLength(ship.type);
    this.material = toonMaterial();
    const geometry = warshipGeometry(ship.type, 'naval');
    this.body = new THREE.Mesh(geometry, this.material);
    this.body.add(outline(geometry));
    const round = ship.type === 'mine';
    this.foamMaterial = new THREE.MeshBasicMaterial({ map: foam(round), transparent: true, depthWrite: false });
    const [w, d] = round ? [0.75, 0.75] : [length + 0.3, BEAM[ship.type] + 0.45];
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), this.foamMaterial);
    ring.position.set(length / 2, 0.015, 0);
    this.group.add(this.body, ring);

    // Cell (0,0) spans [-half, -half + 1] on both axes; the hull is centered on the cell middle.
    const half = BOARD_SIZE / 2;
    const { x, y } = ship.origin;
    if (ship.dir === 'h') {
      this.group.position.set(x - half, 0, y - half + 0.5);
    } else {
      this.group.position.set(x - half + 0.5, 0, y - half);
      this.group.rotation.y = -Math.PI / 2; // turns +x (ship length) toward +z (board rows)
    }
  }

  setDamage(fraction: number): void {
    this.damage = fraction;
    this.material.color.setScalar(1 - 0.45 * fraction); // scorched
  }

  sink(): void {
    this.sinkProgress ??= 0;
  }

  /** World position of the ship's middle, at deck height. */
  center(): THREE.Vector3 {
    return this.group.localToWorld(new THREE.Vector3(pieceLength(this.ship.type) / 2, 0.4, 0));
  }

  update(dt: number, time: number): void {
    let sink = 0;
    if (this.sinkProgress !== null) {
      this.sinkProgress = Math.min(1, this.sinkProgress + dt / SINK_SECONDS);
      sink = 1 - (1 - this.sinkProgress) ** 3;
    }
    const swell = 1 - sink;
    this.body.position.y = Math.sin(time * 1.3 + this.phase) * 0.025 * swell - 0.34 * sink - 0.05 * this.damage;
    this.body.rotation.x = Math.sin(time * 0.9 + this.phase) * 0.03 * swell + 0.08 * this.damage + 0.4 * sink; // roll and list
    this.body.rotation.z = Math.sin(time * 0.7 + this.phase * 2) * 0.012 * swell; // pitch
    this.foamMaterial.opacity = (0.55 + Math.sin(time * 2 + this.phase) * 0.15) * (1 - sink * 0.7);
  }

  dispose(): void {
    this.material.dispose();
    this.foamMaterial.dispose();
  }
}
