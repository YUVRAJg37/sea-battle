// 3D colors for the naval command theme; keep in step with the CSS variables in style.css.
export const THEME = {
  skyTop: 0x060e18,
  skyMid: 0x1f2c47, // dusk blue-violet between the horizon and the top
  horizon: 0x1d3a56,
  sunGlow: 0xff9e5e,
  seaDeep: 0x0b2a42,
  seaShallow: 0x1d5f80,
  foam: 0xcfe8f5,
  myBoard: 0x1d6b55,
  enemyBoard: 0x6b1d2a,
  grid: 0x7fe0a6,
  label: 'rgba(127, 224, 166, 0.85)',
  amber: 0xffc857,
  hit: 0xe05b4f,
  miss: 0xd8e6f0,
  fire: [0xff6a2b, 0xffa040, 0xffd060],
  smoke: 0x2e3a44,
  water: 0xe3f2fd,
} as const;

/** Where the (art-directed) sun sits: setting, behind the boards, so its glint reaches the camera. */
export const SUN_DIRECTION = { x: 0.35, y: 0.12, z: -1 } as const;
