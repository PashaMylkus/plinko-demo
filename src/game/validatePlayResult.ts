import type { PlayRequest, PlayResponse, PlaySuccessResponse } from '../api/types';
import { getMultipliers } from '../config/multipliers';
import { toCents } from '../utils/money';

export class InvalidResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResultError';
  }
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function validatePlayResult(request: PlayRequest, response: PlayResponse): PlaySuccessResponse {
  if (!response.success) throw new ApiError(response.error.message);
  if (response.rows !== request.rows || response.risk !== request.risk) {
    throw new InvalidResultError('Result does not match the requested board.');
  }
  if (toCents(response.betAmount) !== toCents(request.betAmount)) {
    throw new InvalidResultError('Result does not match the requested bet.');
  }
  const multipliers = getMultipliers(request.rows, request.risk);
  const slot = response.targetSlot;
  if (!Number.isInteger(slot) || slot < 0 || slot >= multipliers.length) {
    throw new InvalidResultError(`Server returned an invalid slot (${String(slot)}).`);
  }
  if (multipliers[slot] !== response.multiplier) {
    throw new InvalidResultError('Server multiplier does not match the payout table.');
  }
  const expectedWin = Math.round(toCents(request.betAmount) * response.multiplier);
  if (Math.abs(toCents(response.winAmount) - expectedWin) > 1) {
    throw new InvalidResultError('Server win amount is inconsistent.');
  }
  return response;
}
