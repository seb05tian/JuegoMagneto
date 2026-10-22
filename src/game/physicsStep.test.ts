import { describe, expect, it } from 'vitest';
import { GAME } from '../config/gameConfig';
import { safeArcadeDeltaMs } from './physicsStep';

describe('Arcade render-delta guard', () => {
  it('preserves ordinary frames and caps a large frame before the Arcade accumulator', () => {
    expect(safeArcadeDeltaMs(1000 / 60)).toBeCloseTo(1000 / 60);
    expect(safeArcadeDeltaMs(4000)).toBe(GAME.maxFrameDeltaMs);
    expect(GAME.maxFrameDeltaMs + GAME.fixedStep * 1000).toBeCloseTo(GAME.maxSubSteps * GAME.fixedStep * 1000);
  });

  it('rejects negative and non-finite render deltas safely', () => {
    expect(safeArcadeDeltaMs(-12)).toBe(0);
    expect(safeArcadeDeltaMs(Number.NaN)).toBe(0);
    expect(safeArcadeDeltaMs(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
