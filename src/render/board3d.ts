import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BOARD_SIZE, RADAR_RADIUS, SHIPS, area, inBounds, key, shipCells, type Cell, type Edge, type Fleet, type Marks, type Ship, type ShipType,
} from '../engine';
import { ShipView } from './ships';
import { THEME } from './theme';

const HALF = BOARD_SIZE / 2;

// Hit: glowing ember ring hovering at deck height over a scorch mark. Miss: a white ring floating on the water.
const emberGeo = new THREE.TorusGeometry(0.2, 0.035, 6, 24).rotateX(Math.PI / 2);
const emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a3c });
const scorchGeo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
const arrowMat = new THREE.MeshBasicMaterial({ color: THEME.amber });
const missGeo = new THREE.TorusGeometry(0.15, 0.04, 6, 20).rotateX(Math.PI / 2);
const missMat = new THREE.MeshStandardMaterial({ color: THEME.miss, roughness: 0.4 });
let scorchMat: THREE.MeshBasicMaterial | null = null;
const scoutGeo = new THREE.OctahedronGeometry(0.22);
const scoutMat = new THREE.MeshStandardMaterial({ color: THEME.amber, emissive: 0x664400, flatShading: true });
const tileGeo = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
const bracketGeo = cornerBrackets();
const ringGeo = new THREE.RingGeometry(0.42, 0.46, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2); // thin square outline
const lastShotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
// Chevron pointing along +x, flat on the board: shows which way a torpedo will run.
const arrowGeo = new THREE.ShapeGeometry(
  new THREE.Shape().moveTo(-0.3, -0.32).lineTo(0.32, 0).lineTo(-0.3, 0.32).lineTo(-0.12, 0).closePath(),
).rotateX(-Math.PI / 2);

/** Target marker colors: amber when aiming, green/red when placing a ship. */
export type PreviewTone = 'aim' | 'ok' | 'bad';
const TONES: Record<PreviewTone, { fill: THREE.Material; bracket: THREE.Material }> = {
  aim: tone(THEME.amber, 0.18),
  ok: tone(0x66ff88, 0.22),
  bad: tone(0xff5252, 0.3),
};

function tone(color: number, fillOpacity: number) {
  return {
    fill: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false }),
    bracket: new THREE.MeshBasicMaterial({ color }),
  };
}

/** Four L-shaped corners framing one cell, flat on the board. */
function cornerBrackets(): THREE.BufferGeometry {
  const [edge, arm, thick] = [0.47, 0.17, 0.045];
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(arm, 0.01, thick).translate(sx * (edge - arm / 2), 0, sz * (edge - thick / 2)));
      parts.push(new THREE.BoxGeometry(thick, 0.01, arm).translate(sx * (edge - thick / 2), 0, sz * (edge - arm / 2)));
    }
  }
  return mergeGeometries(parts)!;
}

/** Soft dark burn mark, drawn once. */
function scorch(): THREE.MeshBasicMaterial {
  if (scorchMat) return scorchMat;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(10, 8, 6, 0.9)');
  g.addColorStop(0.5, 'rgba(30, 18, 10, 0.55)');
  g.addColorStop(1, 'rgba(30, 18, 10, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return (scorchMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
}
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
  private readonly ships = new Map<ShipType, ShipView>();
  private readonly shipLayer = new THREE.Group();
  private readonly markers = new THREE.Group();
  private readonly marked = new Set<string>();
  private readonly reticle = new THREE.Group();
  private readonly previewFill: TilePool;
  private readonly previewBrackets: TilePool;
  private readonly lastShot: TilePool;
  private readonly arrow = new THREE.Mesh(arrowGeo, arrowMat);

  constructor(scene: THREE.Scene, readonly centerX: number, tint: number) {
    this.group.position.x = centerX;
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    const grid = new THREE.GridHelper(BOARD_SIZE, BOARD_SIZE, THEME.grid, THEME.grid);
    grid.position.y = 0.01;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.group.add(this.surface, grid, coordinateLabels(), this.shipLayer, this.markers, this.reticle);
    this.previewFill = new TilePool(this.group, tileGeo, 0.03);
    this.previewBrackets = new TilePool(this.reticle, bracketGeo, 0.06);
    this.arrow.visible = false;
    this.reticle.add(this.arrow);
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
    for (const [type, view] of this.ships) {
      if (!fleet.some((s) => sameShip(s, view.ship))) {
        this.shipLayer.remove(view.group);
        view.dispose();
        this.ships.delete(type);
      }
    }
    for (const ship of fleet) {
      if (this.ships.has(ship.type)) continue;
      const view = new ShipView(ship);
      this.ships.set(ship.type, view);
      this.shipLayer.add(view.group);
    }
  }

  /** World position of a ship's middle at deck height, if it's on this board. */
  shipCenter(type: ShipType): THREE.Vector3 | undefined {
    return this.ships.get(type)?.center();
  }

  /** Starts the sinking animation for these ships unless already started. */
  sink(types: ShipType[]): void {
    for (const type of types) this.ships.get(type)?.sink();
  }

  update(dt: number, time: number): void {
    for (const view of this.ships.values()) view.update(dt, time);
    const pulse = 1 + Math.sin(time * 6) * 0.06;
    for (const bracket of this.reticle.children) bracket.scale.set(pulse, 1, pulse);
    for (const marker of this.markers.children) {
      const { kind, phase } = marker.userData;
      if (kind === 'miss') marker.position.y = 0.03 + Math.sin(time * 2 + phase) * 0.025;
      if (kind === 'ember') marker.scale.setScalar(1 + Math.sin(time * 4 + phase) * 0.08);
    }
  }

  /** Adds markers for shots not shown yet and scorches damaged ships. */
  setMarks(marks: Marks): void {
    for (const view of this.ships.values()) {
      const hits = shipCells(view.ship).filter((c) => marks[key(c)] === 'hit').length;
      view.setDamage(hits / SHIPS[view.ship.type].length);
    }
    for (const [k, result] of Object.entries(marks)) {
      if (this.marked.has(k)) continue;
      this.marked.add(k);
      const [x, y] = k.split(',').map(Number) as [number, number];
      const phase = Math.random() * Math.PI * 2;
      if (result === 'hit') {
        this.add(new THREE.Mesh(scorchGeo, scorch()), { x, y }, 0.02);
        this.add(Object.assign(new THREE.Mesh(emberGeo, emberMat), { userData: { kind: 'ember', phase } }), { x, y }, 0.45);
      } else {
        this.add(Object.assign(new THREE.Mesh(missGeo, missMat), { userData: { kind: 'miss', phase } }), { x, y }, 0.03);
      }
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

  /** Frames cells with a pulsing target marker. Empty list clears it. */
  setPreview(cells: Cell[], tone: PreviewTone = 'aim'): void {
    this.previewFill.show(cells, TONES[tone].fill);
    this.previewBrackets.show(cells, TONES[tone].bracket);
  }

  /** Shows an arrow on a torpedo's first cell pointing away from the edge it launches from; null hides it. */
  setArrow(cell: Cell | null, from: Edge = 'left'): void {
    this.arrow.visible = cell !== null;
    if (!cell) return;
    this.arrow.position.copy(local(cell, 0.08));
    // The chevron points along +x; turning it by -90° points it along +z (down the board's rows).
    this.arrow.rotation.y = { left: 0, right: Math.PI, top: -Math.PI / 2, bottom: Math.PI / 2 }[from];
  }

  /** Outlines the cells the latest shot landed on. */
  setLastShot(cells: Cell[]): void {
    this.lastShot.show(cells, lastShotMat);
  }

  reset(): void {
    for (const view of this.ships.values()) view.dispose();
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
  ctx.font = `600 ${px * 0.5}px "Oxanium", monospace`;
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
  ctx.font = '600 76px "Oxanium", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}
