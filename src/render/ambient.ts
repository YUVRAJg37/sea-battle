import * as THREE from 'three';
import { THEME } from './theme';

const GULLS = 5;
const GULL_CENTER_Z = -28; // far behind the boards: seen on the title horizon, never over the grid
const WISPS = 10;
const WISP_RANGE = 40; // wisps drift across x ∈ [-range/2, range/2] and wrap

/** Soft round white blob used for the sun glare and fog wisps. */
function softTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function skyDome(sun: THREE.Vector3): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 16), // past the sea skirt (camera far plane is 800)
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(THEME.skyTop) },
        uMid: { value: new THREE.Color(THEME.skyMid) },
        uHorizon: { value: new THREE.Color(THEME.horizon) },
        uGlow: { value: new THREE.Color(THEME.sunGlow) },
        uSun: { value: sun },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          // Direction from the eye, not the dome's centre, so the sky's horizon lines up with the sea's.
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDir = normalize(world.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon, uGlow, uSun;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          // At and below the horizon the sky is the fog colour, so the sea's far edge melts into it.
          vec3 color = mix(uHorizon, uMid, smoothstep(0.0, 0.14, y));
          color = mix(color, uTop, smoothstep(0.14, 0.7, y));
          // Sunset: a warm band that hugs the horizon, strongest toward the sun.
          float toward = max(dot(normalize(vDir.xz + 1e-5), normalize(uSun.xz)), 0.0);
          float band = exp(-max(y, 0.0) * 22.0) * smoothstep(-0.015, 0.005, y);
          color += uGlow * band * pow(toward, 3.0) * 0.55;
          // A small halo around the sun itself.
          color += uGlow * pow(max(dot(vDir, uSun), 0.0), 60.0) * 0.5;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
}

// Swept-back wing as a thin triangle: root along the body, tip trailing behind. Flat in the xz plane.
const wingGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, -0.05),
  new THREE.Vector3(0, 0, 0.06),
  new THREE.Vector3(0.32, 0, 0.1),
]);

/** A gull: two swept wings that flap, circling high over the boards. */
function gull(): THREE.Group {
  const material = new THREE.MeshBasicMaterial({ color: 0x8fa3b3, side: THREE.DoubleSide });
  const left = new THREE.Mesh(wingGeo, material);
  const right = new THREE.Mesh(wingGeo, material);
  right.scale.x = -1; // mirror, so both tips trail behind
  const bird = new THREE.Group();
  bird.add(left, right);
  bird.userData = { left, right };
  return bird;
}

/** Sky, sun glare, drifting low fog and a few gulls. Returns a per-frame update function. */
export function createAmbient(scene: THREE.Scene, sunDirection: THREE.Vector3): (dt: number, time: number) => void {
  const sun = sunDirection.clone().normalize();
  scene.add(skyDome(sun));

  const soft = softTexture();
  const glare = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: soft, color: THEME.sunGlow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  glare.material.opacity = 0.55;
  glare.position.copy(sun).multiplyScalar(600);
  glare.scale.setScalar(90);
  scene.add(glare);

  const wisps = Array.from({ length: WISPS }, (_, i) => {
    const wisp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: soft, color: 0xa9c4d8, transparent: true, opacity: 0.06 + Math.random() * 0.06, depthWrite: false }),
    );
    wisp.position.set((i / WISPS - 0.5) * WISP_RANGE, 0.6 + Math.random() * 1.2, -8 + Math.random() * 14);
    wisp.scale.set(8 + Math.random() * 6, 2 + Math.random(), 1);
    scene.add(wisp);
    return wisp;
  });

  const gulls = Array.from({ length: GULLS }, (_, i) => {
    const bird = gull();
    bird.userData.orbit = { radius: 5 + i * 2, height: 3 + Math.random() * 2, speed: 0.12 + Math.random() * 0.08, phase: Math.random() * Math.PI * 2 };
    scene.add(bird);
    return bird;
  });

  return (dt, time) => {
    for (const wisp of wisps) {
      wisp.position.x += dt * 0.4;
      if (wisp.position.x > WISP_RANGE / 2) wisp.position.x -= WISP_RANGE;
    }
    for (const bird of gulls) {
      const { radius, height, speed, phase } = bird.userData.orbit;
      const a = time * speed + phase;
      bird.position.set(Math.cos(a) * radius, height + Math.sin(time * 0.5 + phase) * 0.4, Math.sin(a) * radius + GULL_CENTER_Z);
      bird.rotation.y = Math.PI - a; // nose (−z) along the direction of travel
      const flap = Math.sin(time * 6 + phase) * 0.5;
      bird.userData.left.rotation.z = flap;
      bird.userData.right.rotation.z = -flap;
    }
  };
}
