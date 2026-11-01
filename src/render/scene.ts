import * as THREE from 'three';
import { BOARD_SIZE, type Cell, type Fleet, type GameState, type TurnRecord } from '../engine';
import { ME, THEM } from '../game/match';
import { Board3D } from './board3d';
import { Effects } from './effects';
import { createOcean } from './ocean';
import { createStage, type Stage } from './stage';
import { THEME } from './theme';

export type View = 'mine' | 'enemy' | 'overview';

const BOARD_OFFSET = 7; // boards sit at x = ±7
const OVERVIEW_ZOOM = 1.7;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Everything 3D: both boards, the sea, effects and the camera. */
export class SeaScene {
  readonly mine: Board3D;
  readonly enemy: Board3D;
  private readonly stage: Stage;
  private readonly effects: Effects;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = createStage(canvas);
    const animateOcean = createOcean(this.stage.scene);
    this.effects = new Effects(this.stage.scene);
    this.mine = new Board3D(this.stage.scene, -BOARD_OFFSET, THEME.myBoard);
    this.enemy = new Board3D(this.stage.scene, BOARD_OFFSET, THEME.enemyBoard);
    this.stage.onFrame((dt, t) => {
      animateOcean(t);
      this.effects.update(dt);
      this.mine.update(dt);
      this.enemy.update(dt);
    });
  }

  focus(view: View): void {
    if (view === 'overview') this.stage.focusOn(0, OVERVIEW_ZOOM);
    else this.stage.focusOn((view === 'mine' ? this.mine : this.enemy).centerX);
  }

  cellUnder(e: PointerEvent, board: Board3D): Cell | null {
    return board.cellAt(this.stage.raycast(e));
  }

  /** Brings ships, markers and wrecks in line with the game state. */
  sync(state: GameState | null, fleet: Fleet): void {
    this.mine.setShips(fleet);
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
    const launch = new THREE.Vector3((byMe ? this.mine : this.enemy).centerX, 1.5, 0);
    const at = (c: Cell, y = 0) => target.cellPosition(c, y);
    target.setLastShot([]);

    switch (action.type) {
      case 'torpedo': {
        const edge = action.from === 'left' ? -1 : BOARD_SIZE;
        const end = outcome.hits[0] ?? { x: BOARD_SIZE - 1 - edge, y: action.row };
        await this.effects.torpedo(at({ x: edge, y: action.row }, -0.05), at(end, -0.05));
        break;
      }
      case 'radar':
        await this.effects.shell(launch, at(action.center));
        void this.effects.ping(at(action.center, 0.08));
        break;
      case 'scout':
        if (outcome.scouted) await this.effects.shell(launch, at(outcome.scouted));
        break;
      default:
        await Promise.all(
          [...outcome.hits, ...outcome.misses].map((c, i) => sleep(i * 150).then(() => this.effects.shell(launch, at(c)))),
        );
    }

    for (const c of outcome.hits) {
      this.effects.explosion(at(c, 0.3));
      this.effects.addFire(at(c, 0.4));
    }
    if (action.type !== 'torpedo') for (const c of outcome.misses) this.effects.splash(at(c));
    if (outcome.hits.length) this.stage.shake(0.2 + 0.1 * outcome.hits.length);
    if (action.type === 'radar') target.addRadar(action.center, outcome.radarCount ?? 0);
    if (outcome.scouted) target.addScout(outcome.scouted);
    target.setLastShot([...outcome.hits, ...outcome.misses]);
  }

  reset(): void {
    this.mine.reset();
    this.enemy.reset();
    this.effects.clear();
  }
}
