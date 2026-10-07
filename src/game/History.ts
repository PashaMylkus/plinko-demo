import type { RiskLevel } from '../config/multipliers';
import type { Cents } from '../utils/money';
import { Emitter } from '../utils/Emitter';

export interface RoundRecord {
  readonly id: string;
  readonly multiplier: number;
  readonly betCents: Cents;
  readonly winCents: Cents;
  readonly timestamp: Date;
  readonly slot: number;
  readonly rows: number;
  readonly risk: RiskLevel;
}

/** Most recent rounds first, capped at `limit`. */
export class History {
  private records: RoundRecord[] = [];
  readonly changes = new Emitter<readonly RoundRecord[]>();

  constructor(private readonly limit: number) {}

  get entries(): readonly RoundRecord[] {
    return this.records;
  }

  add(record: RoundRecord): void {
    this.records = [record, ...this.records].slice(0, this.limit);
    this.changes.emit(this.records);
  }

  clear(): void {
    this.records = [];
    this.changes.emit(this.records);
  }
}
