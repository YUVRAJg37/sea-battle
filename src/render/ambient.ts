import * as THREE from 'three';
import { THEME } from './theme';

const GULLS = 5;
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
    new THREE.SphereGeometry(90, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(THEME.skyTop) },
        uHorizon: { value: new THREE.Color(THEME.horizon) },
        uGlow: { value: new THREE.Color(THEME.sunGlow) },
        uSun: { value: sun },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uGlow, uSun;
        varying vec3 vDir;
        void main() {
          vec3 color = mix(uHorizon, uTop, smoothstep(0.0, 0.5, vDir.y));
          float glow = pow(max(dot(vDir, uSun), 0.0), 8.0);
          gl_FragColor = vec4(color + uGlow * glow * 0.45, 1.0);
        }
      `,
    }),
  );
}

/** A gull: two flat wings that flap, circling high over the boards. */
function gull(): THREE.Group {
  const wingGeo = new THREE.PlaneGeometry(0.35, 0.08).translate(0.175, 0, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0xdfe8ee, side: THREE.DoubleSide, fog: false });
  const left = new THREE.Mesh(wingGeo, material);
  const right = new THREE.Mesh(wingGeo, material);
  right.rotation.y = Math.PI;
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
  glare.position.copy(sun).multiplyScalar(80);
  glare.scale.setScalar(26);
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
    bird.userData.orbit = { radius: 9 + i * 2.5, height: 7 + Math.random() * 3, speed: 0.12 + Math.random() * 0.08, phase: Math.random() * Math.PI * 2 };
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
      bird.position.set(Math.cos(a) * radius, height + Math.sin(time * 0.5 + phase) * 0.4, Math.sin(a) * radius - 4);
      bird.rotation.y = -a; // face along the circle
      const flap = Math.sin(time * 6 + phase) * 0.5;
      bird.userData.left.rotation.z = flap;
      bird.userData.right.rotation.z = -flap;
    }
  };
}
