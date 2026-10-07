/**
 * Money helpers. Amounts are kept as integer cents internally to avoid
 * floating point drift; the API boundary uses decimal dollars.
 */
export type Cents = number;

export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

export function toDollars(cents: Cents): number {
  return Math.round(cents) / 100;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(cents: Cents): string {
  return currencyFormatter.format(toDollars(cents));
}

export function formatMultiplier(multiplier: number): string {
  if (multiplier >= 100) return `${Math.round(multiplier)}x`;
  return `${multiplier.toFixed(multiplier >= 10 ? 1 : 2).replace(/\.?0+$/, '') || '0'}x`;
}

export function formatMultiplierFixed(multiplier: number): string {
  return `${multiplier.toFixed(2)}x`;
}
