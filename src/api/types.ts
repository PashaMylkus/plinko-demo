import type { RiskLevel } from '../config/multipliers';

export interface PlayRequest {
  readonly betAmount: number;
  readonly rows: number;
  readonly risk: RiskLevel;
}

export interface PlaySuccessResponse {
  readonly success: true;
  readonly gameId: string;
  readonly ballId: string;
  readonly betAmount: number;
  readonly targetSlot: number;
  readonly multiplier: number;
  readonly winAmount: number;
  readonly timestamp: string;
  readonly rows: number;
  readonly risk: RiskLevel;
}

export type PlayErrorCode = 'INVALID_BET' | 'INVALID_ROWS' | 'INVALID_RISK' | 'INTERNAL_ERROR';

export interface PlayErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: PlayErrorCode;
    readonly message: string;
  };
  readonly timestamp: string;
}

export type PlayResponse = PlaySuccessResponse | PlayErrorResponse;

/**
 * Contract between the game and its backend. The mock implements it today;
 * a real HTTP client can implement it later without touching game logic.
 */
export interface PlinkoApi {
  play(request: PlayRequest): Promise<PlayResponse>;
}
