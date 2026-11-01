import * as THREE from 'three';
import { BOARD_SIZE, RADAR_RADIUS, area, inBounds, type Cell, type Fleet, type Marks, type Ship, type ShipType } from '../engine';
import { createShip } from './ships';
import { THEME } from './theme';

const HALF = BOARD_SIZE / 2;
const SINK_SECONDS = 2.2;

const pegGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6);
const hitMat = new THREE.MeshStandardMaterial({ color: THEME.hit, emissive: 0x7a0000, flatShading: true });
const missGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 8);
const missMat = new THREE.MeshStandardMaterial({ color: THEME.miss });
const scoutGeo = new THREE.OctahedronGeometry(0.22);
const scoutMat = new THREE.MeshStandardMaterial({ color: THEME.amber, emissive: 0x664400, flatShading: true });
const tileGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
const okMat = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.5 });
const badMat = new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.5 });
const ringGeo = new THREE.RingGeometry(0.36, 0.47, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2); // square outline
const lastShotMat = new THREE.MeshBasicMaterial({ color: THEME.amber });
const radarLineMat = new THREE.LineBasicMaterial({ color: THEME.amber });

/** Cell center in board-local coordinates. */
const local = (c: Cell, y = 0) => new THREE.Vector3(c.x - HALF + 0.5, y, c.y - HALF + 0.5);

const sameShip = (a: Ship, b: Ship) =>
  a.type === b.type && a.dir === b.dir && a.origin.x === b.origin.x && a.origin.y === b.origin.y;

/** Reusable set of flat cell highlights. */
class TilePool {
  private readonly tiles: THREE.Mesh[] = [];

  constructor(private readonly parent: THREE.Object3D, private readonly geometry: THREE.BufferGeometry, private readonly y: number) {}

  show(cells: Cell[], material: THREE.Material): void {
    cells.forEach((c, i) => {
      let tile = this.tiles[i];
      if (!tile) {
        tile = new THREE.Mesh(this.geometry, material);
        this.tiles.push(tile);
        this.parent.add(tile);
      }
      tile.material = material;
      tile.position.copy(local(c, this.y));
      tile.visible = true;
    });
    for (let i = cells.length; i < this.tiles.length; i++) this.tiles[i]!.visible = false;
  }
}

/** One 10x10 board in the 3D scene: grid, labels, ships, shot markers, highlights. */
export class Board3D {
  private readonly group = new THREE.Group();
  private readonly surface: THREE.Mesh;
  private readonly ships = new Map<ShipType, THREE.Group>();
  private readonly shipLayer = new THREE.Group();
  private readonly markers = new THREE.Group();
  private readonly marked = new Set<string>();
  private readonly preview: TilePool;
  private readonly lastShot: TilePool;

  constructor(scene: THREE.Scene, readonly centerX: number, tint: number) {
    this.group.position.x = centerX;
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.45 }),
    );
    const grid = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, THEME.grid, THEME.grid);
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.group.add(this.surface, grid, coordinateLabels(), this.shipLayer, this.markers);
    this.preview = new TilePool(this.group, tileGeo, 0.04);
    this.lastShot = new TilePool(this.group, ringGeo, 0.05);
    scene.add(this.group);
  }

  cellAt(ray: THREE.Raycaster): Cell | null {
    const hit = ray.intersectObject(this.surface)[0];
    if (!hit) return null;
    const p = this.group.worldToLocal(hit.point.clone());
    const cell = { x: Math.floor(p.x + HALF), y: Math.floor(p.z + HALF) };
    return inBounds(cell) ? cell : null;
  }

  /** World position of a cell's center. Works for cells just off the board too. */
  cellPosition(c: Cell, y = 0): THREE.Vector3 {
    return this.group.localToWorld(local(c, y));
  }

  /** Shows exactly these ships, keeping meshes (and their animations) for ships that didn't move. */
  setShips(fleet: Fleet): void {
    for (const [type, mesh] of this.ships) {
      if (!fleet.some((s) => sameShip(s, mesh.userData.ship))) {
        this.shipLayer.remove(mesh);
        this.ships.delete(type);
      }
    }
    for (const ship of fleet) {
      if (this.ships.has(ship.type)) continue;
      const mesh = createShip(ship);
      this.ships.set(ship.type, mesh);
      this.shipLayer.add(mesh);
    }
  }

  /** Starts the sinking animation for these ships unless already started. */
  sink(types: ShipType[]): void {
    for (const type of types) {
      const mesh = this.ships.get(type);
      if (mesh) mesh.userData.sink ??= 0;
    }
  }

  update(dt: number): void {
    for (const mesh of this.ships.values()) {
      const progress: number | undefined = mesh.userData.sink;
      if (progress === undefined || progress >= 1) continue;
      const next = Math.min(1, progress + dt / SINK_SECONDS);
      const eased = 1 - (1 - next) ** 3;
      mesh.userData.sink = next;
      mesh.userData.body.position.y = -0.32 * eased;
      mesh.userData.body.rotation.x = 0.35 * eased; // roll onto its side
    }
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

  /** Outlines the scanned area and floats the ship-cell count above its center. */
  addRadar(center: Cell, count: number): void {
    const cells = area(center, RADAR_RADIUS);
    const xs = cells.map((c) => c.x - HALF);
    const zs = cells.map((c) => c.y - HALF);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs) + 1, Math.min(...zs), Math.max(...zs) + 1];
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector3(x, 0.06, z));
    this.markers.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), radarLineMat));
    this.add(makeBadge(String(count)), center, 1.3);
  }

  /** Highlights cells; `ok` picks green or red. Empty list clears the preview. */
  setPreview(cells: Cell[], ok = true): void {
    this.preview.show(cells, ok ? okMat : badMat);
  }

  /** Outlines the cells the latest shot landed on. */
  setLastShot(cells: Cell[]): void {
    this.lastShot.show(cells, lastShotMat);
  }

  reset(): void {
    this.shipLayer.clear();
    this.ships.clear();
    this.markers.traverse((o) => {
      if (o instanceof THREE.Sprite) o.material.map?.dispose();
      if (o instanceof THREE.Line) o.geometry.dispose();
    });
    this.markers.clear();
    this.marked.clear();
    this.setPreview([]);
    this.setLastShot([]);
  }

  private add(object: THREE.Object3D, c: Cell, y: number): void {
    object.position.copy(local(c, y));
    this.markers.add(object);
  }
}

/** A–J along the far edge and 1–10 down the left edge, drawn once onto a flat plane. */
function coordinateLabels(): THREE.Mesh {
  const size = BOARD_SIZE + 2;
  const px = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * px;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = THEME.label;
  ctx.font = `600 ${px * 0.5}px "Chakra Petch", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < BOARD_SIZE; i++) {
    ctx.fillText(String.fromCharCode(65 + i), (i + 1.5) * px, 0.62 * px);
    ctx.fillText(String(i + 1), 0.55 * px, (i + 1.5) * px);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.position.y = -0.02;
  return mesh;
}

/** Round amber badge with text, always facing the camera. */
function makeBadge(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 200, 87, 0.95)';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2a00';
  ctx.font = '600 76px "Chakra Petch", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}
