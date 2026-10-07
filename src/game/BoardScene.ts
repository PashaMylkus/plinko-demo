import { Application } from 'pixi.js';
import type { SoundPlayer } from '../audio/SoundManager';
import { getMultipliers, type RiskLevel } from '../config/multipliers';
import { PHYSICS } from '../physics/constants';
import { createBoardGeometry, type BoardGeometry } from '../physics/geometry';
import { PlinkoWorld } from '../physics/PlinkoWorld';
import { BoardRenderer } from '../render/BoardRenderer';
import { createSteering, type DropPlan } from '../steering/planDrop';

export interface DropOutcome {
  /** Slot the ball physically landed in, or null if it never landed. */
  readonly slot: number | null;
  readonly timedOut: boolean;
}

/** What the game controller needs from the board. */
export interface BoardPort {
  setBoard(rows: number, risk: RiskLevel): void;
  drop(plan: DropPlan): Promise<DropOutcome>;
  celebrate(slot: number, intensity: number): void;
  clearCelebration(): void;
}

interface ActiveDrop {
  readonly world: PlinkoWorld;
  readonly resolve: (outcome: DropOutcome) => void;
  accumulator: number;
}

/** Frames simulated per rendered frame at most, so a slow frame can't spiral. */
const MAX_CATCH_UP_FRAMES = 4;

/**
 * Runs the live drop: a fresh physics world per ball, stepped on a fixed
 * timestep from the render loop, with the renderer mirroring its state.
 */
export class BoardScene implements BoardPort {
  private geometry: BoardGeometry = createBoardGeometry(8);
  private active: ActiveDrop | null = null;
  private readonly resizeObserver: ResizeObserver;

  private constructor(
    private readonly app: Application,
    private readonly renderer: BoardRenderer,
    private readonly host: HTMLElement,
    private readonly sounds: SoundPlayer,
  ) {
    app.ticker.add((ticker) => {
      this.tick(ticker.deltaMS);
    });
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(host);
  }

  static async create(host: HTMLElement, sounds: SoundPlayer): Promise<BoardScene> {
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });
    app.canvas.setAttribute('aria-label', 'Plinko board');
    app.canvas.setAttribute('role', 'img');
    host.appendChild(app.canvas);
    return new BoardScene(app, new BoardRenderer(app), host, sounds);
  }

  setBoard(rows: number, risk: RiskLevel): void {
    if (this.active) throw new Error('Cannot change the board while a ball is in play');
    if (rows !== this.geometry.rows || this.renderer.isEmpty) {
      this.geometry = createBoardGeometry(rows);
      this.renderer.setBoard(this.geometry, getMultipliers(rows, risk));
      this.resize();
    } else {
      this.renderer.setMultipliers(getMultipliers(rows, risk));
    }
  }

  drop(plan: DropPlan): Promise<DropOutcome> {
    if (this.active) return Promise.reject(new Error('A ball is already in play'));
    const world = new PlinkoWorld(this.geometry);
    world.spawnBall(plan.spawn, createSteering(this.geometry, plan));
    const state = world.getBallState();
    if (state) this.renderer.showBall(state);
    this.sounds.play('spawn');
    return new Promise<DropOutcome>((resolve) => {
      this.active = { world, resolve, accumulator: 0 };
    });
  }

  celebrate(slot: number, intensity: number): void {
    this.renderer.highlightSlot(slot, intensity);
  }

  clearCelebration(): void {
    this.renderer.clearHighlights();
  }

  private tick(deltaMs: number): void {
    if (this.active) this.stepDrop(this.active, deltaMs);
    this.renderer.update(deltaMs);
  }

  private stepDrop(drop: ActiveDrop, deltaMs: number): void {
    drop.accumulator = Math.min(drop.accumulator + deltaMs, PHYSICS.frameMs * MAX_CATCH_UP_FRAMES);
    while (drop.accumulator >= PHYSICS.frameMs) {
      drop.accumulator -= PHYSICS.frameMs;
      const events = drop.world.stepFrame();
      for (const peg of events.pegHits) this.renderer.pegHit(peg);
      if (events.pegHits.length > 0) this.sounds.play('peg');
      const state = drop.world.getBallState();
      if (state) this.renderer.syncBall(state);

      if (events.landedSlot !== null) {
        this.finish(drop, { slot: events.landedSlot, timedOut: false });
        return;
      }
      if (drop.world.substepCount >= PHYSICS.maxSubsteps) {
        this.finish(drop, { slot: null, timedOut: true });
        return;
      }
    }
  }

  private finish(drop: ActiveDrop, outcome: DropOutcome): void {
    this.active = null;
    drop.world.destroy();
    if (outcome.timedOut) {
      this.renderer.hideBall();
    } else {
      this.renderer.sinkBall();
      this.sounds.play('land');
    }
    drop.resolve(outcome);
  }

  private resize(): void {
    const width = Math.max(1, Math.floor(this.host.clientWidth));
    const height = Math.max(1, Math.floor(this.host.clientHeight));
    this.app.renderer.resize(width, height);
    this.renderer.layout(width, height);
  }
}
