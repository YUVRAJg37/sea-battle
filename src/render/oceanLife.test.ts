import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Effects } from './effects';
import { createOceanLife } from './oceanLife';

describe('ocean life', () => {
  it('leaps, splashes and spouts over half a minute without touching the grids', () => {
    const scene = new THREE.Scene();
    const effects = { droplets: vi.fn(), spout: vi.fn() } as unknown as Effects;
    const update = createOceanLife(scene, effects);

    const onGrid = (o: THREE.Object3D) => Math.abs(o.position.x) > 2 && Math.abs(o.position.x) < 12 && Math.abs(o.position.z) < 5;
    let gridIntrusions = 0;
    for (let frame = 0; frame < 30 * 20; frame++) {
      update(0.05, frame * 0.05);
      // Anything near the water line (buoys, debris, leapers) must stay off the boards.
      for (const o of scene.children) if (o.visible && o.position.y < 1.5 && o.position.z > -15 && onGrid(o)) gridIntrusions++;
    }

    expect(effects.droplets).toHaveBeenCalled();
    expect(effects.spout).toHaveBeenCalled();
    expect(gridIntrusions).toBe(0);
  });
});
