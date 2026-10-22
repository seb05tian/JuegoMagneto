import { describe, expect, it } from 'vitest';
import { ComboScorer } from './scoring';

describe('combo scoring', () => {
  it('applies the new multiplier to the pickup that completes each five-object group', () => {
    const scorer = new ComboScorer();
    const awards = Array.from({ length: 21 }, (_, index) => scorer.collect(10, index * 0.5));
    expect(awards[3]?.multiplier).toBe(1);
    expect(awards[4]?.multiplier).toBe(2);
    expect(awards[9]?.multiplier).toBe(3);
    expect(awards[14]?.multiplier).toBe(4);
    expect(awards[19]?.multiplier).toBe(5);
    expect(awards[20]?.multiplier).toBe(5);
    expect(scorer.score).toBe(10 * 4 + 20 * 5 + 30 * 5 + 40 * 5 + 50 * 2);
  });

  it('keeps the chain at the 2.2 second boundary and resets after it', () => {
    const scorer = new ComboScorer();
    for (let index = 0; index < 5; index += 1) scorer.collect(10, index * 0.1);
    expect(scorer.timeRemaining(0.4)).toBeCloseTo(2.2);
    expect(scorer.timeRemaining(2.0)).toBeCloseTo(0.6);
    expect(scorer.timeRemaining(2.61)).toBe(0);
    expect(scorer.expire(2.6)).toBe(false);
    expect(scorer.expire(2.61)).toBe(true);
    expect(scorer.multiplier).toBe(1);
  });

  it('awards fixed target points without touching the combo', () => {
    const scorer = new ComboScorer();
    scorer.collect(30, 0);
    const award = scorer.addFixedPoints(50);
    expect(award).toBe(50);
    expect(scorer.score).toBe(80);
    expect(scorer.streak).toBe(1);
  });
});
