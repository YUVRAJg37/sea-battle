import * as THREE from 'three';
import { THEME } from './theme';

// Portrait screens have height to spare, so look down more steeply and fill the width.
const PITCH = { landscape: THREE.MathUtils.degToRad(55), portrait: THREE.MathUtils.degToRad(68) };
const VIEW_RADIUS = { landscape: 7.2, portrait: 6.3 }; // half a board plus room for labels and the HUD

export interface Stage {
  scene: THREE.Scene;
  onFrame(cb: (dt: number, time: number) => void): void;
  /** Glide the camera over the point at `x`; `zoom` > 1 pulls back. */
  focusOn(x: number, zoom?: number): void;
  /** Shake the camera; strength decays over about half a second. */
  shake(strength: number): void;
  /** Raycaster through the pointer position. */
  raycast(e: PointerEvent): THREE.Raycaster;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEME.sky);
  scene.fog = new THREE.Fog(THEME.sky, 30, 75);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0b1a2b, 1.3));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const lookGoal = new THREE.Vector3(0, 0, 0.6); // slightly toward the camera: the bottom HUD is taller than the top
  const look = lookGoal.clone();
  const goal = new THREE.Vector3();
  const base = new THREE.Vector3(); // camera position before shake
  let distance = 20;
  let zoom = 1;
  let pitch = PITCH.landscape;
  let shakeStrength = 0;

  const placeGoal = () =>
    goal.set(lookGoal.x, distance * zoom * Math.sin(pitch), lookGoal.z + distance * zoom * Math.cos(pitch));

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    const layout = camera.aspect < 1 ? 'portrait' : 'landscape';
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    pitch = PITCH[layout];
    distance = VIEW_RADIUS[layout] / (tanHalf * Math.min(camera.aspect, 1));
    placeGoal();
  }
  addEventListener('resize', resize);
  resize();
  base.copy(goal);

  const callbacks: ((dt: number, time: number) => void)[] = [];
  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    const ease = 1 - Math.exp(-dt * 4);
    base.lerp(goal, ease);
    look.lerp(lookGoal, ease);
    shakeStrength *= Math.exp(-dt * 6);
    camera.position.copy(base).add(
      new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shakeStrength),
    );
    camera.lookAt(look);
    for (const cb of callbacks) cb(dt, now / 1000);
    renderer.render(scene, camera);
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  return {
    scene,
    onFrame: (cb) => void callbacks.push(cb),
    focusOn(x, nextZoom = 1) {
      lookGoal.x = x;
      zoom = nextZoom;
      placeGoal();
    },
    shake(strength) {
      shakeStrength = Math.max(shakeStrength, strength);
    },
    raycast(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster;
    },
  };
}
