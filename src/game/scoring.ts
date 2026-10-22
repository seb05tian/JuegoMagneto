import { BALANCE } from '../config/gameConfig';

export interface ScoreAward {
  points: number;
  multiplier: number;
  streak: number;
}

export class ComboScorer {
  score = 0;
  streak = 0;
  multiplier = 1;
  private lastPickupAt: number | null = null;

  collect(basePoints: number, timeSeconds: number): ScoreAward {
    this.expire(timeSeconds);
    this.streak += 1;
    this.multiplier = Math.min(
      BALANCE.scoring.maximumMultiplier,
      Math.floor(this.streak / BALANCE.scoring.objectsPerMultiplier) + 1,
    );
    const points = Math.max(0, Math.round(basePoints)) * this.multiplier;
    this.score += points;
    this.lastPickupAt = timeSeconds;
    return { points, multiplier: this.multiplier, streak: this.streak };
  }

  addFixedPoints(points: number): number {
    const award = Math.max(0, Math.round(points));
    this.score += award;
    return award;
  }

  timeRemaining(timeSeconds: number): number {
    if (this.lastPickupAt === null) return 0;
    return Math.max(0, BALANCE.scoring.comboWindow - (timeSeconds - this.lastPickupAt));
  }

  expire(timeSeconds: number): boolean {
    if (this.lastPickupAt === null || timeSeconds - this.lastPickupAt <= BALANCE.scoring.comboWindow) {
      return false;
    }
    this.breakChain();
    return true;
  }

  breakChain(): void {
    this.streak = 0;
    this.multiplier = 1;
    this.lastPickupAt = null;
  }

  reset(): void {
    this.score = 0;
    this.breakChain();
  }
}
