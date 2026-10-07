import Matter from 'matter-js';
import type { BoardGeometry } from '../physics/geometry';
import type { BallForceController, PlinkoWorld } from '../physics/PlinkoWorld';
import { clamp } from '../utils/math';

/** Typical frames a ball spends per row of pegs (measured from free runs). */
const FRAMES_PER_ROW = 14;
/** Full steering force at this much sideways speed error (px per frame). */
const VELOCITY_GAIN = 1.2;

/**
 * Outcome steering, kept apart from the physics world.
 *
 * Each substep it applies a small horizontal force (a fraction of the ball's
 * weight, like a slightly tilted board) that grows only as much as needed to
 * keep the target slot reachable in the rows that remain. Pegs, gravity and
 * collisions still do all the visible work; the force just biases them.
 */
export class TargetSteering implements BallForceController {
  private readonly targetX: number;

  constructor(
    private readonly geometry: BoardGeometry,
    targetSlot: number,
    /** Maximum lateral force as a fraction of the ball's weight. */
    private readonly strength: number,
  ) {
    const slot = geometry.slots[targetSlot];
    if (!slot) throw new Error(`Invalid target slot ${targetSlot}`);
    this.targetX = slot.centerX;
  }

  beforeSubstep(ball: Matter.Body, _substep: number, world: PlinkoWorld): void {
    if (this.strength <= 0) return;
    const g = this.geometry;
    const { x, y } = ball.position;
    if (y < g.firstRowY - g.rowSpacing || y > g.lastRowY + g.rowSpacing * 0.4) return;

    const error = this.targetX - x;
    const rowsLeft = Math.max((g.lastRowY - y) / g.rowSpacing, 0) + 0.6;
    // Sideways speed that would carry the ball to the target column by the
    // time it reaches the bottom row, given the typical time per row.
    const desiredVx = error / (rowsLeft * FRAMES_PER_ROW);
    const vx = Matter.Body.getVelocity(ball).x;
    // Inside the target column near the bottom there is nothing to correct.
    const settled = rowsLeft < 2 && Math.abs(error) < g.pegSpacing * 0.3;
    const demand = settled ? 0 : clamp((desiredVx - vx) * VELOCITY_GAIN, -1, 1);
    const force = demand * this.strength * world.ballWeight;
    if (force !== 0) Matter.Body.applyForce(ball, ball.position, { x: force, y: 0 });
  }
}
