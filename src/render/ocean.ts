import * as THREE from 'three';
import { THEME } from './theme';

/** Low-poly animated sea. Returns a per-frame update function. */
export function createOcean(scene: THREE.Scene): (time: number) => void {
  const geometry = new THREE.PlaneGeometry(140, 140, 70, 70).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: THEME.sea, flatShading: true, roughness: 0.5 }),
  );
  mesh.position.y = -0.4; // below the boards so waves never cover the grid
  scene.add(mesh);

  const pos = geometry.attributes.position!;
  return (t) => {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.45 + t) * 0.15 + Math.cos(z * 0.35 + t * 1.3) * 0.15);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  };
}
