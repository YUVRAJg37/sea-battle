import * as THREE from 'three';
import { THEME } from './theme';

// Waves are displaced on the GPU; the fragment shader derives faceted normals from screen-space
// derivatives, bands the color by height, and paints scrolling toon foam and sun glints.

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vHeight;
  #include <fog_pars_vertex>

  float wave(vec2 p) {
    return sin(p.x * 0.45 + uTime) * 0.08
         + cos(p.y * 0.35 + uTime * 1.3) * 0.08
         + sin((p.x + p.y) * 0.9 + uTime * 1.7) * 0.035;
  }

  void main() {
    vec3 pos = position;
    pos.y += wave(pos.xz);
    vHeight = pos.y;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSunDir;
  varying vec3 vWorld;
  varying float vHeight;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;

    float crest = smoothstep(-0.12, 0.16, vHeight);
    vec3 color = mix(uDeep, uShallow, floor(crest * 3.0) / 3.0); // three toon bands

    // Thin foam streaks: the edge band of a noise field, only on the higher part of a swell.
    float f = noise(vWorld.xz * vec2(0.9, 1.6) + vec2(uTime * 0.12, uTime * 0.05)) * 0.65
            + noise(vWorld.xz * 2.8 - uTime * 0.15) * 0.35;
    float streak = step(0.62, f) - step(0.645, f);
    color = mix(color, uFoam, streak * smoothstep(0.45, 0.9, crest) * 0.28);

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float spec = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 40.0);
    color += step(0.45, spec) * vec3(1.0, 0.85, 0.65) * 0.55;

    float sparkle = hash(floor(vWorld.xz * 5.0) + floor(uTime * 2.5));
    color += step(0.998, sparkle) * crest * 0.35;

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

/** Stylized animated sea. Returns a per-frame update function. */
export function createWater(scene: THREE.Scene, sunDirection: THREE.Vector3): (time: number) => void {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(THEME.seaDeep) },
        uShallow: { value: new THREE.Color(THEME.seaShallow) },
        uFoam: { value: new THREE.Color(THEME.foam) },
        uSunDir: { value: sunDirection.clone().normalize() },
      },
    ]),
  });
  // Dense enough for smooth swells near the boards; fog hides the coarse far edge.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 110, 110).rotateX(-Math.PI / 2), material);
  mesh.position.y = -0.3; // below the boards so swells never cover the grid
  scene.add(mesh);
  return (time) => {
    material.uniforms.uTime!.value = time;
  };
}
