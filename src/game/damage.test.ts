import { describe, expect, it } from 'vitest';
import { BALANCE, GAME } from '../config/gameConfig';
import { resolveBombImpact } from './damage';

describe('bomb impact rules', () => {
  it('removes one health point and starts the full invulnerability interval', () => {
    const impact = resolveBombImpact({ health: 3, hasShield: false, invulnerabilityRemaining: 0 });
    expect(impact.health).toBe(2);
    expect(impact.healthLost).toBe(true);
    expect(impact.breakCombo).toBe(true);
    expect(impact.invulnerabilityRemaining - GAME.fixedStep).toBe(BALANCE.player.invulnerabilitySeconds);
  });

  it('uses a shield without health loss or combo break and protects against same-step bombs', () => {
    const shieldHit = resolveBombImpact({ health: 3, hasShield: true, invulnerabilityRemaining: 0 });
    expect(shieldHit.shieldConsumed).toBe(true);
    expect(shieldHit.health).toBe(3);
    expect(shieldHit.breakCombo).toBe(false);
    const simultaneous = resolveBombImpact({
      health: shieldHit.health,
      hasShield: shieldHit.hasShield,
      invulnerabilityRemaining: shieldHit.invulnerabilityRemaining,
    });
    expect(simultaneous.applied).toBe(false);
  });

  it('allows only one health point of loss during overlapping bomb contacts', () => {
    const first = resolveBombImpact({ health: 3, hasShield: false, invulnerabilityRemaining: 0 });
    const second = resolveBombImpact(first);
    expect(first.health).toBe(2);
    expect(second.health).toBe(2);
    expect(second.applied).toBe(false);
  });

  it('ends the run exactly when the final health point is consumed', () => {
    const impact = resolveBombImpact({ health: 1, hasShield: false, invulnerabilityRemaining: 0 });
    expect(impact.health).toBe(0);
    expect(impact.gameOver).toBe(true);
  });
});
