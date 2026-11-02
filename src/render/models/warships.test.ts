import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PIECE_TYPES, pieceLength } from '../../engine';
import { warshipGeometry } from './warships';

describe('warship models', () => {
  it.each(PIECE_TYPES)('%s builds into one colored mesh that fits its cells', (type) => {
    const geometry = warshipGeometry(type);
    expect(geometry.attributes.position!.count).toBeGreaterThan(50);
    expect(geometry.attributes.color).toBeDefined();
    expect(geometry.attributes.normal).toBeDefined();
    const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
    expect(box.min.x).toBeGreaterThanOrEqual(-0.05);
    expect(box.max.x).toBeLessThanOrEqual(pieceLength(type) + 0.05);
    expect(box.max.z - box.min.z).toBeLessThan(1); // stays inside one cell's width
  });
});
