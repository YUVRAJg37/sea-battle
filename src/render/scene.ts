import * as THREE from 'three';
import { AIRSTRIKE_LENGTH, BOARD_SIZE, SHIP_TYPES, lane, line, shipCells, type Cell, type Fleet, type GameState, type Ship, type ShipType, type TurnRecord } from '../engine';
import { ME, THEM } from '../game/match';
import { Board3D } from './board3d';
import { Effects, PACE } from './effects';
import { createStage, type Stage } from './stage';
import { createAmbient } from './ambient';
import { createOceanLife } from './oceanLife';
import { SUN_DIRECTION, THEME } from './theme';
import { createWater } from './water';

export type View = 'mine' | 'enemy' | 'overview';

/** The sounds the scene triggers as shots fly and land. */
export interface SceneSounds {
  cannon(): void;
  explosion(): void;
  splash(): void;
  torpedo(): void;
  airstrike(): void;
  bomb(): void;
  radar(): void;
  ricochet(): void;
}

const BOARD_OFFSET = 7; // boards sit at x = ±7
const OVERVIEW_ZOOM = 1.5;
const SLOW_MOTION = 0.25; // game speed while a ship sinks
const SLOW_MOTION_MS = 2200;
const OVERVIEW_PITCH = THREE.MathUtils.degToRad(13); // low enough that the real horizon and sunset are in view
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything 3D: both boards, the sea, effects and the camera. */
export class SeaScene {
  readonly mine: Board3D;
  readonly enemy: Board3D;
  private readonly stage: Stage;
  private readonly effects: Effects;
  private afloat: ShipType[] = []; // our ships still in the fight, for picking which one fires
  private timeScale = 1; // < 1 during slow motion; the camera keeps real time
  private gameTime = 0;

  constructor(canvas: HTMLCanvasElement, private readonly sounds?: SceneSounds) {
    this.stage = createStage(canvas);
    const sun = new THREE.Vector3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
    const animateWater = createWater(this.stage.scene, sun);
    const animateAmbient = createAmbient(this.stage.scene, sun);
    this.effects = new Effects(this.stage.scene);
    const animateLife = createOceanLife(this.stage.scene, this.effects);
    this.mine = new Board3D(this.stage.scene, -BOARD_OFFSET, THEME.myBoard);
    this.enemy = new Board3D(this.stage.scene, BOARD_OFFSET, THEME.enemyBoard);
    this.stage.onFrame((realDt) => {
      const dt = realDt * this.timeScale;
      const t = (this.gameTime += dt);
      animateWater(t);
      animateAmbient(dt, t);
      animateLife(dt, t);
      this.effects.update(dt);
      this.mine.update(dt, t);
      this.enemy.update(dt, t);
    });
  }

  focus(view: View): void {
    // The title view looks across the water so the horizon and sunset show behind the menu.
    if (view === 'overview') this.stage.focusOn(0, OVERVIEW_ZOOM, OVERVIEW_PITCH);
    else this.stage.focusOn((view === 'mine' ? this.mine : this.enemy).centerX);
  }

  cellUnder(e: PointerEvent, board: Board3D): Cell | null {
    return board.cellAt(this.stage.raycast(e));
  }

  /** Brings ships, markers and wrecks in line with the game state. */
  sync(state: GameState | null, fleet: Fleet): void {
    this.mine.setShips(fleet);
    this.afloat = SHIP_TYPES.filter((t) => !state?.players[ME].sunk.some((s) => s.type === t));
    if (!state) return;
    this.mine.setMarks(state.players[ME].marks);
    this.mine.sink(state.players[ME].sunk.map((s) => s.type));
    this.enemy.setShips(state.players[THEM].sunk);
    this.enemy.sink(state.players[THEM].sunk.map((s) => s.type));
    this.enemy.setMarks(state.players[THEM].marks);
  }

  /** Plays a turn's flight and impacts. Resolves once everything has landed. */
  async playTurn({ action, outcome }: TurnRecord, byMe: boolean): Promise<void> {
    const target = byMe ? this.enemy : this.mine;
    const launch = this.launchPoint(byMe);
    const at = (c: Cell, y = 0) => target.cellPosition(c, y);
    target.setLastShot([]);
    if (action.type === 'torpedo') this.sounds?.torpedo();
    else if (action.type === 'airstrike') this.sounds?.airstrike();
    else {
      this.effects.muzzle(launch);
      this.sounds?.cannon();
    }

    switch (action.type) {
      case 'torpedo': {
        // Launch from just off the board, one step back from the lane's first cell.
        const path = lane(action.lane, action.from);
        const [a, b] = [path[0]!, path[1]!];
        const launchCell = { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
        const end = outcome.hits[0] ?? path.at(-1)!;
        await this.effects.torpedo(at(launchCell, -0.05), at(end, -0.05));
        break;
      }
      case 'airstrike': {
        // The jet comes in along the strike line from well off the board and leaves the far side.
        const cells = line(action.origin, action.dir, AIRSTRIKE_LENGTH);
        const first = at(cells[0]!, 3);
        const last = at(cells.at(-1)!, 3);
        const run = last.clone().sub(first).normalize().multiplyScalar(7);
        await this.effects.airstrike(first.clone().sub(run), last.clone().add(run), cells.map((c) => at(c)), () => this.sounds?.bomb());
        break;
      }
      case 'radar':
        await this.effects.shell(launch, at(action.center));
        void this.effects.ping(at(action.center, 0.08));
        this.sounds?.radar();
        break;
      case 'ricochet': {
        // Misses splash and skip on; the landing cell is the second one in the outcome.
        const [first, landing] = [...outcome.misses, ...outcome.hits];
        await this.effects.shell(launch, at(first!));
        if (landing) {
          this.effects.splash(at(first!));
          this.sounds?.ricochet();
          await this.effects.shell(at(first!), at(landing), 0.7);
        }
        break;
      }
      default:
        await Promise.all(
          [...outcome.hits, ...outcome.misses].map((c, i) => sleep(i * 150 * PACE).then(() => this.effects.shell(launch, at(c)))),
        );
    }

    for (const c of outcome.hits) {
      this.effects.explosion(at(c, 0.3));
      this.effects.addFire(at(c, 0.4));
    }
    if (action.type !== 'torpedo') for (const c of outcome.misses) this.effects.splash(at(c));
    if (outcome.hits.length) this.stage.shake(0.2 + 0.1 * outcome.hits.length);
    if (outcome.hits.length) this.sounds?.explosion();
    else if (outcome.misses.length) this.sounds?.splash();
    if (action.type === 'radar') target.addRadar(action.center, outcome.radarCount ?? 0);
    target.setLastShot([...outcome.hits, ...outcome.misses]);
  }

  /** One of our surviving ships fires; enemy shells come from beyond the far edge of their grid. */
  private launchPoint(byMe: boolean): THREE.Vector3 {
    if (byMe) {
      const type = this.afloat[Math.floor(Math.random() * this.afloat.length)];
      const from = type && this.mine.shipCenter(type);
      if (from) return from;
    }
    const board = byMe ? this.mine : this.enemy;
    return board.cellPosition({ x: BOARD_SIZE / 2, y: -2 }, 0.5);
  }

  /** Slow motion and a push-in on a ship as it goes down, then back to the board. */
  async dramatizeSinking(ship: Ship, byMe: boolean): Promise<void> {
    const board = byMe ? this.enemy : this.mine;
    const cells = shipCells(ship);
    const at = board.cellPosition(cells[Math.floor(cells.length / 2)]!);
    this.timeScale = SLOW_MOTION;
    this.stage.focusOn(at.x, 0.45, THREE.MathUtils.degToRad(38), at.z + 0.5);
    await sleep(SLOW_MOTION_MS);
    this.timeScale = 1;
    this.focus(byMe ? 'enemy' : 'mine');
  }

  reset(): void {
    this.mine.reset();
    this.enemy.reset();
    this.effects.clear();
  }
}
