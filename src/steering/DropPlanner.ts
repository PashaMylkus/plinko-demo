import { createBoardGeometry } from '../physics/geometry';
import { planDrop, type DropPlan } from './planDrop';
import type { PlanRequest, PlanWorkerResponse } from './plannerProtocol';

const WORKER_TIMEOUT_MS = 4000;

interface Pending {
  resolve: (plan: DropPlan) => void;
  reject: (error: Error) => void;
}

/**
 * Computes drop plans off the main thread when Web Workers are available,
 * so rehearsing candidate paths never stutters the board animation.
 */
export class DropPlanner {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<PlanWorkerResponse>) => {
        this.onMessage(event.data);
      };
      this.worker.onerror = () => {
        this.disableWorker(new Error('Planner worker crashed'));
      };
    } catch {
      this.worker = null;
    }
  }

  plan(rows: number, targetSlot: number, seed: number): Promise<DropPlan> {
    const worker = this.worker;
    if (!worker) return Promise.resolve(planDrop(createBoardGeometry(rows), targetSlot, seed));
    const id = this.nextId++;
    const request: PlanRequest = { id, rows, targetSlot, seed };
    return new Promise<DropPlan>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Planner worker timed out'));
      }, WORKER_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (plan) => {
          clearTimeout(timer);
          resolve(plan);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      worker.postMessage(request);
    }).catch(() => planDrop(createBoardGeometry(rows), targetSlot, seed));
  }

  private onMessage(response: PlanWorkerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.plan);
    else pending.reject(new Error(response.message));
  }

  private disableWorker(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
