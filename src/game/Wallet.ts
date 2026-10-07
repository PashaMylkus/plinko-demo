import type { Cents } from '../utils/money';
import { Emitter } from '../utils/Emitter';

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient balance');
    this.name = 'InsufficientFundsError';
  }
}

export class Wallet {
  private balanceCents: Cents;
  readonly changes = new Emitter<Cents>();

  constructor(private readonly startingCents: Cents) {
    this.balanceCents = startingCents;
  }

  get balance(): Cents {
    return this.balanceCents;
  }

  canAfford(amount: Cents): boolean {
    return amount <= this.balanceCents;
  }

  debit(amount: Cents): void {
    assertAmount(amount);
    if (!this.canAfford(amount)) throw new InsufficientFundsError();
    this.set(this.balanceCents - amount);
  }

  credit(amount: Cents): void {
    assertAmount(amount);
    this.set(this.balanceCents + amount);
  }

  reset(): void {
    this.set(this.startingCents);
  }

  private set(value: Cents): void {
    this.balanceCents = value;
    this.changes.emit(value);
  }
}

function assertAmount(amount: Cents): void {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Invalid amount: ${amount}`);
}
