# Plinko demo

A frontend-only Plinko casino demo built with **Vite**, **Pixi.js** (rendering) and **Matter.js** (physics). Play money only: there is no backend, no payments and no network requests.

```bash
npm install
npm run dev        # start the game
npm run typecheck
npm run lint
npm test
npm run build
```

Append `?failRate=0.3` to the URL to make the mock server fail some rounds and see the error handling.

## How a round works

1. The player picks bet, risk and rows and presses **Drop** (or Space). The bet is debited.
2. `MockPlinkoApi.play({ betAmount, rows, risk })` waits 300–700 ms and returns the outcome, including `targetSlot`, picked like a fair board (binomial).
3. The result is validated (slot in range, multiplier matches the table, payout consistent). On any failure the bet is refunded and the game enters `ERROR`.
4. The planner (in a Web Worker) rehearses the drop headlessly in the same deterministic Matter.js world until a run lands in `targetSlot`, trying untouched physics first and only then gently increasing steering.
5. The live board replays that plan with a fixed timestep: the ball really falls, bounces off pegs and lands in the slot the server chose.
6. The win is credited, the slot is highlighted and the round goes to history.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/api` | API contract (`PlinkoApi`) and the isolated mock server |
| `src/config` | Game limits and per-risk, per-row multiplier tables |
| `src/physics` | Board geometry and the Matter.js world (pegs, rails, dividers, slot sensors) |
| `src/steering` | Target-slot control, kept out of the physics engine: force controller, planner, worker |
| `src/render` | Pixi.js board rendering and effects |
| `src/game` | State machine, wallet, history, validation, round orchestration, live board scene |
| `src/ui` | DOM controls, balance, history, win popup |
| `src/audio` | Synthesised sound effects behind a small `SoundPlayer` interface |

To use a real backend, implement `PlinkoApi` and pass it to `GameController` in `src/main.ts`.
