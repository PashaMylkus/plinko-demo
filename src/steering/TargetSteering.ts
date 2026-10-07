import Matter from 'matter-js';
import type { BoardGeometry } from '../physics/geometry';
import type { BallForceController, PlinkoWorld } from '../physics/PlinkoWorld';
import { clamp } from '../utils/math';

const FRAMES_PER_ROW = 14;
const VELOCITY_GAIN = 1.2;

export class TargetSteering implements BallForceController {
  private readonly targetX: number;

  constructor(
    private readonly geometry: BoardGeometry,
    targetSlot: number,
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
    const desiredVx = error / (rowsLeft * FRAMES_PER_ROW);
    const vx = Matter.Body.getVelocity(ball).x;
    const settled = rowsLeft < 2 && Math.abs(error) < g.pegSpacing * 0.3;
    const demand = settled ? 0 : clamp((desiredVx - vx) * VELOCITY_GAIN, -1, 1);
    const force = demand * this.strength * world.ballWeight;
    if (force !== 0) Matter.Body.applyForce(ball, ball.position, { x: force, y: 0 });
  }
}
