import { BALANCE, GAME } from '../config/gameConfig';

export interface ArenaLayout {
  width: number;
  height: number;
  portrait: boolean;
  hudBottom: number;
  arenaTop: number;
  worldBottom: number;
}

export interface ArenaTargetPosition {
  x: number;
  y: number;
}

/** Keeps the landscape game at its designed size and gives portrait devices a tall arena. */
export function layoutForViewport(viewportWidth: number, viewportHeight: number): ArenaLayout {
  const portrait = viewportHeight > viewportWidth;
  if (!portrait) {
    return {
      width: GAME.width,
      height: GAME.height,
      portrait: false,
      hudBottom: GAME.hudTopPanelBottom,
      arenaTop: GAME.arenaTop,
      worldBottom: GAME.height,
    };
  }

  const safeWidth = Math.max(320, Number.isFinite(viewportWidth) ? viewportWidth : 390);
  const safeHeight = Math.max(safeWidth + 120, Number.isFinite(viewportHeight) ? viewportHeight : 844);
  const width = Math.round(Math.min(1200, Math.max(450, safeWidth * (540 / 390))));
  const height = Math.ceil(width * safeHeight / safeWidth);
  const hudBottom = 108;
  return {
    width,
    height,
    portrait: true,
    hudBottom,
    arenaTop: hudBottom + 8,
    // Leave a safe strip for the two large multitouch controls at the bottom.
    worldBottom: height - 188,
  };
}

export function targetPositions(layout: ArenaLayout): ArenaTargetPosition[] {
  const sideInset = Math.min(BALANCE.objects.target.insetFromArenaEdge, Math.max(52, layout.width / 2 - 42));
  const top = layout.arenaTop + BALANCE.objects.target.displaySize / 2 + BALANCE.objects.target.hudClearance;
  const bottom = layout.worldBottom - (layout.portrait ? 72 : BALANCE.objects.target.insetFromArenaEdge);
  return [
    { x: sideInset, y: top },
    { x: layout.width - sideInset, y: top },
    { x: sideInset, y: bottom },
    { x: layout.width - sideInset, y: bottom },
  ];
}

export function remapCoordinate(value: number, oldMin: number, oldMax: number, newMin: number, newMax: number): number {
  const oldSpan = Math.max(1, oldMax - oldMin);
  const newSpan = Math.max(0, newMax - newMin);
  const ratio = Math.max(0, Math.min(1, (value - oldMin) / oldSpan));
  return newMin + ratio * newSpan;
}

export function touchControlLayout(layout: ArenaLayout): {
  joystickX: number;
  joystickY: number;
  repelX: number;
  repelY: number;
  labelY: number;
} {
  if (layout.portrait) {
    return {
      joystickX: Math.max(92, layout.width * 0.19),
      joystickY: layout.height - 106,
      repelX: layout.width - Math.max(92, layout.width * 0.19),
      repelY: layout.height - 106,
      labelY: layout.height - 22,
    };
  }
  return {
    joystickX: 160,
    joystickY: layout.height - 162,
    repelX: layout.width - 170,
    repelY: layout.height - 162,
    labelY: layout.height - 42,
  };
}
