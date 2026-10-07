import './styles.css';
import { MockPlinkoApi } from './api/mockPlinkoApi';
import { SoundManager } from './audio/SoundManager';
import { GAME_CONFIG } from './config/gameConfig';
import { BoardScene } from './game/BoardScene';
import { GameController } from './game/GameController';
import { DropPlanner } from './steering/DropPlanner';
import { BalanceView } from './ui/BalanceView';
import { ControlsView } from './ui/ControlsView';
import { byId } from './ui/dom';
import { HistoryView } from './ui/HistoryView';
import { WinPopup } from './ui/WinPopup';

/** `?failRate=0.3` makes the mock server fail some rounds, to exercise error handling. */
function readFailureRate(): number {
  const raw = new URLSearchParams(window.location.search).get('failRate');
  const rate = raw === null ? 0 : Number(raw);
  return Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
}

async function bootstrap(): Promise<void> {
  const sounds = new SoundManager();
  const board = await BoardScene.create(byId('board', HTMLDivElement), sounds);
  const game = new GameController({
    api: new MockPlinkoApi({ failureRate: readFailureRate() }),
    board,
    planner: new DropPlanner(),
    sounds,
    config: GAME_CONFIG,
  });

  const balance = new BalanceView(byId('balance', HTMLOutputElement), game.wallet.balance);
  const history = new HistoryView(
    byId('history', HTMLOListElement),
    byId('history-empty', HTMLParagraphElement),
    byId('history-count', HTMLSpanElement),
  );
  const controls = new ControlsView(game, GAME_CONFIG);
  const winPopup = new WinPopup(byId('win-pop', HTMLDivElement));
  const resetButton = byId('reset', HTMLButtonElement);
  const soundButton = byId('sound', HTMLButtonElement);

  game.wallet.changes.subscribe((cents) => {
    balance.set(cents);
    controls.refresh();
  });
  game.history.changes.subscribe((records) => {
    history.render(records);
  });
  game.state.changes.subscribe(({ to }) => {
    controls.refresh();
    resetButton.disabled = game.state.isBusy;
    if (to === 'WAITING_FOR_RESULT') winPopup.hide();
  });
  game.events.subscribe((event) => {
    if (event.type === 'settings') controls.render(event.settings);
    else if (event.type === 'message') controls.showMessage(event.text, event.tone);
    else winPopup.show(event.result);
  });

  resetButton.addEventListener('click', () => {
    game.reset();
  });
  soundButton.setAttribute('aria-pressed', String(!sounds.muted));
  soundButton.addEventListener('click', () => {
    sounds.setMuted(!sounds.muted);
    soundButton.setAttribute('aria-pressed', String(!sounds.muted));
    sounds.unlock();
  });
  // Browsers only allow audio after a user gesture.
  window.addEventListener('pointerdown', () => {
    sounds.unlock();
  }, { once: false, passive: true });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && document.activeElement === document.body) {
      event.preventDefault();
      sounds.unlock();
      void game.drop();
    }
  });

  history.render(game.history.entries);
  game.init();
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<p style="position:fixed;inset:auto 0 16px;text-align:center;color:#ff5d73">The game failed to start. Please reload the page.</p>',
  );
});
