import type { RoundResult } from '../game/GameController';
import { formatMoney, formatMultiplierFixed } from '../utils/money';

export class WinPopup {
  private timer = 0;

  constructor(private readonly element: HTMLElement) {}

  show(result: RoundResult): void {
    window.clearTimeout(this.timer);
    const el = this.element;
    el.classList.remove('is-visible', 'is-win', 'is-big');
    el.textContent = `${formatMultiplierFixed(result.multiplier)}  ·  +${formatMoney(result.winCents)}`;
    el.getBoundingClientRect();
    el.classList.add('is-visible');
    if (result.isBigWin) el.classList.add('is-big');
    else if (result.winCents > result.betCents) el.classList.add('is-win');
    this.timer = window.setTimeout(() => {
      el.classList.remove('is-visible');
    }, result.isBigWin ? 2600 : 1600);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.element.classList.remove('is-visible');
  }
}
