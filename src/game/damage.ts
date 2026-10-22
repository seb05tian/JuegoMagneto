import { BALANCE, GAME } from '../config/gameConfig';

export interface ImpactState {
  health: number;
  hasShield: boolean;
  invulnerabilityRemaining: number;
}

export interface ImpactResult extends ImpactState {
  applied: boolean;
  shieldConsumed: boolean;
  healthLost: boolean;
  breakCombo: boolean;
  gameOver: boolean;
}

/** Resolves one bomb contact. The extra fixed tick offsets Arcade's post-collision event order. */
export function resolveBombImpact(state: ImpactState): ImpactResult {
  if (state.invulnerabilityRemaining > 0) {
    return { ...state, applied: false, shieldConsumed: false, healthLost: false, breakCombo: false, gameOver: false };
  }
  if (state.hasShield) {
    return {
      health: state.health,
      hasShield: false,
      invulnerabilityRemaining: BALANCE.player.invulnerabilitySeconds + GAME.fixedStep,
      applied: true,
      shieldConsumed: true,
      healthLost: false,
      breakCombo: false,
      gameOver: false,
    };
  }
  const health = Math.max(0, state.health - 1);
  return {
    health,
    hasShield: false,
    invulnerabilityRemaining: BALANCE.player.invulnerabilitySeconds + GAME.fixedStep,
    applied: true,
    shieldConsumed: false,
    healthLost: true,
    breakCombo: true,
    gameOver: health === 0,
  };
}
