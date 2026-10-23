import { BALANCE } from '../config/gameConfig';

export type GoalKind = 'coins' | 'deflections' | 'targets';

export interface RunGoal {
  kind: GoalKind;
  label: string;
  progress: number;
  target: number;
}

export interface GoalCompletion extends RunGoal {
  points: number;
  energy: number;
  number: number;
}

const GOALS: ReadonlyArray<{ kind: GoalKind; label: string; target: number }> = [
  { kind: 'coins', label: 'COLLECT COINS', target: BALANCE.runFeatures.goals.coins },
  { kind: 'deflections', label: 'DEFLECT BOMBS', target: BALANCE.runFeatures.goals.deflections },
  { kind: 'targets', label: 'HIT A TARGET', target: BALANCE.runFeatures.goals.targets },
];

export class RunFeatures {
  charge = 0;
  overdriveRemaining = 0;
  activations = 0;
  coins = 0;
  deflections = 0;
  targets = 0;
  completedGoals = 0;
  goalNotice = '';
  goalNoticeRemaining = 0;
  private nextGoalDelay = 0;

  get overdriveActive(): boolean {
    return this.overdriveRemaining > 0;
  }

  get currentGoal(): RunGoal | null {
    const goal = GOALS[this.completedGoals];
    if (!goal) return null;
    const value = this.goalValue(goal.kind);
    return { ...goal, progress: Math.min(goal.target, value) };
  }

  addCharge(amount: number): boolean {
    if (this.overdriveActive || !Number.isFinite(amount) || amount <= 0) return false;
    this.charge = Math.min(BALANCE.runFeatures.overdrive.chargeRequired, this.charge + amount);
    if (this.charge < BALANCE.runFeatures.overdrive.chargeRequired) return false;
    this.charge = 0;
    this.overdriveRemaining = BALANCE.runFeatures.overdrive.seconds;
    this.activations += 1;
    return true;
  }

  grantOverdrive(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.charge = 0;
    this.overdriveRemaining = Math.min(
      BALANCE.runFeatures.overdrive.giftMaximumSeconds,
      this.overdriveRemaining + seconds,
    );
    this.activations += 1;
  }

  addCoin(): void {
    this.coins += 1;
  }

  addDeflection(): void {
    this.deflections += 1;
  }

  addTarget(): void {
    this.targets += 1;
  }

  tick(deltaSeconds: number): void {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.overdriveRemaining = Math.max(0, this.overdriveRemaining - delta);
    this.goalNoticeRemaining = Math.max(0, this.goalNoticeRemaining - delta);
    this.nextGoalDelay = Math.max(0, this.nextGoalDelay - delta);
    if (this.goalNoticeRemaining === 0) this.goalNotice = '';
  }

  completeGoalIfReady(): GoalCompletion | null {
    if (this.nextGoalDelay > 0) return null;
    const goal = this.currentGoal;
    if (!goal || goal.progress < goal.target) return null;
    const number = this.completedGoals + 1;
    const points = BALANCE.runFeatures.goals.rewardPoints[number - 1] ?? 0;
    this.completedGoals = number;
    this.goalNotice = `GOAL COMPLETE  +${points}`;
    this.goalNoticeRemaining = BALANCE.runFeatures.goals.nextGoalDelay;
    this.nextGoalDelay = BALANCE.runFeatures.goals.nextGoalDelay;
    return { ...goal, points, energy: BALANCE.runFeatures.goals.rewardEnergy, number };
  }

  goalText(): string {
    if (this.goalNoticeRemaining > 0 && this.goalNotice) return this.goalNotice;
    const goal = this.currentGoal;
    return goal ? `${goal.label}  ${goal.progress}/${goal.target}` : 'ALL GOALS COMPLETE';
  }

  goldenTargetIndex(simTime: number, seed: number, targetCount: number): number {
    if (simTime < BALANCE.runFeatures.goldenTarget.firstAppearsAt || targetCount <= 0) return -1;
    const cycle = Math.floor((simTime - BALANCE.runFeatures.goldenTarget.firstAppearsAt) / BALANCE.runFeatures.goldenTarget.rotateEvery);
    const offset = (seed >>> 0) % targetCount;
    return (offset + cycle) % targetCount;
  }

  reset(): void {
    this.charge = 0;
    this.overdriveRemaining = 0;
    this.activations = 0;
    this.coins = 0;
    this.deflections = 0;
    this.targets = 0;
    this.completedGoals = 0;
    this.goalNotice = '';
    this.goalNoticeRemaining = 0;
    this.nextGoalDelay = 0;
  }

  private goalValue(kind: GoalKind): number {
    switch (kind) {
      case 'coins': return this.coins;
      case 'deflections': return this.deflections;
      case 'targets': return this.targets;
    }
  }
}
