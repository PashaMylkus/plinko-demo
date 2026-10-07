import { GAME_CONFIG } from '../config/gameConfig';
import { getMultiplier, isRiskLevel, isValidRowCount, MAX_ROWS, MIN_ROWS } from '../config/multipliers';
import { toCents, toDollars } from '../utils/money';
import type { RandomFn } from '../utils/rng';
import type { PlayErrorCode, PlayErrorResponse, PlayRequest, PlayResponse, PlinkoApi } from './types';

export interface MockPlinkoApiOptions {
  /** Inclusive latency range in milliseconds. */
  readonly minLatencyMs?: number;
  readonly maxLatencyMs?: number;
  /** Probability (0..1) that a call fails with a simulated server error. */
  readonly failureRate?: number;
  readonly random?: RandomFn;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * In-memory stand-in for a Plinko game server. It validates the request,
 * simulates network latency and picks the outcome slot itself, exactly as a
 * real backend would. No network requests are made.
 */
export class MockPlinkoApi implements PlinkoApi {
  private readonly minLatencyMs: number;
  private readonly maxLatencyMs: number;
  private readonly failureRate: number;
  private readonly random: RandomFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private sequence = 0;

  constructor(options: MockPlinkoApiOptions = {}) {
    this.minLatencyMs = options.minLatencyMs ?? 300;
    this.maxLatencyMs = options.maxLatencyMs ?? 700;
    this.failureRate = options.failureRate ?? 0;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => new Date());
  }

  async play(request: PlayRequest): Promise<PlayResponse> {
    const latency = this.minLatencyMs + this.random() * (this.maxLatencyMs - this.minLatencyMs);
    await this.sleep(Math.round(latency));

    const validationError = this.validate(request);
    if (validationError) return validationError;

    if (this.random() < this.failureRate) {
      return this.error('INTERNAL_ERROR', 'Game server is temporarily unavailable. Please try again.');
    }

    const { rows, risk } = request;
    const targetSlot = this.pickSlot(rows);
    const multiplier = getMultiplier(rows, risk, targetSlot);
    const betCents = toCents(request.betAmount);
    const winCents = Math.round(betCents * multiplier);
    const id = this.nextId();

    return {
      success: true,
      gameId: `mock-game-${id}`,
      ballId: `ball-${id}`,
      betAmount: toDollars(betCents),
      targetSlot,
      multiplier,
      winAmount: toDollars(winCents),
      timestamp: this.now().toISOString(),
      rows,
      risk,
    };
  }

  /**
   * A fair board is a sequence of left/right coin flips, so the slot follows a
   * binomial distribution: centre slots are common, edge slots are rare.
   */
  private pickSlot(rows: number): number {
    let slot = 0;
    for (let i = 0; i < rows; i++) {
      if (this.random() < 0.5) slot++;
    }
    return slot;
  }

  private validate(request: PlayRequest): PlayErrorResponse | null {
    const bet = request.betAmount;
    if (typeof bet !== 'number' || !Number.isFinite(bet)) {
      return this.error('INVALID_BET', 'Bet amount must be a number.');
    }
    if (toCents(bet) < toCents(GAME_CONFIG.minBet) || toCents(bet) > toCents(GAME_CONFIG.maxBet)) {
      return this.error(
        'INVALID_BET',
        `Bet must be between ${GAME_CONFIG.minBet} and ${GAME_CONFIG.maxBet}.`,
      );
    }
    if (!isValidRowCount(request.rows)) {
      return this.error('INVALID_ROWS', `Rows must be between ${MIN_ROWS} and ${MAX_ROWS}.`);
    }
    if (!isRiskLevel(request.risk)) {
      return this.error('INVALID_RISK', 'Risk must be low, medium or high.');
    }
    return null;
  }

  private error(code: PlayErrorCode, message: string): PlayErrorResponse {
    return { success: false, error: { code, message }, timestamp: this.now().toISOString() };
  }

  private nextId(): string {
    this.sequence += 1;
    const entropy = Math.floor(this.random() * 0xffffff)
      .toString(16)
      .padStart(6, '0');
    return `${Date.now().toString(36)}-${this.sequence}-${entropy}`;
  }
}

/** Shared instance used by the app. */
export const mockPlinkoApi: PlinkoApi = new MockPlinkoApi();
