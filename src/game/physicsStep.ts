import { GAME } from '../config/gameConfig';

/** Bounds render delta before passing it to Phaser's single Arcade accumulator. */
export function safeArcadeDeltaMs(renderDeltaMs: number): number {
  if (!Number.isFinite(renderDeltaMs)) return 0;
  return Math.min(Math.max(0, renderDeltaMs), GAME.maxFrameDeltaMs);
}
