import type { GameConfig } from '../config/gameConfig';
import { toCents, type Cents } from '../utils/money';

export type BetProblem = 'NOT_A_NUMBER' | 'BELOW_MIN' | 'ABOVE_MAX' | 'INSUFFICIENT_FUNDS';

export type BetValidation = { readonly ok: true } | { readonly ok: false; readonly problem: BetProblem; readonly message: string };

export function validateBet(betCents: Cents, balanceCents: Cents, config: GameConfig): BetValidation {
  if (!Number.isFinite(betCents) || !Number.isInteger(betCents)) {
    return { ok: false, problem: 'NOT_A_NUMBER', message: 'Enter a valid bet amount.' };
  }
  if (betCents < toCents(config.minBet)) {
    return { ok: false, problem: 'BELOW_MIN', message: `Minimum bet is $${config.minBet.toFixed(2)}.` };
  }
  if (betCents > toCents(config.maxBet)) {
    return { ok: false, problem: 'ABOVE_MAX', message: `Maximum bet is $${config.maxBet.toFixed(2)}.` };
  }
  if (betCents > balanceCents) {
    return { ok: false, problem: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance for this bet.' };
  }
  return { ok: true };
}

export function parseBetInput(raw: string): Cents {
  const cleaned = raw.trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return Number.NaN;
  return toCents(Number(cleaned));
}
