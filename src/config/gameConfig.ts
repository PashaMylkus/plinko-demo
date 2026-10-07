import type { RiskLevel } from './multipliers';

export interface GameConfig {
  readonly startingBalance: number;
  readonly minBet: number;
  readonly maxBet: number;
  readonly defaultBet: number;
  readonly defaultRisk: RiskLevel;
  readonly defaultRows: number;
  readonly historyLimit: number;
  /** Multiplier at or above which a win is celebrated as a "big win". */
  readonly bigWinMultiplier: number;
  /** Quick-pick ladder used by the +/- buttons. */
  readonly betLadder: readonly number[];
}

export const GAME_CONFIG: GameConfig = {
  startingBalance: 1000,
  minBet: 0.1,
  maxBet: 500,
  defaultBet: 10,
  defaultRisk: 'medium',
  defaultRows: 12,
  historyLimit: 30,
  bigWinMultiplier: 10,
  betLadder: [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500],
};
