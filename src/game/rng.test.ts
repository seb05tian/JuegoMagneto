import { describe, expect, it } from 'vitest';
import { SeededRandom } from './rng';

describe('SeededRandom', () => {
  it('replays the same sequence for a seed', () => {
    const first = new SeededRandom(12345);
    const replay = new SeededRandom(12345);
    expect(Array.from({ length: 12 }, () => first.next())).toEqual(
      Array.from({ length: 12 }, () => replay.next()),
    );
  });

  it('keeps generated values inside requested ranges', () => {
    const random = new SeededRandom(7);
    for (let index = 0; index < 100; index += 1) {
      expect(random.between(0.7, 1.3)).toBeGreaterThanOrEqual(0.7);
      expect(random.integer(2, 5)).toBeGreaterThanOrEqual(2);
    }
  });
});
