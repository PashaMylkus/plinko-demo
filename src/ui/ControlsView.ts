import type { GameConfig } from '../config/gameConfig';
import { MAX_ROWS, MIN_ROWS, RISK_LEVELS, type RiskLevel } from '../config/multipliers';
import { parseBetInput } from '../game/betValidation';
import type { GameController, GameSettings } from '../game/GameController';
import { toCents, toDollars, type Cents } from '../utils/money';
import { byId } from './dom';

const RISK_LABELS: Readonly<Record<RiskLevel, string>> = { low: 'Low', medium: 'Medium', high: 'High' };

export class ControlsView {
  private readonly betInput = byId('bet-input', HTMLInputElement);
  private readonly betBox: HTMLElement;
  private readonly rowsInput = byId('rows', HTMLInputElement);
  private readonly rowsValue = byId('rows-value', HTMLOutputElement);
  private readonly dropButton = byId('drop', HTMLButtonElement);
  private readonly message = byId('message', HTMLParagraphElement);
  private readonly riskButtons = new Map<RiskLevel, HTMLButtonElement>();
  private readonly lockable: (HTMLButtonElement | HTMLInputElement)[];
  private messageTimer = 0;

  constructor(
    private readonly game: GameController,
    private readonly config: GameConfig,
  ) {
    const box = this.betInput.parentElement;
    if (!box) throw new Error('Bet input has no wrapper');
    this.betBox = box;
    byId('bet-limits', HTMLSpanElement).textContent = `$${config.minBet.toFixed(2)} – $${config.maxBet.toFixed(0)}`;

    this.rowsInput.min = String(MIN_ROWS);
    this.rowsInput.max = String(MAX_ROWS);

    const riskGroup = byId('risk', HTMLDivElement);
    for (const risk of RISK_LEVELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.textContent = RISK_LABELS[risk];
      button.addEventListener('click', () => {
        game.setRisk(risk);
      });
      riskGroup.appendChild(button);
      this.riskButtons.set(risk, button);
    }

    const buttons = {
      minus: byId('bet-minus', HTMLButtonElement),
      plus: byId('bet-plus', HTMLButtonElement),
      half: byId('bet-half', HTMLButtonElement),
      double: byId('bet-double', HTMLButtonElement),
      min: byId('bet-min', HTMLButtonElement),
      max: byId('bet-max', HTMLButtonElement),
    };
    buttons.minus.addEventListener('click', () => {
      this.applyBet(this.ladderStep(-1));
    });
    buttons.plus.addEventListener('click', () => {
      this.applyBet(this.ladderStep(1));
    });
    buttons.half.addEventListener('click', () => {
      this.applyBet(Math.floor(this.currentBet() / 2));
    });
    buttons.double.addEventListener('click', () => {
      this.applyBet(this.currentBet() * 2);
    });
    buttons.min.addEventListener('click', () => {
      this.applyBet(toCents(config.minBet));
    });
    buttons.max.addEventListener('click', () => {
      this.applyBet(Math.min(toCents(config.maxBet), Math.max(toCents(config.minBet), game.wallet.balance)));
    });

    this.betInput.addEventListener('input', () => {
      game.setBet(parseBetInput(this.betInput.value));
    });
    this.betInput.addEventListener('blur', () => {
      this.syncBetInput(true);
    });
    this.betInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void game.drop();
    });
    this.rowsInput.addEventListener('input', () => {
      game.setRows(Number(this.rowsInput.value));
    });
    this.dropButton.addEventListener('click', () => {
      void game.drop();
    });

    this.lockable = [this.rowsInput, ...this.riskButtons.values()];
  }

  render(settings: GameSettings): void {
    for (const [risk, button] of this.riskButtons) {
      button.setAttribute('aria-checked', String(risk === settings.risk));
    }
    this.rowsInput.value = String(settings.rows);
    this.rowsValue.textContent = String(settings.rows);
    this.syncBetInput(false);
    this.refresh();
  }

  refresh(): void {
    const busy = this.game.state.isBusy;
    for (const control of this.lockable) control.disabled = busy;
    const validation = this.game.validateCurrentBet();
    this.betBox.classList.toggle('is-invalid', !validation.ok);
    this.dropButton.disabled = !validation.ok || !this.game.canDropMore;
    this.dropButton.classList.toggle('is-busy', busy);
    this.dropButton.setAttribute('aria-busy', String(busy));
    if (!validation.ok) {
      const outOfFunds =
        !busy &&
        validation.problem === 'INSUFFICIENT_FUNDS' &&
        this.game.wallet.balance < toCents(this.config.minBet);
      this.showMessage(outOfFunds ? 'Out of demo funds. Use reset to top up.' : validation.message, 'error', false);
    } else if (this.message.dataset.sticky === 'validation') {
      this.showMessage('', 'info', false);
    }
  }

  showMessage(text: string, tone: 'error' | 'info', transient = true): void {
    window.clearTimeout(this.messageTimer);
    this.message.textContent = text;
    this.message.classList.toggle('is-error', tone === 'error');
    this.message.dataset.sticky = transient ? '' : 'validation';
    if (transient && text) {
      this.messageTimer = window.setTimeout(() => {
        this.message.textContent = '';
        this.refresh();
      }, 3500);
    }
  }

  private currentBet(): Cents {
    const bet = this.game.settings.betCents;
    return Number.isFinite(bet) ? bet : toCents(this.config.defaultBet);
  }

  private applyBet(cents: Cents): void {
    const clamped = Math.min(toCents(this.config.maxBet), Math.max(toCents(this.config.minBet), cents));
    this.game.setBet(clamped);
    this.syncBetInput(true);
  }

  private ladderStep(direction: 1 | -1): Cents {
    const ladder = this.config.betLadder.map(toCents);
    const bet = this.currentBet();
    if (direction > 0) return ladder.find((step) => step > bet) ?? bet;
    return [...ladder].reverse().find((step) => step < bet) ?? bet;
  }

  private syncBetInput(force: boolean): void {
    if (!force && document.activeElement === this.betInput) return;
    const bet = this.game.settings.betCents;
    if (Number.isFinite(bet)) this.betInput.value = toDollars(bet).toFixed(2);
  }
}
