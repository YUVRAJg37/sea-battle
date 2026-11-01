import * as THREE from 'three';
import { BOARD_SIZE, inBounds, type Cell, type Fleet, type Marks } from '../engine';
import { createShip } from './ships';

const HALF = BOARD_SIZE / 2;

const pegGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6);
const hitMat = new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0x7a0000, flatShading: true });
const missGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8);
const missMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
const scoutGeo = new THREE.OctahedronGeometry(0.22);
const scoutMat = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0x664400, flatShading: true });
const tileGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
const okMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.55 });
const badMat = new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.55 });

/** Cell center in board-local coordinates. */
const local = (c: Cell, y = 0) => new THREE.Vector3(c.x - HALF + 0.5, y, c.y - HALF + 0.5);

/** One 10x10 board in the 3D scene: grid, ships, shot markers, aim preview. */
export class Board3D {
  private readonly group = new THREE.Group();
  private readonly surface: THREE.Mesh;
  private readonly ships = new THREE.Group();
  private readonly markers = new THREE.Group();
  private readonly marked = new Set<string>();
  private readonly previews: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, readonly centerX: number, tint: number) {
    this.group.position.x = centerX;
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.35 }),
    );
    const grid = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, 0xffffff, 0xffffff);
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    this.group.add(this.surface, grid, this.ships, this.markers);
    scene.add(this.group);
  }

  cellAt(ray: THREE.Raycaster): Cell | null {
    const hit = ray.intersectObject(this.surface)[0];
    if (!hit) return null;
    const p = this.group.worldToLocal(hit.point.clone());
    const cell = { x: Math.floor(p.x + HALF), y: Math.floor(p.z + HALF) };
    return inBounds(cell) ? cell : null;
  }

  /** World position of a cell's center. */
  cellPosition(c: Cell, y = 0): THREE.Vector3 {
    return this.group.localToWorld(local(c, y));
  }

  setShips(fleet: Fleet): void {
    this.ships.clear();
    for (const ship of fleet) this.ships.add(createShip(ship));
  }

  /** Adds markers for shots not shown yet. */
  setMarks(marks: Marks): void {
    for (const [k, result] of Object.entries(marks)) {
      if (this.marked.has(k)) continue;
      this.marked.add(k);
      const [x, y] = k.split(',').map(Number) as [number, number];
      const isHit = result === 'hit';
      this.add(new THREE.Mesh(isHit ? pegGeo : missGeo, isHit ? hitMat : missMat), { x, y }, isHit ? 0.35 : 0.03);
    }
  }

  addScout(c: Cell): void {
    this.add(new THREE.Mesh(scoutGeo, scoutMat), c, 0.6);
  }

  addLabel(c: Cell, text: string): void {
    this.add(makeLabel(text), c, 1.3);
  }

  /** Highlights cells; `ok` picks green or red. Empty list clears the preview. */
  setPreview(cells: Cell[], ok = true): void {
    cells.forEach((c, i) => {
      if (!this.previews[i]) {
        this.previews.push(new THREE.Mesh(tileGeo, okMat));
        this.group.add(this.previews[i]!);
      }
      const tile = this.previews[i]!;
      tile.material = ok ? okMat : badMat;
      tile.position.copy(local(c, 0.04));
      tile.visible = true;
    });
    for (let i = cells.length; i < this.previews.length; i++) this.previews[i]!.visible = false;
  }

  reset(): void {
    this.ships.clear();
    this.markers.traverse((o) => o instanceof THREE.Sprite && o.material.map?.dispose());
    this.markers.clear();
    this.marked.clear();
    this.setPreview([]);
  }

  private add(object: THREE.Object3D, c: Cell, y: number): void {
    object.position.copy(local(c, y));
    this.markers.add(object);
  }
}

/** Round yellow badge with text, always facing the camera. */
function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 193, 7, 0.95)';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}
