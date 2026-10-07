import { describe, expect, it } from 'vitest';
import { getMultiplier, getMultipliers, getSlotCount, RISK_LEVELS, ROW_OPTIONS } from '../src/config/multipliers';

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

describe('multiplier tables', () => {
  for (const risk of RISK_LEVELS) {
    for (const rows of ROW_OPTIONS) {
      it(`${risk} / ${rows} rows has one multiplier per slot and is symmetric`, () => {
        const table = getMultipliers(rows, risk);
        expect(table).toHaveLength(getSlotCount(rows));
        expect(table).toHaveLength(rows + 1);
        expect([...table].reverse()).toEqual(table);
        for (const value of table) expect(value).toBeGreaterThan(0);
      });

      it(`${risk} / ${rows} rows returns about 99% under a fair board`, () => {
        const table = getMultipliers(rows, risk);
        const rtp = table.reduce((sum, m, k) => sum + (m * binomial(rows, k)) / 2 ** rows, 0);
        expect(rtp).toBeGreaterThan(0.97);
        expect(rtp).toBeLessThan(1);
      });
    }
  }

  it('rejects unsupported boards and slots', () => {
    expect(() => getMultipliers(7, 'low')).toThrow();
    expect(() => getMultipliers(17, 'low')).toThrow();
    expect(() => getMultiplier(8, 'low', 9)).toThrow();
    expect(() => getMultiplier(8, 'low', -1)).toThrow();
  });

  it('higher risk pays more on the edges', () => {
    expect(getMultiplier(16, 'high', 0)).toBeGreaterThan(getMultiplier(16, 'medium', 0));
    expect(getMultiplier(16, 'medium', 0)).toBeGreaterThan(getMultiplier(16, 'low', 0));
  });
});
