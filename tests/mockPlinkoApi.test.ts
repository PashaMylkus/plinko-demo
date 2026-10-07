import { describe, expect, it } from 'vitest';
import { MockPlinkoApi } from '../src/api/mockPlinkoApi';
import type { PlayRequest } from '../src/api/types';
import { getMultiplier } from '../src/config/multipliers';
import { createSeededRandom } from '../src/utils/rng';

const instant = (): Promise<void> => Promise.resolve();

function createApi(options: { failureRate?: number; seed?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  return new MockPlinkoApi({
    random: createSeededRandom(options.seed ?? 42),
    sleep: options.sleep ?? instant,
    failureRate: options.failureRate ?? 0,
  });
}

describe('MockPlinkoApi', () => {
  it('returns a realistic response with a valid slot and consistent payout', async () => {
    const api = createApi();
    const request: PlayRequest = { betAmount: 10, rows: 12, risk: 'medium' };
    const response = await api.play(request);
    if (!response.success) throw new Error('expected success');
    expect(response.gameId).toMatch(/^mock-game-/);
    expect(response.ballId).toMatch(/^ball-/);
    expect(response.rows).toBe(12);
    expect(response.risk).toBe('medium');
    expect(response.betAmount).toBe(10);
    expect(Number.isInteger(response.targetSlot)).toBe(true);
    expect(response.targetSlot).toBeGreaterThanOrEqual(0);
    expect(response.targetSlot).toBeLessThanOrEqual(12);
    expect(response.multiplier).toBe(getMultiplier(12, 'medium', response.targetSlot));
    expect(response.winAmount).toBeCloseTo(10 * response.multiplier, 2);
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });

  it('always picks slots inside the board, mostly near the centre', async () => {
    const api = createApi({ seed: 7 });
    const counts = new Array<number>(17).fill(0);
    for (let i = 0; i < 2000; i++) {
      const response = await api.play({ betAmount: 1, rows: 16, risk: 'high' });
      if (!response.success) throw new Error('expected success');
      counts[response.targetSlot] = (counts[response.targetSlot] ?? 0) + 1;
    }
    const centre = (counts[7] ?? 0) + (counts[8] ?? 0) + (counts[9] ?? 0);
    expect(centre).toBeGreaterThan(2000 * 0.4);
    expect((counts[0] ?? 0) + (counts[16] ?? 0)).toBeLessThan(10);
  });

  it('waits a realistic 300-700ms', async () => {
    const delays: number[] = [];
    const api = createApi({
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    for (let i = 0; i < 50; i++) await api.play({ betAmount: 1, rows: 8, risk: 'low' });
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...delays)).toBeLessThanOrEqual(700);
  });

  it('rejects invalid requests', async () => {
    const api = createApi();
    const bad = [
      { betAmount: 0, rows: 8, risk: 'low' },
      { betAmount: 100000, rows: 8, risk: 'low' },
      { betAmount: Number.NaN, rows: 8, risk: 'low' },
      { betAmount: 1, rows: 20, risk: 'low' },
      { betAmount: 1, rows: 8, risk: 'extreme' },
    ] as unknown as PlayRequest[];
    for (const request of bad) {
      const response = await api.play(request);
      expect(response.success).toBe(false);
    }
  });

  it('can simulate server failures', async () => {
    const api = createApi({ failureRate: 1 });
    const response = await api.play({ betAmount: 1, rows: 8, risk: 'low' });
    expect(response.success).toBe(false);
    if (!response.success) expect(response.error.code).toBe('INTERNAL_ERROR');
  });
});
