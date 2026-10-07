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

function fakeBoard(
  outcome?: (plan: DropPlan) => DropOutcome | Promise<DropOutcome>,
): BoardPort & { drops: DropPlan[] } {
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

function heldBoard() {
  const landings: (() => void)[] = [];
  const board = fakeBoard(
    (plan) =>
      new Promise<DropOutcome>((resolve) => {
        landings.push(() => {
          resolve({ slot: plan.targetSlot, timedOut: false });
        });
      }),
  );
  return {
    board,
    landAll: () => {
      for (const land of landings.splice(0)) land();
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

  it('drops more balls while earlier ones are still in play', async () => {
    const { board, landAll } = heldBoard();
    const { game } = setup(mockApi(), board);
    const rounds = [game.drop(), game.drop(), game.drop()];
    expect(game.ballsInPlay).toBe(3);
    expect(game.wallet.balance).toBe(100000 - 3 * 1000);
    await flush();
    expect(board.drops).toHaveLength(3);
    expect(game.state.state).toBe(GameState.PLAYING);

    landAll();
    await Promise.all(rounds);
    const won = game.history.entries.reduce((sum, record) => sum + record.winCents, 0);
    expect(game.history.entries).toHaveLength(3);
    expect(game.ballsInPlay).toBe(0);
    expect(game.wallet.balance).toBe(100000 - 3 * 1000 + won);
    expect(game.state.state).toBe(GameState.RESULT);
  });

  it('caps the number of balls in play', async () => {
    const { board, landAll } = heldBoard();
    const { game } = setup(mockApi(), board);
    const rounds = Array.from({ length: GAME_CONFIG.maxBallsInPlay + 5 }, () => game.drop());
    expect(game.ballsInPlay).toBe(GAME_CONFIG.maxBallsInPlay);
    expect(game.canDropMore).toBe(false);
    await flush();
    landAll();
    await Promise.all(rounds);
    expect(game.history.entries).toHaveLength(GAME_CONFIG.maxBallsInPlay);
    expect(game.canDropMore).toBe(true);
  });

  it('stays in play until the last ball lands, even if another round fails', async () => {
    const { board, landAll } = heldBoard();
    let calls = 0;
    const api = mockApi();
    const flaky: PlinkoApi = {
      play: (request) => (++calls === 2 ? Promise.reject(new Error('network down')) : api.play(request)),
    };
    const { game } = setup(flaky, board);
    const rounds = [game.drop(), game.drop()];
    await flush();
    expect(game.state.state).toBe(GameState.PLAYING);
    expect(game.wallet.balance).toBe(100000 - 1000);

    landAll();
    await Promise.all(rounds);
    expect(game.state.state).toBe(GameState.RESULT);
    expect(game.history.entries).toHaveLength(1);
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

  it('locks board settings while busy and resets balance and history', async () => {
    const { game } = setup(mockApi());
    const round = game.drop();
    game.setRows(16);
    game.setRisk('high');
    game.reset();
    expect(game.settings.rows).toBe(GAME_CONFIG.defaultRows);
    expect(game.settings.risk).toBe(GAME_CONFIG.defaultRisk);
    expect(game.wallet.balance).toBe(100000 - 1000);
    await round;
    game.reset();
    expect(game.wallet.balance).toBe(100000);
    expect(game.history.entries).toHaveLength(0);
    expect(game.state.state).toBe(GameState.IDLE);
  });

  it('settles each round with the bet it started with', async () => {
    const { board, landAll } = heldBoard();
    const { game } = setup(mockApi(), board);
    const first = game.drop();
    game.setBet(500);
    const second = game.drop();
    await flush();
    landAll();
    await Promise.all([first, second]);
    expect(game.history.entries.map((record) => record.betCents).sort((a, b) => a - b)).toEqual([500, 1000]);
  });
});
