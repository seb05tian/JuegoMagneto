import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/gameConfig';
import { RunFeatures } from './runFeatures';

describe('run-only gameplay features', () => {
  it('charges and activates a timed Overdrive without banking charge while it is active', () => {
    const run = new RunFeatures();
    expect(run.addCharge(29)).toBe(false);
    expect(run.addCharge(1)).toBe(true);
    expect(run.overdriveRemaining).toBe(6);
    expect(run.charge).toBe(0);
    expect(run.addCharge(30)).toBe(false);
    run.tick(2.5);
    expect(run.overdriveRemaining).toBeCloseTo(3.5);
    run.tick(4);
    expect(run.overdriveActive).toBe(false);
    expect(run.addCharge(30)).toBe(true);
    expect(run.activations).toBe(2);
  });

  it('sequences one-time skill goals and grants fixed rewards', () => {
    const run = new RunFeatures();
    for (let index = 0; index < BALANCE.runFeatures.goals.coins - 1; index += 1) run.addCoin();
    expect(run.completeGoalIfReady()).toBeNull();
    run.addCoin();
    expect(run.completeGoalIfReady()).toMatchObject({ kind: 'coins', number: 1, points: 100, energy: 15 });
    run.addDeflection();
    run.addDeflection();
    expect(run.completeGoalIfReady()).toBeNull();
    run.tick(BALANCE.runFeatures.goals.nextGoalDelay);
    expect(run.completeGoalIfReady()).toMatchObject({ kind: 'deflections', number: 2, points: 200 });
    run.addTarget();
    run.tick(BALANCE.runFeatures.goals.nextGoalDelay);
    expect(run.completeGoalIfReady()).toMatchObject({ kind: 'targets', number: 3, points: 300 });
    run.tick(BALANCE.runFeatures.goals.nextGoalDelay);
    expect(run.currentGoal).toBeNull();
    expect(run.goalText()).toBe('ALL GOALS COMPLETE');
  });

  it('moves the golden target on a seeded 20-second cycle after 30 seconds', () => {
    const run = new RunFeatures();
    expect(run.goldenTargetIndex(29.99, 7, 4)).toBe(-1);
    expect(run.goldenTargetIndex(30, 7, 4)).toBe(3);
    expect(run.goldenTargetIndex(49.99, 7, 4)).toBe(3);
    expect(run.goldenTargetIndex(50, 7, 4)).toBe(0);
    expect(run.goldenTargetIndex(50, 7, 4)).toBe(run.goldenTargetIndex(50, 7, 4));
  });
});
