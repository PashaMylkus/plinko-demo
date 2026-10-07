import { describe, expect, it, vi } from 'vitest';
import { MockPlinkoApi } from '../src/api/mockPlinkoApi';
import type { PlayResponse, PlinkoApi } from '../src/api/types';
import type { SoundPlayer } from '../src/audio/SoundManager';
import { GAME_CONFIG } from '../src/config/gameConfig';
import type { BoardPort, DropOutcome } from '../src/game/BoardScene';
import { GameController, type PlannerPort } from '../src/game/GameController';
import { GameState } from '../src/game/GameState';
import type { DropPlan } from '../src/steering/planDrop';
import { createSeededRandom } from '../src/utils/rng';

const sounds: SoundPlayer = { play: () => undefined, muted: true, setMuted: () => undefined };

const planner: PlannerPort = {
  plan: (_rows, targetSlot) =>
    Promise.resolve({ targetSlot, spawn: { x: 0, vx: 0, seed: 1 }, strength: 0, attempts: 1, verified: true }),
};

/** Board that "lands" the ball in the planned slot (or as told). */
function fakeBoard(outcome?: (plan: DropPlan) => DropOutcome): BoardPort & { drops: DropPlan[] } {
  const drops: DropPlan[] = [];
  return {
    drops,
    setBoard: () => undefined,
    celebrate: () => undefined,
    clearCelebration: () => undefined,
    drop: (plan) => {
      drops.push(plan);
      return Promise.resolve(outcome ? outcome(plan) : { slot: plan.targetSlot, timedOut: false });
    },
  };
}

function setup(api: PlinkoApi, board = fakeBoard()) {
  const game = new GameController({ api, board, planner, sounds, config: GAME_CONFIG });
  game.init();
  return { game, board };
}

const mockApi = (seed = 1) =>
  new MockPlinkoApi({ random: createSeededRandom(seed), sleep: () => Promise.resolve() });

describe('GameController', () => {
  it('debits the bet, credits the win and records history', async () => {
    const { game } = setup(mockApi());
    expect(game.wallet.balance).toBe(100000);
    await game.drop();
    const [record] = game.history.entries;
    if (!record) throw new Error('expected a history entry');
    expect(record.betCents).toBe(1000);
    expect(record.winCents).toBe(Math.round(1000 * record.multiplier));
    expect(game.wallet.balance).toBe(100000 - 1000 + record.winCents);
    expect(game.state.state).toBe(GameState.RESULT);
  });

  it('plays many rounds in a row without getting stuck', async () => {
    const { game, board } = setup(mockApi(3));
    let expected = game.wallet.balance;
    for (let i = 0; i < 100; i++) {
      await game.drop();
      const record = game.history.entries[0];
      if (!record) throw new Error('expected a history entry');
      expected += record.winCents - record.betCents;
      expect(game.state.state).toBe(GameState.RESULT);
    }
    expect(board.drops).toHaveLength(100);
    expect(game.wallet.balance).toBe(expected);
  });

  it('ignores a second drop while a ball is in play', async () => {
    const { game, board } = setup(mockApi());
    const first = game.drop();
    const second = game.drop();
    await Promise.all([first, second]);
    expect(board.drops).toHaveLength(1);
  });

  it('blocks bets above the balance', async () => {
    const { game, board } = setup(mockApi());
    game.setBet(200000);
    const messages: string[] = [];
    game.events.subscribe((event) => {
      if (event.type === 'message') messages.push(event.text);
    });
    await game.drop();
    expect(board.drops).toHaveLength(0);
    expect(game.wallet.balance).toBe(100000);
    expect(messages[0]).toMatch(/Maximum|Insufficient/);
  });

  it('blocks invalid bets', async () => {
    const { game, board } = setup(mockApi());
    game.setBet(Number.NaN);
    await game.drop();
    game.setBet(1);
    await game.drop();
    expect(board.drops).toHaveLength(0);
  });

  it('refunds the bet and enters ERROR when the API fails, then recovers', async () => {
    const failing = new MockPlinkoApi({ failureRate: 1, sleep: () => Promise.resolve() });
    const { game } = setup(failing);
    await game.drop();
    expect(game.state.state).toBe(GameState.ERROR);
    expect(game.wallet.balance).toBe(100000);

    const recovering = setup(mockApi()).game;
    await recovering.drop();
    expect(recovering.state.state).toBe(GameState.RESULT);
  });

  it('refunds when the API rejects or returns an invalid slot', async () => {
    const throwing: PlinkoApi = { play: () => Promise.reject(new Error('network down')) };
    const a = setup(throwing).game;
    await a.drop();
    expect(a.state.state).toBe(GameState.ERROR);
    expect(a.wallet.balance).toBe(100000);

    const invalid: PlinkoApi = {
      play: async (request) => {
        const response: PlayResponse = await mockApi().play(request);
        return response.success ? { ...response, targetSlot: 99 } : response;
      },
    };
    const b = setup(invalid).game;
    await b.drop();
    expect(b.state.state).toBe(GameState.ERROR);
    expect(b.wallet.balance).toBe(100000);
  });

  it('times out a hung API instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      const hung: PlinkoApi = { play: () => new Promise<PlayResponse>(() => undefined) };
      const { game } = setup(hung);
      const round = game.drop();
      await vi.advanceTimersByTimeAsync(9000);
      await round;
      expect(game.state.state).toBe(GameState.ERROR);
      expect(game.wallet.balance).toBe(100000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles with the server result after a physics timeout', async () => {
    const board = fakeBoard(() => ({ slot: null, timedOut: true }));
    const { game } = setup(mockApi(), board);
    await game.drop();
    const record = game.history.entries[0];
    if (!record) throw new Error('expected a history entry');
    expect(game.state.state).toBe(GameState.RESULT);
    expect(game.wallet.balance).toBe(100000 - 1000 + record.winCents);
  });

  it('locks settings while busy and resets balance and history', async () => {
    const { game } = setup(mockApi());
    const round = game.drop();
    game.setRows(16);
    game.setRisk('high');
    expect(game.settings.rows).toBe(GAME_CONFIG.defaultRows);
    expect(game.settings.risk).toBe(GAME_CONFIG.defaultRisk);
    await round;
    game.reset();
    expect(game.wallet.balance).toBe(100000);
    expect(game.history.entries).toHaveLength(0);
    expect(game.state.state).toBe(GameState.IDLE);
  });
});
