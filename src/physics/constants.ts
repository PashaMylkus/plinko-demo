export const PHYSICS = {
  pegSpacing: 40,
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
  frameMs: 1000 / 60,
  substeps: 2,
  maxBallSpeed: 13,
  stuckSubsteps: 40,
  stuckSpeed: 0.12,
  maxSubsteps: 60 * 2 * 25,
} as const;

export const SUBSTEP_MS = PHYSICS.frameMs / PHYSICS.substeps;
