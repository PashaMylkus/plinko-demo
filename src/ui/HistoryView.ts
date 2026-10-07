import type { RoundRecord } from '../game/History';
import { slotColor } from '../render/palette';
import { formatMoney, formatMultiplierFixed } from '../utils/money';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export class HistoryView {
  constructor(
    private readonly list: HTMLOListElement,
    private readonly empty: HTMLElement,
    private readonly count: HTMLElement,
  ) {}

  render(records: readonly RoundRecord[]): void {
    this.list.replaceChildren(...records.map((record) => this.renderItem(record)));
    this.empty.hidden = records.length > 0;
    this.count.textContent = records.length > 0 ? `${records.length} ${records.length === 1 ? 'round' : 'rounds'}` : '';
  }

  private renderItem(record: RoundRecord): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'history__item';

    const half = record.rows / 2;
    const color = slotColor(Math.abs(record.slot - half) / half);
    const mult = document.createElement('span');
    mult.className = 'history__mult';
    mult.style.background = `#${color.toString(16).padStart(6, '0')}`;
    mult.textContent = formatMultiplierFixed(record.multiplier);

    const bet = document.createElement('span');
    bet.className = 'history__bet';
    const betAmount = document.createElement('span');
    betAmount.textContent = formatMoney(record.betCents);
    const time = document.createElement('time');
    time.className = 'history__time';
    time.dateTime = record.timestamp.toISOString();
    time.textContent = timeFormat.format(record.timestamp);
    bet.append(betAmount, time);

    const win = document.createElement('span');
    win.className = `history__win ${record.winCents >= record.betCents ? 'is-profit' : 'is-loss'}`;
    win.textContent = `+${formatMoney(record.winCents)}`;

    item.append(mult, bet, win);
    item.setAttribute(
      'aria-label',
      `${formatMultiplierFixed(record.multiplier)}, bet ${formatMoney(record.betCents)}, won ${formatMoney(record.winCents)}`,
    );
    return item;
  }
}
