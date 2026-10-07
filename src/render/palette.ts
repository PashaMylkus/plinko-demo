import { clamp, lerp } from '../utils/math';

export const PALETTE = {
  peg: 0xdfe6f5,
  pegGlow: 0x7cf0ff,
  ball: 0xffd25e,
  ballCore: 0xfff3c4,
  ballGlow: 0xffb84d,
  trail: 0xffc24d,
  slotText: 0x14101f,
} as const;

/** Slot colour stops from the centre (low pay) to the edges (high pay). */
const SLOT_STOPS: readonly number[] = [0xffd84a, 0xffa53a, 0xff6a3d, 0xff3d5e];

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(lerp(ar, (b >> 16) & 0xff, t));
  const g = Math.round(lerp(ag, (b >> 8) & 0xff, t));
  const bl = Math.round(lerp(ab, b & 0xff, t));
  return (r << 16) | (g << 8) | bl;
}

/** `distance` is 0 at the centre slot and 1 at the outermost slot. */
export function slotColor(distance: number): number {
  const scaled = clamp(distance, 0, 1) * (SLOT_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), SLOT_STOPS.length - 2);
  const from = SLOT_STOPS[i] ?? 0xffffff;
  const to = SLOT_STOPS[i + 1] ?? from;
  return mixColor(from, to, scaled - i);
}
