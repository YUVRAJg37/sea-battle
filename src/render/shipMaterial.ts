import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Three-step light ramp for cel shading. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/** Cel-shaded material using the model's vertex colors. One per ship so damage can darken it. */
export function toonMaterial(): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
}

const outlineMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uColor: { value: new THREE.Color(0x0a1420) }, uWidth: { value: 0.014 } },
  vertexShader: /* glsl */ `
    uniform float uWidth;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uWidth, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    void main() { gl_FragColor = vec4(uColor, 1.0); }
  `,
});

/** Ink outline: the back faces of the same mesh, pushed out along their normals. */
export function outline(geometry: THREE.BufferGeometry): THREE.Mesh {
  return new THREE.Mesh(geometry, outlineMaterial);
}
