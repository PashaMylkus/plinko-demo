import { Container, Graphics, GraphicsContext, Text, type Application } from 'pixi.js';
import type { BoardGeometry } from '../physics/geometry';
import type { BallState } from '../physics/PlinkoWorld';
import { formatMultiplier } from '../utils/money';
import { clamp, easeOutCubic } from '../utils/math';
import { PHYSICS } from '../physics/constants';
import { PALETTE, slotColor } from './palette';

interface PegSprite {
  readonly glow: Graphics;
  readonly x: number;
  readonly y: number;
  energy: number;
}

interface SlotSprite {
  readonly container: Container;
  readonly box: Graphics;
  readonly label: Text;
  readonly baseY: number;
  readonly color: number;
  bounce: number;
  highlight: number;
}

interface BallSprite {
  readonly view: Container;
  trailPoints: { x: number; y: number }[];
  age: number;
  fade: number;
}

const TRAIL_LENGTH = 9;
const BOARD_PADDING = 12;
const IDLE_SLOT_ALPHA = 0.8;
const RESULT_BADGE_SPACE = 44;

export class BoardRenderer {
  private readonly root = new Container();
  private readonly pegLayer = new Container();
  private readonly slotLayer = new Container();
  private readonly trail = new Graphics();
  private readonly ballLayer = new Container();
  private readonly ballGlow: GraphicsContext;
  private readonly ballBody: GraphicsContext;
  private readonly balls = new Map<number, BallSprite>();
  private nextBallId = 1;
  private pegs: PegSprite[] = [];
  private slots: SlotSprite[] = [];
  private geometry: BoardGeometry | null = null;
  private viewWidth = 0;
  private viewHeight = 0;

  constructor(app: Application) {
    const r = PHYSICS.ballRadius;
    this.ballGlow = new GraphicsContext().circle(0, 0, r * 1.9).fill({ color: PALETTE.ballGlow, alpha: 0.18 });
    this.ballBody = new GraphicsContext()
      .circle(0, 0, r)
      .fill({ color: PALETTE.ball })
      .circle(-r * 0.3, -r * 0.32, r * 0.42)
      .fill({ color: PALETTE.ballCore, alpha: 0.85 });
    this.root.addChild(this.slotLayer, this.pegLayer, this.trail, this.ballLayer);
    app.stage.addChild(this.root);
  }

  get isEmpty(): boolean {
    return this.geometry === null;
  }

  setBoard(geometry: BoardGeometry, multipliers: readonly number[]): void {
    this.geometry = geometry;
    this.buildPegs(geometry);
    this.buildSlots(geometry, multipliers);
    this.clearBalls();
    this.layout(this.viewWidth, this.viewHeight);
  }

  setMultipliers(multipliers: readonly number[]): void {
    if (this.geometry) this.buildSlots(this.geometry, multipliers);
    this.updateTextResolution();
  }

  layout(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    const g = this.geometry;
    if (!g || width <= 0 || height <= 0) return;
    const top = Math.min(RESULT_BADGE_SPACE, height * 0.08);
    const scale = Math.min((width - BOARD_PADDING * 2) / g.width, (height - top - BOARD_PADDING) / g.height);
    this.root.scale.set(scale);
    this.root.position.set((width - g.width * scale) / 2, top + (height - top - g.height * scale) / 2);
    this.updateTextResolution();
  }

  addBall(): number {
    const view = new Container();
    view.addChild(new Graphics(this.ballGlow), new Graphics(this.ballBody));
    this.ballLayer.addChild(view);
    const id = this.nextBallId++;
    this.balls.set(id, { view, trailPoints: [], age: 0, fade: 0 });
    return id;
  }

  syncBall(id: number, state: BallState): void {
    const ball = this.balls.get(id);
    if (!ball) return;
    ball.view.position.set(state.x, state.y);
    ball.view.rotation = state.angle;
    ball.trailPoints.push({ x: state.x, y: state.y });
    if (ball.trailPoints.length > TRAIL_LENGTH) ball.trailPoints.shift();
  }

  sinkBall(id: number): void {
    const ball = this.balls.get(id);
    if (ball) ball.fade = 1;
  }

  removeBall(id: number): void {
    const ball = this.balls.get(id);
    if (!ball) return;
    this.balls.delete(id);
    ball.view.destroy({ children: true });
  }

  clearBalls(): void {
    for (const id of [...this.balls.keys()]) this.removeBall(id);
    this.trail.clear();
  }

  pegHit(index: number): void {
    const peg = this.pegs[index];
    if (peg) peg.energy = 1;
  }

  highlightSlot(index: number, intensity: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.bounce = 1;
    slot.highlight = clamp(intensity, 0.4, 1);
  }

  clearHighlights(): void {
    for (const slot of this.slots) slot.highlight = 0;
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const peg of this.pegs) {
      if (peg.energy <= 0) continue;
      peg.energy = Math.max(0, peg.energy - dt * 3.2);
      peg.glow.alpha = peg.energy * 0.85;
      peg.glow.scale.set(1 + (1 - peg.energy) * 0.6);
    }
    for (const slot of this.slots) this.animateSlot(slot, dt);
    for (const [id, ball] of this.balls) this.animateBall(id, ball, dt);
    this.drawTrails();
  }

  private animateSlot(slot: SlotSprite, dt: number): void {
    if (slot.bounce > 0) {
      slot.bounce = Math.max(0, slot.bounce - dt * 2.4);
      const t = 1 - slot.bounce;
      slot.container.y = slot.baseY + Math.sin(t * Math.PI) * 9 * slot.bounce;
    }
    const targetAlpha = slot.highlight > 0 ? 1 : IDLE_SLOT_ALPHA;
    slot.box.alpha += (targetAlpha - slot.box.alpha) * Math.min(1, dt * 10);
    slot.container.scale.set(1 + slot.highlight * 0.06 * (0.6 + 0.4 * Math.sin(performance.now() / 160)));
    if (slot.highlight > 0) slot.highlight = Math.max(0, slot.highlight - dt * 0.35);
  }

  private animateBall(id: number, ball: BallSprite, dt: number): void {
    ball.age += dt;
    const spawn = easeOutCubic(clamp(ball.age / 0.22, 0, 1));
    let scale = 0.4 + 0.6 * spawn;
    if (ball.fade > 0) {
      ball.fade = Math.max(0, ball.fade - dt * 4);
      ball.view.alpha = ball.fade;
      scale *= 0.6 + 0.4 * ball.fade;
      if (ball.fade === 0) {
        this.removeBall(id);
        return;
      }
    }
    ball.view.scale.set(scale);
  }

  private drawTrails(): void {
    this.trail.clear();
    const g = this.geometry;
    if (!g) return;
    for (const ball of this.balls.values()) {
      const n = ball.trailPoints.length;
      for (let i = 0; i < n - 1; i++) {
        const p = ball.trailPoints[i];
        if (!p) continue;
        const t = (i + 1) / n;
        this.trail.circle(p.x, p.y, g.ballRadius * (0.35 + 0.55 * t)).fill({
          color: PALETTE.trail,
          alpha: 0.18 * t * ball.view.alpha,
        });
      }
    }
  }

  private buildPegs(geometry: BoardGeometry): void {
    this.pegLayer.removeChildren().forEach((child) => {
      child.destroy();
    });
    this.pegs = geometry.pegs.map((peg) => {
      const glow = new Graphics().circle(0, 0, geometry.pegRadius * 2).fill({ color: PALETTE.pegGlow, alpha: 0.45 });
      glow.position.set(peg.x, peg.y);
      glow.alpha = 0;
      const dot = new Graphics()
        .circle(peg.x, peg.y, geometry.pegRadius)
        .fill({ color: PALETTE.peg })
        .circle(peg.x - 1, peg.y - 1.2, geometry.pegRadius * 0.45)
        .fill({ color: 0xffffff, alpha: 0.7 });
      this.pegLayer.addChild(glow, dot);
      return { glow, x: peg.x, y: peg.y, energy: 0 };
    });
  }

  private buildSlots(geometry: BoardGeometry, multipliers: readonly number[]): void {
    this.slotLayer.removeChildren().forEach((child) => {
      child.destroy({ children: true });
    });
    const half = (geometry.slots.length - 1) / 2;
    const width = geometry.pegSpacing - 5;
    const height = geometry.slotHeight;
    const fontSize = geometry.rows >= 15 ? 10.5 : geometry.rows >= 12 ? 11.5 : 12.5;
    this.slots = geometry.slots.map((slot) => {
      const color = slotColor(Math.abs(slot.index - half) / Math.max(half, 1));
      const container = new Container();
      const baseY = geometry.slotTop + height / 2;
      container.position.set(slot.centerX, baseY);
      const box = new Graphics()
        .roundRect(-width / 2, -height / 2 + 3, width, height, 6)
        .fill({ color: darken(color) })
        .roundRect(-width / 2, -height / 2, width, height - 3, 6)
        .fill({ color });
      box.alpha = IDLE_SLOT_ALPHA;
      const label = new Text({
        text: formatMultiplier(multipliers[slot.index] ?? 0),
        style: {
          fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          fontSize,
          fontWeight: '800',
          fill: PALETTE.slotText,
        },
      });
      label.anchor.set(0.5);
      label.y = -1.5;
      container.addChild(box, label);
      this.slotLayer.addChild(container);
      return { container, box, label, baseY, color, bounce: 0, highlight: 0 };
    });
  }

  private updateTextResolution(): void {
    const resolution = Math.min(4, Math.max(1, this.root.scale.x * (globalThis.devicePixelRatio || 1)) * 1.5);
    for (const slot of this.slots) slot.label.resolution = resolution;
  }
}

function darken(color: number): number {
  const r = Math.round(((color >> 16) & 0xff) * 0.62);
  const g = Math.round(((color >> 8) & 0xff) * 0.62);
  const b = Math.round((color & 0xff) * 0.62);
  return (r << 16) | (g << 8) | b;
}
