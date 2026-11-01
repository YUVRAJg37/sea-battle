import * as THREE from 'three';

const SKY = 0x87b5d6;
// Portrait screens have height to spare, so look down more steeply and fill the width.
const PITCH = { landscape: THREE.MathUtils.degToRad(55), portrait: THREE.MathUtils.degToRad(68) };
const VIEW_RADIUS = { landscape: 6.5, portrait: 5.7 }; // half a board plus margin

export interface Stage {
  scene: THREE.Scene;
  onFrame(cb: (dt: number, time: number) => void): void;
  /** Glide the camera over the board centered at `x`. */
  focusOn(x: number): void;
  /** Raycaster through the pointer position. */
  raycast(e: PointerEvent): THREE.Raycaster;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 35, 80);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x335577, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 14, 8);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const lookGoal = new THREE.Vector3(0, 0, 1); // slightly toward the camera so the HUD covers less board
  const look = lookGoal.clone();
  const goal = new THREE.Vector3();
  let distance = 20;
  let pitch = PITCH.landscape;

  const placeGoal = () =>
    goal.set(lookGoal.x, distance * Math.sin(pitch), lookGoal.z + distance * Math.cos(pitch));

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
  camera.position.copy(goal);

  const callbacks: ((dt: number, time: number) => void)[] = [];
  let last = performance.now();
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const ease = 1 - Math.exp(-dt * 4);
    camera.position.lerp(goal, ease);
    look.lerp(lookGoal, ease);
    camera.lookAt(look);
    for (const cb of callbacks) cb(dt, now / 1000);
    renderer.render(scene, camera);
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  return {
    scene,
    onFrame: (cb) => void callbacks.push(cb),
    focusOn(x) {
      lookGoal.x = x;
      placeGoal();
    },
    raycast(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster;
    },
  };
}
