import { PHYSICS } from './constants';
import type { BoardGeometry } from './geometry';
import { PlinkoWorld, type BallForceController, type SpawnOptions } from './PlinkoWorld';

export interface SimulationResult {
  readonly slot: number | null;
  readonly substeps: number;
  readonly frames: number;
  readonly pegHits: number;
}

export interface SimulationOptions {
  readonly maxSubsteps?: number;
  /** Called after every frame; return true to abort the run early. */
  readonly shouldAbort?: (world: PlinkoWorld) => boolean;
}

/** Runs a complete drop headlessly, exactly as the live board would run it. */
export function simulateDrop(
  geometry: BoardGeometry,
  spawn: SpawnOptions,
  controller: BallForceController | null,
  options: SimulationOptions = {},
): SimulationResult {
  const world = new PlinkoWorld(geometry);
  const maxSubsteps = options.maxSubsteps ?? PHYSICS.maxSubsteps;
  world.spawnBall(spawn, controller);
  let frames = 0;
  let pegHits = 0;
  let slot: number | null = null;
  try {
    while (world.substepCount < maxSubsteps) {
      const events = world.stepFrame();
      frames++;
      pegHits += events.pegHits.length;
      if (events.landedSlot !== null) {
        slot = events.landedSlot;
        break;
      }
      if (options.shouldAbort?.(world)) break;
    }
    return { slot, substeps: world.substepCount, frames, pegHits };
  } finally {
    world.destroy();
  }
}
