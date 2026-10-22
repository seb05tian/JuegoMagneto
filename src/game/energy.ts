import { BALANCE } from '../config/gameConfig';

export interface EnergyState {
  energy: number;
  repulsionActive: boolean;
  exhaustedLatch: boolean;
  previousHeld: boolean;
}

export interface EnergyStepResult extends EnergyState {
  justActivated: boolean;
  justExhausted: boolean;
}

/** Advances magnet energy from elapsed simulation time, independent of render FPS. */
export function stepEnergy(state: EnergyState, held: boolean, deltaSeconds: number, costMultiplier = 1): EnergyStepResult {
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  let energy = Math.max(0, Math.min(BALANCE.energy.maximum, Number.isFinite(state.energy) ? state.energy : 0));
  let active = state.repulsionActive;
  let latched = state.exhaustedLatch;
  let justActivated = false;
  let justExhausted = false;
  const justPressed = held && !state.previousHeld;

  if (!held) {
    active = false;
  } else if (active && !latched && energy > 0) {
    // Keep the continuous repulsion pulse active while its button remains held.
  } else if (justPressed && energy > 0 && (!latched || energy >= BALANCE.energy.reactivationMinimum)) {
    active = true;
    latched = false;
    justActivated = true;
  } else {
    active = false;
  }

  if (active) {
    const costScale = Number.isFinite(costMultiplier) ? Math.max(0, costMultiplier) : 1;
    energy = Math.max(0, energy - BALANCE.energy.repulsionPerSecond * costScale * delta);
    if (energy === 0) {
      active = false;
      latched = true;
      justExhausted = true;
    }
  } else {
    energy = Math.min(BALANCE.energy.maximum, energy + BALANCE.energy.attractionPerSecond * delta);
  }

  // Only exhaustion needs a full rearm. A short emergency tap remains available
  // with a small charge, and holding through exhaustion can never auto-restart.
  if (!held && energy >= BALANCE.energy.reactivationMinimum) latched = false;

  return {
    energy,
    repulsionActive: active,
    exhaustedLatch: latched,
    previousHeld: held,
    justActivated,
    justExhausted,
  };
}
