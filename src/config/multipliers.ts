export const RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const MIN_ROWS = 8;
export const MAX_ROWS = 16;
export const ROW_OPTIONS: readonly number[] = Array.from(
  { length: MAX_ROWS - MIN_ROWS + 1 },
  (_, i) => MIN_ROWS + i,
);

/**
 * Payout tables keyed by risk, then by row count. Only the left half of each
 * table (edge to centre, centre included) is written down; the full table is
 * mirrored so every board is symmetric and always has `rows + 1` slots.
 */
type HalfTables = Readonly<Record<number, readonly number[]>>;

const HALF_TABLES: Readonly<Record<RiskLevel, HalfTables>> = {
  low: {
    8: [5.6, 2.1, 1.1, 1, 0.5],
    9: [5.6, 2, 1.6, 1, 0.7],
    10: [8.9, 3, 1.4, 1.1, 1, 0.5],
    11: [8.4, 3, 1.9, 1.3, 1, 0.7],
    12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5],
    13: [8.1, 4, 3, 1.9, 1.2, 0.9, 0.7],
    14: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5],
    15: [15, 8, 3, 2, 1.5, 1.1, 1, 0.7],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5],
  },
  medium: {
    8: [13, 3, 1.3, 0.7, 0.4],
    9: [18, 4, 1.7, 0.9, 0.5],
    10: [22, 5, 2, 1.4, 0.6, 0.4],
    11: [24, 6, 3, 1.8, 0.7, 0.5],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3],
    13: [43, 13, 6, 3, 1.3, 0.7, 0.4],
    14: [58, 15, 7, 4, 1.9, 1, 0.5, 0.2],
    15: [88, 18, 11, 5, 3, 1.3, 0.5, 0.3],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3],
  },
  high: {
    8: [29, 4, 1.5, 0.3, 0.2],
    9: [43, 7, 2, 0.6, 0.2],
    10: [76, 10, 3, 0.9, 0.3, 0.2],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2],
    13: [260, 37, 11, 4, 1, 0.2, 0.2],
    14: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2],
    15: [620, 83, 27, 8, 3, 0.5, 0.2, 0.2],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2],
  },
};

function mirror(half: readonly number[], slotCount: number): number[] {
  const full: number[] = [];
  for (let i = 0; i < slotCount; i++) {
    const mirrored = Math.min(i, slotCount - 1 - i);
    const value = half[mirrored];
    if (value === undefined) {
      throw new Error(`Multiplier table too short for ${slotCount} slots`);
    }
    full.push(value);
  }
  return full;
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === 'string' && (RISK_LEVELS as readonly string[]).includes(value);
}

export function isValidRowCount(rows: unknown): rows is number {
  return typeof rows === 'number' && Number.isInteger(rows) && rows >= MIN_ROWS && rows <= MAX_ROWS;
}

export function getSlotCount(rows: number): number {
  return rows + 1;
}

/** Full, left-to-right multiplier list for a board. Length is always `rows + 1`. */
export function getMultipliers(rows: number, risk: RiskLevel): readonly number[] {
  if (!isValidRowCount(rows)) throw new Error(`Unsupported row count: ${String(rows)}`);
  const half = HALF_TABLES[risk][rows];
  if (!half) throw new Error(`No multiplier table for ${risk}/${rows}`);
  return mirror(half, getSlotCount(rows));
}

export function getMultiplier(rows: number, risk: RiskLevel, slot: number): number {
  const value = getMultipliers(rows, risk)[slot];
  if (value === undefined) throw new Error(`Slot ${slot} out of range for ${rows} rows`);
  return value;
}
