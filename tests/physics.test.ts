import { describe, expect, it } from 'vitest';
import { ROW_OPTIONS } from '../src/config/multipliers';
import { PHYSICS } from '../src/physics/constants';
import { createBoardGeometry } from '../src/physics/geometry';
import { PlinkoWorld } from '../src/physics/PlinkoWorld';
import { simulateDrop } from '../src/physics/simulateDrop';
import { createSteering, planDrop } from '../src/steering/planDrop';

describe('board geometry', () => {
  for (const rows of ROW_OPTIONS) {
    it(`${rows} rows has the right pegs and slots`, () => {
      const g = createBoardGeometry(rows);
      expect(g.slots).toHaveLength(rows + 1);
      expect(g.pegs).toHaveLength((rows * (rows + 5)) / 2);
      expect(g.pegSpacing - 2 * g.pegRadius).toBeGreaterThan(2 * g.ballRadius * 1.2);
    });
  }
});

describe('free physics', () => {
  it('drops land in a slot, never tunnel through pegs, and spread like a real board', () => {
    const g = createBoardGeometry(12);
    const minGap = g.pegRadius + g.ballRadius;
    const counts = new Array<number>(13).fill(0);
    for (let i = 0; i < 60; i++) {
      const world = new PlinkoWorld(g);
      world.spawnBall({ x: g.spawn.x + ((i % 11) - 5) * 1.3, vx: 0, seed: i }, null);
      let landed: number | null = null;
      while (world.substepCount < PHYSICS.maxSubsteps && landed === null) {
        landed = world.stepFrame().landedSlot;
        const ball = world.getBallState();
        if (!ball) break;
        for (const peg of g.pegs) {
          expect(Math.hypot(ball.x - peg.x, ball.y - peg.y)).toBeGreaterThan(minGap * 0.6);
        }
      }
      world.destroy();
      expect(landed).not.toBeNull();
      counts[landed ?? 0] = (counts[landed ?? 0] ?? 0) + 1;
    }
    const centre = (counts[5] ?? 0) + (counts[6] ?? 0) + (counts[7] ?? 0);
    expect(centre).toBeGreaterThan(15);
  });

  it('is deterministic for the same spawn', () => {
    const g = createBoardGeometry(14);
    const spawn = { x: g.spawn.x + 3.7, vx: 0.2, seed: 99 };
    const a = simulateDrop(g, spawn, null);
    const b = simulateDrop(g, spawn, null);
    expect(a).toEqual(b);
  });
});

describe('target steering', () => {
  for (const rows of ROW_OPTIONS) {
    it(`lands every slot on a ${rows}-row board`, () => {
      const g = createBoardGeometry(rows);
      for (let slot = 0; slot <= rows; slot++) {
        for (const seed of [rows * 1000 + slot, rows * 7919 + slot * 31]) {
          const plan = planDrop(g, slot, seed);
          expect(plan.verified, `rows ${rows} slot ${slot} seed ${seed}`).toBe(true);
          const replay = simulateDrop(g, plan.spawn, createSteering(g, plan));
          expect(replay.slot, `rows ${rows} slot ${slot} seed ${seed}`).toBe(slot);
          expect(replay.pegHits).toBeGreaterThan(rows / 2);
        }
      }
    });
  }

  it('leaves common centre outcomes to untouched physics most of the time', () => {
    const g = createBoardGeometry(16);
    let free = 0;
    for (let seed = 0; seed < 20; seed++) {
      if (planDrop(g, 8, seed).strength === 0) free++;
    }
    expect(free).toBeGreaterThan(5);
  });
});
