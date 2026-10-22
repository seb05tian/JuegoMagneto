import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/gameConfig';
import { stepEnergy, type EnergyState } from './energy';

const ready: EnergyState = { energy: 100, repulsionActive: false, exhaustedLatch: false, previousHeld: false };

describe('magnetic energy', () => {
  it('drains and recovers per second of simulation time', () => {
    const active = stepEnergy(ready, true, 0.5);
    expect(active.energy).toBe(84);
    expect(active.justActivated).toBe(true);
    const released = stepEnergy(active, false, 0.5);
    expect(released.energy).toBe(91.5);
    expect(released.repulsionActive).toBe(false);
  });

  it('makes repulsion cheaper during a timed Overdrive', () => {
    const active = stepEnergy(ready, true, 0.5, BALANCE.runFeatures.overdrive.energyCostMultiplier);
    expect(active.energy).toBe(92);
    expect(active.repulsionActive).toBe(true);
  });

  it('clamps to both limits and never emits non-finite energy', () => {
    expect(stepEnergy({ ...ready, energy: 99 }, false, 5).energy).toBe(BALANCE.energy.maximum);
    expect(stepEnergy({ ...ready, energy: 1, repulsionActive: true, previousHeld: true }, true, 5).energy).toBe(0);
    expect(stepEnergy({ ...ready, energy: Number.NaN }, false, Number.NaN).energy).toBe(0);
  });

  it('latches on exhaustion and requires release then a fresh press at 20 energy', () => {
    const depleted = stepEnergy({ ...ready, energy: 1, repulsionActive: true, previousHeld: true }, true, 1);
    expect(depleted.energy).toBe(0);
    expect(depleted.exhaustedLatch).toBe(true);
    expect(depleted.justExhausted).toBe(true);
    const chargingWhileHeld = stepEnergy(depleted, true, 1);
    expect(chargingWhileHeld.repulsionActive).toBe(false);
    expect(chargingWhileHeld.energy).toBe(15);
    const released = stepEnergy(chargingWhileHeld, false, 1 / 3);
    expect(released.exhaustedLatch).toBe(false);
    expect(released.energy).toBe(20);
    const freshPress = stepEnergy(released, true, 0.01);
    expect(freshPress.justActivated).toBe(true);
    expect(freshPress.repulsionActive).toBe(true);
  });

  it('does not re-enable repulsion while held after exhaustion', () => {
    const latched = stepEnergy({ ...ready, energy: 0, exhaustedLatch: true, previousHeld: true }, true, 2);
    expect(latched.energy).toBe(30);
    expect(latched.repulsionActive).toBe(false);
    expect(latched.justActivated).toBe(false);
  });

  it('allows a short emergency push below 20 unless exhaustion requires rearming', () => {
    const burst = stepEnergy({ ...ready, energy: 8 }, true, 0.1);
    expect(burst.repulsionActive).toBe(true);
    expect(burst.energy).toBeCloseTo(4.8);
    const depleted = stepEnergy({ ...ready, energy: 8, exhaustedLatch: true }, true, 0.1);
    expect(depleted.repulsionActive).toBe(false);
    expect(depleted.exhaustedLatch).toBe(true);
  });
});
