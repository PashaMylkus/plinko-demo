/**
 * Physical tuning for the board. The world uses fixed logical units that are
 * independent of screen size; rendering scales the world to fit the canvas,
 * so the simulation behaves identically on every device.
 */
export const PHYSICS = {
  /** Horizontal distance between neighbouring pegs. */
  pegSpacing: 40,
  /** Vertical distance between peg rows. */
  rowSpacing: 36,
  pegRadius: 5.5,
  ballRadius: 10.5,
  gravityY: 1,
  gravityScale: 0.0025,
  ballRestitution: 0.4,
  ballFriction: 0.04,
  ballFrictionAir: 0.035,
  ballDensity: 0.002,
  pegRestitution: 0,
  pegFriction: 0.04,
  /** Fixed simulation step. Substeps keep the fast ball from tunnelling. */
  frameMs: 1000 / 60,
  substeps: 2,
  /** Speed cap in Matter base-delta units (px per 16.67ms). */
  maxBallSpeed: 13,
  /** Substeps a ball may stay almost still before it is nudged free. */
  stuckSubsteps: 40,
  stuckSpeed: 0.12,
  /** Hard stop for a single drop, in substeps (~25 seconds). */
  maxSubsteps: 60 * 2 * 25,
} as const;

export const SUBSTEP_MS = PHYSICS.frameMs / PHYSICS.substeps;
