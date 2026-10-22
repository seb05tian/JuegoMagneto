import { describe, expect, it } from 'vitest';
import { BALANCE, GAME } from '../config/gameConfig';
import { canBombScoreTargetHit } from './targetRules';

describe('bomb-target scoring window', () => {
  it('keeps the top target art clear of the HUD panel', () => {
    const topRow = GAME.hudTopPanelBottom + BALANCE.objects.target.displaySize / 2 + BALANCE.objects.target.hudClearance;
    const topEdge = topRow - BALANCE.objects.target.displaySize / 2;
    expect(topEdge).toBeGreaterThan(GAME.hudTopPanelBottom);
    expect(topRow).toBe(115);
  });

  it('accepts only armed bombs within the two-second repulsion window', () => {
    const repelledUntil = 12;
    expect(canBombScoreTargetHit({ warningRemaining: 0, repelledUntil }, 10)).toBe(true);
    expect(canBombScoreTargetHit({ warningRemaining: 0, repelledUntil }, 12)).toBe(true);
    expect(canBombScoreTargetHit({ warningRemaining: 0, repelledUntil }, 12.001)).toBe(false);
    expect(canBombScoreTargetHit({ warningRemaining: 0.1, repelledUntil }, 11)).toBe(false);
    expect(BALANCE.objects.bomb.repelledWindow).toBe(2);
  });
});
