import type { SoundPlayer } from '../audio/SoundManager';
import type { PlayRequest, PlinkoApi, PlaySuccessResponse } from '../api/types';
import type { GameConfig } from '../config/gameConfig';
import { getMultipliers, isRiskLevel, isValidRowCount, type RiskLevel } from '../config/multipliers';
import type { DropPlan } from '../steering/planDrop';
import { toCents, toDollars, type Cents } from '../utils/money';
import { hashString } from '../utils/rng';
import { Emitter } from '../utils/Emitter';
import { validateBet, type BetValidation } from './betValidation';
import type { BoardPort } from './BoardScene';
import { GameState, GameStateMachine } from './GameState';
import { History } from './History';
import { validatePlayResult } from './validatePlayResult';
import { Wallet } from './Wallet';

export interface PlannerPort {
  plan(rows: number, targetSlot: number, seed: number): Promise<DropPlan>;
}

export interface GameSettings {
  readonly betCents: Cents;
  readonly risk: RiskLevel;
  readonly rows: number;
}

export interface RoundResult {
  readonly slot: number;
  readonly multiplier: number;
  readonly betCents: Cents;
  readonly winCents: Cents;
  readonly isBigWin: boolean;
}

export type GameEvent =
  | { readonly type: 'settings'; readonly settings: GameSettings }
  | { readonly type: 'message'; readonly tone: 'error' | 'info'; readonly text: string }
  | { readonly type: 'result'; readonly result: RoundResult };

export interface GameControllerDeps {
  readonly api: PlinkoApi;
  readonly board: BoardPort;
  readonly planner: PlannerPort;
  readonly sounds: SoundPlayer;
  readonly config: GameConfig;
}

const API_TIMEOUT_MS = 8000;

/** Orchestrates a round: validate, debit, ask the API, drop, settle. */
export class GameController {
  readonly state = new GameStateMachine();
  readonly wallet: Wallet;
  readonly history: History;
  readonly events = new Emitter<GameEvent>();
  private current: GameSettings;

  constructor(private readonly deps: GameControllerDeps) {
    const { config } = deps;
    this.wallet = new Wallet(toCents(config.startingBalance));
    this.history = new History(config.historyLimit);
    this.current = { betCents: toCents(config.defaultBet), risk: config.defaultRisk, rows: config.defaultRows };
  }

  get settings(): GameSettings {
    return this.current;
  }

  get multipliers(): readonly number[] {
    return getMultipliers(this.current.rows, this.current.risk);
  }

  init(): void {
    this.deps.board.setBoard(this.current.rows, this.current.risk);
    this.events.emit({ type: 'settings', settings: this.current });
  }

  validateCurrentBet(): BetValidation {
    return validateBet(this.current.betCents, this.wallet.balance, this.deps.config);
  }

  setBet(betCents: Cents): void {
    if (this.state.isBusy) return;
    this.update({ betCents });
  }

  setRisk(risk: RiskLevel): void {
    if (this.state.isBusy || !isRiskLevel(risk) || risk === this.current.risk) return;
    this.update({ risk });
    this.deps.board.setBoard(this.current.rows, risk);
  }

  setRows(rows: number): void {
    if (this.state.isBusy || !isValidRowCount(rows) || rows === this.current.rows) return;
    this.update({ rows });
    this.deps.board.setBoard(rows, this.current.risk);
  }

  /** Restores the starting balance and clears history. */
  reset(): void {
    if (this.state.isBusy) return;
    this.wallet.reset();
    this.history.clear();
    this.deps.board.clearCelebration();
    if (this.state.state !== GameState.IDLE) this.state.transition(GameState.IDLE);
    this.events.emit({ type: 'message', tone: 'info', text: 'Balance reset.' });
  }

  async drop(): Promise<void> {
    if (this.state.isBusy) return;
    const validation = this.validateCurrentBet();
    if (!validation.ok) {
      this.events.emit({ type: 'message', tone: 'error', text: validation.message });
      return;
    }

    const { betCents, rows, risk } = this.current;
    const request: PlayRequest = { betAmount: toDollars(betCents), rows, risk };
    this.deps.board.clearCelebration();
    this.wallet.debit(betCents);
    this.state.transition(GameState.WAITING_FOR_RESULT);

    let result: PlaySuccessResponse;
    let plan: DropPlan;
    try {
      const response = await withTimeout(this.deps.api.play(request), API_TIMEOUT_MS, 'The game server did not respond.');
      result = validatePlayResult(request, response);
      plan = await this.deps.planner.plan(rows, result.targetSlot, hashString(result.ballId));
    } catch (error) {
      // The round never started, so the stake goes back to the player.
      this.wallet.credit(betCents);
      this.fail(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      return;
    }

    this.state.transition(GameState.BALL_DROPPING);
    let notice: string | null = null;
    try {
      const outcome = await this.deps.board.drop(plan);
      if (outcome.timedOut) {
        notice = 'The ball took too long, so the round was settled with the server result.';
      } else if (outcome.slot !== result.targetSlot) {
        console.warn(`Ball landed in slot ${String(outcome.slot)}, server slot is ${result.targetSlot}`);
      }
    } catch (error) {
      notice = 'Display error. The round was settled with the server result.';
      console.error(error);
    }
    // The server result is authoritative for the payout in every case.
    this.settle(result, betCents);
    if (notice) this.events.emit({ type: 'message', tone: 'info', text: notice });
  }

  private settle(result: PlaySuccessResponse, betCents: Cents): void {
    const winCents = toCents(result.winAmount);
    if (winCents > 0) this.wallet.credit(winCents);
    this.history.add({
      id: result.gameId,
      multiplier: result.multiplier,
      betCents,
      winCents,
      timestamp: new Date(result.timestamp),
      slot: result.targetSlot,
      rows: result.rows,
      risk: result.risk,
    });
    const isBigWin = result.multiplier >= this.deps.config.bigWinMultiplier;
    this.deps.board.celebrate(result.targetSlot, isBigWin ? 1 : result.multiplier >= 1 ? 0.7 : 0.45);
    if (isBigWin) this.deps.sounds.play('bigWin');
    else if (result.multiplier >= 1) this.deps.sounds.play('win');
    this.state.transition(GameState.RESULT);
    this.events.emit({
      type: 'result',
      result: { slot: result.targetSlot, multiplier: result.multiplier, betCents, winCents, isBigWin },
    });
  }

  private fail(message: string): void {
    this.state.transition(GameState.ERROR);
    this.events.emit({ type: 'message', tone: 'error', text: message });
  }

  private update(patch: Partial<GameSettings>): void {
    this.current = { ...this.current, ...patch };
    this.events.emit({ type: 'settings', settings: this.current });
  }
}


function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
