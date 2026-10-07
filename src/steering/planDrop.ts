import type { BoardGeometry } from '../physics/geometry';
import type { SpawnOptions } from '../physics/PlinkoWorld';
import { simulateDrop } from '../physics/simulateDrop';
import { createSeededRandom, randomBetween } from '../utils/rng';
import { TargetSteering } from './TargetSteering';

export interface DropPlan {
  readonly targetSlot: number;
  readonly spawn: SpawnOptions;
  /** Steering strength (fraction of ball weight). 0 = untouched physics. */
  readonly strength: number;
  /** Candidate runs evaluated before this plan was chosen. */
  readonly attempts: number;
  /** Whether a headless rehearsal of this exact plan hit the target. */
  readonly verified: boolean;
}

/**
 * Escalating steering strengths. Weak levels are tried first so the visible
 * path stays as close to free physics as possible; strong levels guarantee
 * convergence for the rare edge slots.
 */
const STRENGTH_SCHEDULE: readonly { strength: number; tries: number }[] = [
  { strength: 0, tries: 3 },
  { strength: 0.05, tries: 3 },
  { strength: 0.1, tries: 3 },
  { strength: 0.18, tries: 3 },
  { strength: 0.28, tries: 3 },
  { strength: 0.42, tries: 4 },
  { strength: 0.6, tries: 6 },
];

export function createSteering(geometry: BoardGeometry, plan: DropPlan): TargetSteering {
  return new TargetSteering(geometry, plan.targetSlot, plan.strength);
}

/**
 * Finds spawn conditions and a steering strength under which the real
 * physics simulation lands in `targetSlot`. Each candidate is rehearsed
 * headlessly with the same deterministic world the player will see, so the
 * live drop replays a path already proven to land on target.
 */
export function planDrop(geometry: BoardGeometry, targetSlot: number, seed: number): DropPlan {
  const target = geometry.slots[targetSlot];
  if (!target) throw new Error(`Invalid target slot ${targetSlot}`);
  const random = createSeededRandom(seed);
  const s = geometry.pegSpacing;
  const targetSide = Math.sign(target.centerX - geometry.centerX);
  let attempts = 0;
  let fallback: DropPlan | null = null;

  // Far-off slots almost never happen under free physics; skip the levels
  // that would just burn rehearsals on them.
  const distance = Math.abs(targetSlot - geometry.rows / 2) / (geometry.rows / 2);
  const firstLevel = distance > 0.6 ? 3 : distance > 0.3 ? 1 : 0;

  for (const level of STRENGTH_SCHEDULE.slice(firstLevel)) {
    for (let t = 0; t < level.tries; t++) {
      attempts++;
      // Steered runs lean the spawn jitter towards the target side, the way a
      // natural run that ends there would usually start.
      const lean = level.strength > 0 && targetSide !== 0 && random() < 0.7 ? targetSide : random() < 0.5 ? -1 : 1;
      const spawn: SpawnOptions = {
        x: geometry.spawn.x + lean * randomBetween(random, 0.04, 0.32) * s,
        vx: randomBetween(random, -0.35, 0.35),
        seed: Math.floor(random() * 0xffffffff),
      };
      const plan: DropPlan = { targetSlot, spawn, strength: level.strength, attempts, verified: false };
      const result = simulateDrop(geometry, spawn, createSteering(geometry, plan), {
        shouldAbort: (world) => {
          const ball = world.getBallState();
          if (!ball || ball.y > geometry.lastRowY) return false;
          const rowsLeft = (geometry.lastRowY - ball.y) / geometry.rowSpacing + 1;
          return Math.abs(target.centerX - ball.x) > rowsLeft * s * 0.75 + s;
        },
      });
      if (result.slot === targetSlot) return { ...plan, verified: true };
      fallback = plan;
    }
  }

  // Practically unreachable (covered by tests); the live run still steers.
  return fallback ?? {
    targetSlot,
    spawn: { x: geometry.spawn.x, vx: 0, seed },
    strength: 1,
    attempts,
    verified: false,
  };
}
