import { Emitter } from '../utils/Emitter';

export const GameState = {
  IDLE: 'IDLE',
  PLAYING: 'PLAYING',
  RESULT: 'RESULT',
  ERROR: 'ERROR',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

const TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  IDLE: ['PLAYING'],
  PLAYING: ['RESULT', 'ERROR'],
  RESULT: ['PLAYING', 'IDLE'],
  ERROR: ['PLAYING', 'IDLE'],
};

export interface StateChange {
  readonly from: GameState;
  readonly to: GameState;
}

export class GameStateMachine {
  private current: GameState = GameState.IDLE;
  readonly changes = new Emitter<StateChange>();

  get state(): GameState {
    return this.current;
  }

  get isBusy(): boolean {
    return this.current === GameState.PLAYING;
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
