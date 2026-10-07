import Matter from 'matter-js';
import { createSeededRandom, type RandomFn } from '../utils/rng';
import { PHYSICS, SUBSTEP_MS } from './constants';
import { slotIndexAt, type BoardGeometry, type WallLayout } from './geometry';

const PEG_LABEL = 'peg';
const BALL_LABEL = 'ball';
const SENSOR_LABEL = 'slot-sensor';

export interface BallForceController {
  beforeSubstep(ball: Matter.Body, substep: number, world: PlinkoWorld): void;
}

export interface SpawnOptions {
  readonly x: number;
  readonly vx: number;
  readonly seed: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
}

export interface WorldStepEvents {
  readonly pegHits: readonly number[];
  readonly landedSlot: number | null;
}

export class PlinkoWorld {
  readonly geometry: BoardGeometry;
  private readonly engine: Matter.Engine;
  private ball: Matter.Body | null = null;
  private controller: BallForceController | null = null;
  private random: RandomFn = createSeededRandom(1);
  private substep = 0;
  private slowSubsteps = 0;
  private landedSlot: number | null = null;
  private pendingPegHits: number[] = [];

  constructor(geometry: BoardGeometry) {
    this.geometry = geometry;
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: PHYSICS.gravityY, scale: PHYSICS.gravityScale },
      positionIterations: 8,
      velocityIterations: 6,
    });
    Matter.Composite.add(this.engine.world, this.createStaticBodies());
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      this.onCollisionStart(event);
    });
  }

  get substepCount(): number {
    return this.substep;
  }

  get hasBall(): boolean {
    return this.ball !== null;
  }

  get landed(): number | null {
    return this.landedSlot;
  }

  get ballWeight(): number {
    return this.ball ? this.ball.mass * PHYSICS.gravityY * PHYSICS.gravityScale : 0;
  }

  spawnBall(options: SpawnOptions, controller: BallForceController | null = null): void {
    this.removeBall();
    const { spawn, ballRadius } = this.geometry;
    const ball = Matter.Bodies.circle(options.x, spawn.y, ballRadius, {
      label: BALL_LABEL,
      restitution: PHYSICS.ballRestitution,
      friction: PHYSICS.ballFriction,
      frictionStatic: 0,
      frictionAir: PHYSICS.ballFrictionAir,
      density: PHYSICS.ballDensity,
      slop: 0.01,
    });
    Matter.Body.setVelocity(ball, { x: options.vx, y: 0 });
    Matter.Composite.add(this.engine.world, ball);
    this.ball = ball;
    this.controller = controller;
    this.random = createSeededRandom(options.seed);
    this.substep = 0;
    this.slowSubsteps = 0;
    this.landedSlot = null;
    this.pendingPegHits = [];
  }

  removeBall(): void {
    if (this.ball) Matter.Composite.remove(this.engine.world, this.ball);
    this.ball = null;
    this.controller = null;
  }

  getBallState(): BallState | null {
    const ball = this.ball;
    if (!ball) return null;
    const v = Matter.Body.getVelocity(ball);
    return { x: ball.position.x, y: ball.position.y, vx: v.x, vy: v.y, angle: ball.angle };
  }

  stepFrame(): WorldStepEvents {
    for (let i = 0; i < PHYSICS.substeps && this.landedSlot === null && this.ball; i++) {
      this.stepSubstep(this.ball);
    }
    const pegHits = this.pendingPegHits;
    this.pendingPegHits = [];
    return { pegHits, landedSlot: this.landedSlot };
  }

  destroy(): void {
    Matter.Events.off(this.engine, 'collisionStart');
    Matter.Composite.clear(this.engine.world, false);
    Matter.Engine.clear(this.engine);
    this.ball = null;
  }

  private stepSubstep(ball: Matter.Body): void {
    this.controller?.beforeSubstep(ball, this.substep, this);
    this.preventStall(ball);
    this.limitSpeed(ball);
    Matter.Engine.update(this.engine, SUBSTEP_MS);
    this.substep++;

    if (this.landedSlot === null && ball.position.y >= this.geometry.sensorY + this.geometry.ballRadius) {
      this.landedSlot = slotIndexAt(this.geometry, ball.position.x);
    }
  }

  private preventStall(ball: Matter.Body): void {
    if (Matter.Body.getSpeed(ball) < PHYSICS.stuckSpeed) {
      this.slowSubsteps++;
    } else {
      this.slowSubsteps = 0;
    }
    if (this.slowSubsteps < PHYSICS.stuckSubsteps) return;
    this.slowSubsteps = 0;
    const towardCentre = ball.position.x < this.geometry.centerX ? 1 : -1;
    const direction = this.random() < 0.75 ? towardCentre : -towardCentre;
    Matter.Body.setVelocity(ball, { x: direction * (1.2 + this.random()), y: -1.2 });
  }

  private limitSpeed(ball: Matter.Body): void {
    const speed = Matter.Body.getSpeed(ball);
    if (speed <= PHYSICS.maxBallSpeed) return;
    const v = Matter.Body.getVelocity(ball);
    const k = PHYSICS.maxBallSpeed / speed;
    Matter.Body.setVelocity(ball, { x: v.x * k, y: v.y * k });
  }

  private onCollisionStart(event: Matter.IEventCollision<Matter.Engine>): void {
    for (const pair of event.pairs) {
      const other = pair.bodyA.label === BALL_LABEL ? pair.bodyB : pair.bodyB.label === BALL_LABEL ? pair.bodyA : null;
      if (!other) continue;
      if (other.label === PEG_LABEL) {
        const pegIndex = (other.plugin as { pegIndex?: number }).pegIndex;
        if (pegIndex !== undefined) this.pendingPegHits.push(pegIndex);
      } else if (other.label === SENSOR_LABEL && this.landedSlot === null) {
        const slotIndex = (other.plugin as { slotIndex?: number }).slotIndex;
        if (slotIndex !== undefined) this.landedSlot = slotIndex;
      }
    }
  }

  private createStaticBodies(): Matter.Body[] {
    const g = this.geometry;
    const bodies: Matter.Body[] = [];

    for (const peg of g.pegs) {
      bodies.push(
        Matter.Bodies.circle(peg.x, peg.y, g.pegRadius, {
          isStatic: true,
          label: PEG_LABEL,
          restitution: PHYSICS.pegRestitution,
          friction: PHYSICS.pegFriction,
          plugin: { pegIndex: peg.index },
        }),
      );
    }

    for (const wall of g.walls) bodies.push(createRail(wall));

    const dividerTop = g.lastRowY;
    const dividerHeight = g.floorY - dividerTop;
    for (let k = 0; k <= g.slots.length; k++) {
      const x = g.slots[0] ? g.slots[0].left + k * g.pegSpacing : 0;
      bodies.push(
        Matter.Bodies.rectangle(x, dividerTop + dividerHeight / 2, g.pegRadius * 1.4, dividerHeight, {
          isStatic: true,
          label: 'divider',
          friction: PHYSICS.pegFriction,
        }),
      );
    }

    for (const slot of g.slots) {
      bodies.push(
        Matter.Bodies.rectangle(slot.centerX, g.sensorY + g.ballRadius, g.pegSpacing * 0.9, 4, {
          isStatic: true,
          isSensor: true,
          label: SENSOR_LABEL,
          plugin: { slotIndex: slot.index },
        }),
      );
    }

    bodies.push(
      Matter.Bodies.rectangle(g.centerX, g.floorY + 10, g.width, 20, { isStatic: true, label: 'floor' }),
    );
    return bodies;
  }
}

function createRail(wall: WallLayout): Matter.Body {
  const dx = wall.to.x - wall.from.x;
  const dy = wall.to.y - wall.from.y;
  const length = Math.hypot(dx, dy);
  return Matter.Bodies.rectangle((wall.from.x + wall.to.x) / 2, (wall.from.y + wall.to.y) / 2, 6, length, {
    isStatic: true,
    label: 'rail',
    angle: -Math.atan2(dx, dy),
    friction: 0,
    restitution: 0.3,
  });
}
