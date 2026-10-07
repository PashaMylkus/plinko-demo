import { formatMoney, type Cents } from '../utils/money';
import { easeOutCubic } from '../utils/math';

const DURATION_MS = 550;

/** Balance readout that counts smoothly to each new value. */
export class BalanceView {
  private shown: Cents;
  private frame = 0;
  private flashTimer = 0;

  constructor(
    private readonly element: HTMLElement,
    initial: Cents,
  ) {
    this.shown = initial;
    this.render(initial);
  }

  set(value: Cents): void {
    cancelAnimationFrame(this.frame);
    const from = this.shown;
    if (from === value) return;
    this.flash(value > from ? 'is-up' : 'is-down');
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      this.shown = Math.round(from + (value - from) * easeOutCubic(t));
      this.render(this.shown);
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private flash(className: string): void {
    window.clearTimeout(this.flashTimer);
    this.element.classList.remove('is-up', 'is-down');
    this.element.classList.add(className);
    this.flashTimer = window.setTimeout(() => {
      this.element.classList.remove(className);
    }, 900);
  }

  private render(value: Cents): void {
    this.element.textContent = formatMoney(value);
  }
}
