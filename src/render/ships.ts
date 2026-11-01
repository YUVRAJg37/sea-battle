import * as THREE from 'three';
import { BOARD_SIZE, SHIPS, type Ship } from '../engine';

const HULL_HEIGHT = 0.35;
const HULL_HALF_WIDTH = 0.32;

const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a96a3, flatShading: true });
const subMat = new THREE.MeshStandardMaterial({ color: 0x37474f, flatShading: true });
const deckMat = new THREE.MeshStandardMaterial({ color: 0xd5dbe0, flatShading: true });
const box = new THREE.BoxGeometry(1, 1, 1);
const gun = new THREE.CylinderGeometry(0.14, 0.16, 0.14, 6);
const hulls = new Map<number, THREE.BufferGeometry>();

/** Pointed hull along +x from 0 to `length`, deck at HULL_HEIGHT. Cached per length. */
function hull(length: number): THREE.BufferGeometry {
  let geometry = hulls.get(length);
  if (!geometry) {
    const w = HULL_HALF_WIDTH;
    const shape = new THREE.Shape()
      .moveTo(0.1, -w)
      .lineTo(length - 0.7, -w)
      .lineTo(length - 0.08, 0)
      .lineTo(length - 0.7, w)
      .lineTo(0.1, w)
      .closePath();
    geometry = new THREE.ExtrudeGeometry(shape, { depth: HULL_HEIGHT, bevelEnabled: false }).rotateX(-Math.PI / 2);
    hulls.set(length, geometry);
  }
  return geometry;
}

function part(geometry: THREE.BufferGeometry, x: number, y: number, size: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, deckMat);
  mesh.position.set(x, y, 0);
  mesh.scale.set(...size);
  return mesh;
}

/** Low-poly ship placed in board-local coordinates. */
export function createShip(ship: Ship): THREE.Group {
  const length = SHIPS[ship.type].length;
  const group = new THREE.Group();
  const isSub = ship.type === 'submarine';

  group.add(new THREE.Mesh(hull(length), isSub ? subMat : hullMat));
  if (isSub) {
    group.add(part(box, length * 0.45, HULL_HEIGHT + 0.15, [0.5, 0.3, 0.25]));
  } else {
    const towerLength = Math.min(length * 0.25, 1.1);
    group.add(part(box, length * 0.38, HULL_HEIGHT + 0.17, [towerLength, 0.34, 0.4]));
    if (length >= 3) group.add(part(gun, length * 0.72, HULL_HEIGHT + 0.07, [1, 1, 1]));
  }

  // Cell (0,0) spans [-half, -half + 1] on both axes; the hull width is centered on the cell middle.
  const half = BOARD_SIZE / 2;
  const { x, y } = ship.origin;
  if (ship.dir === 'h') {
    group.position.set(x - half, -0.08, y - half + 0.5);
  } else {
    group.position.set(x - half + 0.5, -0.08, y - half);
    group.rotation.y = -Math.PI / 2; // turns +x (ship length) toward +z (board rows)
  }
  return group;
}
