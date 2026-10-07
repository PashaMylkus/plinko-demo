import { getSlotCount } from '../config/multipliers';
import { PHYSICS } from './constants';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PegLayout extends Point {
  readonly index: number;
  readonly row: number;
}

export interface SlotLayout {
  readonly index: number;
  readonly centerX: number;
  readonly left: number;
  readonly right: number;
}

export interface WallLayout {
  readonly from: Point;
  readonly to: Point;
}

/** Pure description of a board in world units. Shared by physics and rendering. */
export interface BoardGeometry {
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly pegSpacing: number;
  readonly rowSpacing: number;
  readonly pegRadius: number;
  readonly ballRadius: number;
  readonly spawn: Point;
  readonly firstRowY: number;
  readonly lastRowY: number;
  /** Top of the slot boxes. */
  readonly slotTop: number;
  readonly slotHeight: number;
  /** A ball whose centre crosses this line has landed. */
  readonly sensorY: number;
  readonly floorY: number;
  readonly pegs: readonly PegLayout[];
  readonly slots: readonly SlotLayout[];
  readonly walls: readonly [WallLayout, WallLayout];
}

export function createBoardGeometry(rows: number): BoardGeometry {
  const s = PHYSICS.pegSpacing;
  const rowSpacing = PHYSICS.rowSpacing;
  const slotCount = getSlotCount(rows);
  const width = (rows + 3) * s;
  const centerX = width / 2;
  const firstRowY = s * 1.6;
  const lastRowY = firstRowY + (rows - 1) * rowSpacing;

  const pegs: PegLayout[] = [];
  for (let row = 0; row < rows; row++) {
    const count = row + 3;
    const y = firstRowY + row * rowSpacing;
    for (let j = 0; j < count; j++) {
      pegs.push({ index: pegs.length, row, x: centerX + (j - (count - 1) / 2) * s, y });
    }
  }

  const slots: SlotLayout[] = [];
  for (let k = 0; k < slotCount; k++) {
    const slotCenter = centerX + (k - rows / 2) * s;
    slots.push({ index: k, centerX: slotCenter, left: slotCenter - s / 2, right: slotCenter + s / 2 });
  }

  // Side rails run parallel to the outer pegs, closer than a ball diameter,
  // so the ball can never slip around the outside of the triangle.
  const railOffset = PHYSICS.pegRadius + PHYSICS.ballRadius;
  const topY = firstRowY - s * 1.4;
  const outerAt = (y: number): number => ((y - firstRowY) / rowSpacing + 2) * (s / 2) + railOffset;
  const left: WallLayout = {
    from: { x: centerX - outerAt(topY), y: topY },
    to: { x: centerX - outerAt(lastRowY), y: lastRowY },
  };
  const right: WallLayout = {
    from: { x: centerX + outerAt(topY), y: topY },
    to: { x: centerX + outerAt(lastRowY), y: lastRowY },
  };

  const slotTop = lastRowY + rowSpacing * 0.55;
  const slotHeight = s * 0.8;
  return {
    rows,
    width,
    height: slotTop + slotHeight + s * 0.6,
    centerX,
    pegSpacing: s,
    rowSpacing,
    pegRadius: PHYSICS.pegRadius,
    ballRadius: PHYSICS.ballRadius,
    spawn: { x: centerX, y: firstRowY - s * 1.1 },
    firstRowY,
    lastRowY,
    slotTop,
    slotHeight,
    sensorY: lastRowY + rowSpacing * 0.6,
    floorY: slotTop + slotHeight,
    pegs,
    slots,
    walls: [left, right],
  };
}

/** Slot whose column contains `x` (clamped to the board). */
export function slotIndexAt(geometry: BoardGeometry, x: number): number {
  const raw = Math.floor((x - (geometry.slots[0]?.left ?? 0)) / geometry.pegSpacing);
  return Math.min(geometry.slots.length - 1, Math.max(0, raw));
}
