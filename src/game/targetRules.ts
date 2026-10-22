export interface TargetBombState {
  warningRemaining: number;
  repelledUntil: number;
}

export function canBombScoreTargetHit(bomb: TargetBombState, simulationTime: number): boolean {
  return Number.isFinite(simulationTime) && bomb.warningRemaining <= 0 &&
    Number.isFinite(bomb.repelledUntil) && simulationTime <= bomb.repelledUntil;
}
