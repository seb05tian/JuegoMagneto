import { describe, expect, it } from 'vitest';
import { bombRateAt, canArmRegularBomb, requiredSpawnSeparation, respectsObjectCap, rewardSpawnOffset, coinTrailPositions } from './spawnRules';

describe('spawn rules', () => {
  it('teaches attraction nearby, then offers rewards ahead of movement with an edge fallback', () => {
    const opening = rewardSpawnOffset(0, 230, 0, 0.5, 0.5, 0);
    expect(Math.hypot(opening.x, opening.y)).toBeLessThan(175);
    const route = rewardSpawnOffset(9, 230, 0, 0.5, 0.5, 0);
    expect(route.x).toBeGreaterThan(175);
    expect(route.y).toBeCloseTo(0);
    const fallback = rewardSpawnOffset(9, 230, 0, 0.5, 0.5, 15);
    expect(fallback.x).toBeLessThan(0);
    expect(Math.hypot(fallback.x, fallback.y)).toBeCloseTo(Math.hypot(route.x, route.y));
  });

  it('uses every stated difficulty phase and stabilizes at the five-minute cap', () => {
    expect(bombRateAt(0)).toBe(6);
    expect(bombRateAt(30)).toBe(10);
    expect(bombRateAt(60)).toBe(14);
    expect(bombRateAt(120)).toBe(18);
    expect(bombRateAt(180)).toBe(22);
    expect(bombRateAt(300)).toBe(26);
    expect(bombRateAt(900)).toBe(26);
  });

  it('does not arm a regular bomb before ten seconds', () => {
    expect(canArmRegularBomb(9.99)).toBe(false);
    expect(canArmRegularBomb(10)).toBe(true);
  });

  it('enforces object limits and safe placement separation', () => {
    expect(respectsObjectCap('coin', 27)).toBe(true);
    expect(respectsObjectCap('coin', 28)).toBe(false);
    expect(respectsObjectCap('training', 0)).toBe(true);
    expect(respectsObjectCap('training', 1)).toBe(false);
    expect(requiredSpawnSeparation('bomb', 16, 'coin', 13)).toBe(51);
  });

  it('builds a short followable coin trail with safe spacing', () => {
    const points = coinTrailPositions(100, 200, 0, 0.15);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 100, y: 200 });
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const point = points[index]!;
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeCloseTo(44);
      expect(point.x).toBeGreaterThan(previous.x);
    }
  });
});
