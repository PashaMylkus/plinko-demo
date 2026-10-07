import type { DropPlan } from './planDrop';

export interface PlanRequest {
  readonly id: number;
  readonly rows: number;
  readonly targetSlot: number;
  readonly seed: number;
}

export type PlanWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly plan: DropPlan }
  | { readonly id: number; readonly ok: false; readonly message: string };
