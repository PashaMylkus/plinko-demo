import { describe, expect, it } from 'vitest';
import type { PlayRequest, PlaySuccessResponse } from '../src/api/types';
import { GAME_CONFIG } from '../src/config/gameConfig';
import { parseBetInput, validateBet } from '../src/game/betValidation';
import { GameState, GameStateMachine } from '../src/game/GameState';
import { History } from '../src/game/History';
import { validatePlayResult } from '../src/game/validatePlayResult';
import { InsufficientFundsError, Wallet } from '../src/game/Wallet';

describe('GameStateMachine', () => {
  it('follows the round lifecycle', () => {
    const machine = new GameStateMachine();
    expect(machine.state).toBe(GameState.IDLE);
    machine.transition(GameState.WAITING_FOR_RESULT);
    expect(machine.isBusy).toBe(true);
    machine.transition(GameState.BALL_DROPPING);
    machine.transition(GameState.RESULT);
    expect(machine.isBusy).toBe(false);
    machine.transition(GameState.WAITING_FOR_RESULT);
    machine.transition(GameState.ERROR);
    machine.transition(GameState.IDLE);
  });

  it('rejects illegal transitions', () => {
    const machine = new GameStateMachine();
    expect(() => {
      machine.transition(GameState.BALL_DROPPING);
    }).toThrow();
    expect(() => {
      machine.transition(GameState.RESULT);
    }).toThrow();
  });
});

describe('Wallet', () => {
  it('debits, credits and resets in cents', () => {
    const wallet = new Wallet(100000);
    wallet.debit(1000);
    wallet.credit(2500);
    expect(wallet.balance).toBe(101500);
    wallet.reset();
    expect(wallet.balance).toBe(100000);
  });

  it('refuses to overdraw', () => {
    const wallet = new Wallet(500);
    expect(() => {
      wallet.debit(501);
    }).toThrow(InsufficientFundsError);
    expect(wallet.balance).toBe(500);
  });
});

describe('History', () => {
  it('keeps the newest rounds first, up to the limit', () => {
    const history = new History(2);
    const base = { betCents: 100, winCents: 200, multiplier: 2, timestamp: new Date(), slot: 0, rows: 8, risk: 'low' as const };
    history.add({ ...base, id: 'a' });
    history.add({ ...base, id: 'b' });
    history.add({ ...base, id: 'c' });
    expect(history.entries.map((r) => r.id)).toEqual(['c', 'b']);
  });
});

describe('bet validation', () => {
  it('parses user input', () => {
    expect(parseBetInput('10')).toBe(1000);
    expect(parseBetInput('$2.5')).toBe(250);
    expect(parseBetInput('0,10')).toBe(10);
    expect(parseBetInput('abc')).toBeNaN();
    expect(parseBetInput('1.234')).toBeNaN();
    expect(parseBetInput('-1')).toBeNaN();
  });

  it('checks limits and balance', () => {
    expect(validateBet(1000, 100000, GAME_CONFIG).ok).toBe(true);
    expect(validateBet(Number.NaN, 100000, GAME_CONFIG)).toMatchObject({ ok: false, problem: 'NOT_A_NUMBER' });
    expect(validateBet(5, 100000, GAME_CONFIG)).toMatchObject({ ok: false, problem: 'BELOW_MIN' });
    expect(validateBet(50001, 100000, GAME_CONFIG)).toMatchObject({ ok: false, problem: 'ABOVE_MAX' });
    expect(validateBet(2000, 1000, GAME_CONFIG)).toMatchObject({ ok: false, problem: 'INSUFFICIENT_FUNDS' });
  });
});

describe('validatePlayResult', () => {
  const request: PlayRequest = { betAmount: 10, rows: 8, risk: 'low' };
  const ok: PlaySuccessResponse = {
    success: true,
    gameId: 'g',
    ballId: 'b',
    betAmount: 10,
    targetSlot: 0,
    multiplier: 5.6,
    winAmount: 56,
    timestamp: new Date().toISOString(),
    rows: 8,
    risk: 'low',
  };

  it('accepts a consistent result', () => {
    expect(validatePlayResult(request, ok)).toBe(ok);
  });

  it('rejects invalid slots and payouts', () => {
    expect(() => validatePlayResult(request, { ...ok, targetSlot: 9 })).toThrow(/invalid slot/);
    expect(() => validatePlayResult(request, { ...ok, targetSlot: 1.5 })).toThrow(/invalid slot/);
    expect(() => validatePlayResult(request, { ...ok, multiplier: 100 })).toThrow(/multiplier/);
    expect(() => validatePlayResult(request, { ...ok, winAmount: 999 })).toThrow(/win amount/);
    expect(() => validatePlayResult(request, { ...ok, rows: 9 })).toThrow(/board/);
  });

  it('surfaces API errors', () => {
    expect(() =>
      validatePlayResult(request, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'down' },
        timestamp: '',
      }),
    ).toThrow('down');
  });
});
