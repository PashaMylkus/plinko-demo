import { Emitter } from '../utils/Emitter';

export const GameState = {
  IDLE: 'IDLE',
  WAITING_FOR_RESULT: 'WAITING_FOR_RESULT',
  BALL_DROPPING: 'BALL_DROPPING',
  RESULT: 'RESULT',
  ERROR: 'ERROR',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  IDLE: ['WAITING_FOR_RESULT'],
  WAITING_FOR_RESULT: ['BALL_DROPPING', 'ERROR'],
  BALL_DROPPING: ['RESULT', 'ERROR'],
  RESULT: ['WAITING_FOR_RESULT', 'IDLE'],
  ERROR: ['WAITING_FOR_RESULT', 'IDLE'],
};

export interface StateChange {
  readonly from: GameState;
  readonly to: GameState;
}

/** Explicit round lifecycle. Illegal transitions are programming errors. */
export class GameStateMachine {
  private current: GameState = GameState.IDLE;
  readonly changes = new Emitter<StateChange>();

  get state(): GameState {
    return this.current;
  }

  /** A new round may start, and settings may change, only when no ball is in play. */
  get isBusy(): boolean {
    return this.current === GameState.WAITING_FOR_RESULT || this.current === GameState.BALL_DROPPING;
  }

  canTransition(to: GameState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  transition(to: GameState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Illegal game state transition ${this.current} -> ${to}`);
    }
    const from = this.current;
    this.current = to;
    this.changes.emit({ from, to });
  }
}
