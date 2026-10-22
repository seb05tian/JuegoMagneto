import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/gameConfig';
import { calculateMagneticAcceleration, clampVector, constrainAcceleration, dampVelocity } from './magnet';

describe('magnetic field', () => {
  it('uses the squared falloff and points toward the player in attraction mode', () => {
    const acceleration = calculateMagneticAcceleration({ x: 87.5, y: 0 }, { x: 0, y: 0 }, 'attract', 1);
    expect(acceleration.x).toBeCloseTo(-BALANCE.magnet.attractionAcceleration * 0.25);
    expect(acceleration.y).toBe(0);
    expect(acceleration.magnitude).toBeCloseTo(BALANCE.magnet.attractionAcceleration * 0.25);
  });

  it('points away from the player in repulsion mode and applies object response', () => {
    const acceleration = calculateMagneticAcceleration({ x: 0, y: 0 }, { x: 77.5, y: 0 }, 'repel', 0.7);
    expect(acceleration.x).toBeCloseTo(-BALANCE.magnet.repulsionAcceleration * 0.25 * 0.7);
  });

  it('has no force outside the radius or at zero distance', () => {
    expect(calculateMagneticAcceleration({ x: 175, y: 0 }, { x: 0, y: 0 }, 'attract', 1).magnitude).toBe(0);
    expect(calculateMagneticAcceleration({ x: 0, y: 0 }, { x: 0, y: 0 }, 'repel', 1).magnitude).toBe(0);
  });

  it('damps by elapsed time and clamps total speed without changing direction', () => {
    const halfSecond = dampVelocity({ x: 100, y: 0 }, 1.2, 0.5);
    expect(halfSecond.x).toBeCloseTo(100 * Math.exp(-0.6));
    expect(clampVector({ x: 300, y: 400 }, 250)).toEqual({ x: 150, y: 200 });
  });

  it('limits next-step speed without an impulse at the cap', () => {
    const fixed = 1 / 60;
    const velocity = { x: 220, y: 0 };
    const acceleration = constrainAcceleration(velocity, { x: 1800, y: 0 }, 230, fixed);
    const afterStep = { x: velocity.x + acceleration.x * fixed, y: 0 };
    expect(Math.hypot(afterStep.x, afterStep.y)).toBeCloseTo(230, 8);
    expect(acceleration.x).toBeLessThan(1800);
  });

  it('lets a repelled bomb carry an aimed shot across 200 units during its valid window', () => {
    let velocity = { x: 180, y: 0 };
    let distance = 0;
    for (let step = 0; step < 90; step += 1) {
      velocity = dampVelocity(velocity, BALANCE.magnet.repelledBombDragPerSecond, 1 / 60);
      distance += velocity.x / 60;
    }
    expect(distance).toBeGreaterThan(200);
    expect(velocity.x).toBeLessThan(180);
    expect(velocity.y).toBe(0);
  });
});
