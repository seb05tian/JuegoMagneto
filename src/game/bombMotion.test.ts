import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/gameConfig';
import { bombLaunchVelocity } from './bombMotion';
import { dampVelocity } from './magnet';

describe('readable bomb drift', () => {
  it('launches slowly toward the announced position with bounded variation', () => {
    const velocity = bombLaunchVelocity({ x: 300, y: 100 }, { x: 0, y: 100 }, 0.5, 0);
    expect(velocity.x).toBeCloseTo(-28);
    expect(velocity.y).toBeCloseTo(0);
    const varied = bombLaunchVelocity({ x: 0, y: 0 }, { x: 300, y: 0 }, 1, 1);
    expect(Math.hypot(varied.x, varied.y)).toBeCloseTo(35);
    expect(Math.atan2(varied.y, varied.x)).toBeCloseTo(BALANCE.objects.bomb.launchSpread);
  });
  it('reaches the magnet field instead of stopping outside it', () => {
    let velocity = bombLaunchVelocity({ x: 310, y: 0 }, { x: 0, y: 0 }, 0.5, 0);
    let x = 310;
    for (let tick = 0; tick < 8 * 60; tick += 1) {
      velocity = dampVelocity(velocity, BALANCE.objects.bomb.driftDragPerSecond, 1 / 60);
      x += velocity.x / 60;
    }
    expect(x).toBeLessThan(BALANCE.magnet.attractionRadius);
    expect(x).toBeGreaterThan(0);
  });
});
