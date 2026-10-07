/// <reference lib="webworker" />
import { createBoardGeometry } from '../physics/geometry';
import { planDrop } from './planDrop';
import type { PlanRequest, PlanWorkerResponse } from './plannerProtocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<PlanRequest>) => {
  const { id, rows, targetSlot, seed } = event.data;
  let response: PlanWorkerResponse;
  try {
    response = { id, ok: true, plan: planDrop(createBoardGeometry(rows), targetSlot, seed) };
  } catch (error) {
    response = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  scope.postMessage(response);
};
