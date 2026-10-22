import { BALANCE, type MagneticObjectKind } from '../config/gameConfig';

/** Seeded samples form a nearby lesson first, then a route ahead of movement.
 * Later placement attempts spread around the player to recover at arena edges. */
export function rewardSpawnOffset(time: number, velocityX: number, velocityY: number, angleSample: number, distanceSample: number, attempt: number): { x: number; y: number } {
  const opening = time < BALANCE.spawn.rewardOpeningSeconds;
  const forward = !opening && attempt < BALANCE.spawn.rewardForwardAttempts &&
    Math.hypot(velocityX, velocityY) >= BALANCE.spawn.rewardForwardMinimumSpeed;
  const angle = forward
    ? Math.atan2(velocityY, velocityX) + (angleSample * 2 - 1) * BALANCE.spawn.rewardForwardSpread
    : angleSample * Math.PI * 2;
  const minimum = opening ? BALANCE.spawn.rewardSpawnMinRadius : BALANCE.spawn.rewardRouteMinRadius;
  const maximum = opening ? BALANCE.spawn.rewardSpawnMaxRadius : BALANCE.spawn.rewardRouteMaxRadius;
  const distance = minimum + distanceSample * (maximum - minimum);
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

export function bombRateAt(survivalSeconds: number): number {
  const phase = BALANCE.spawn.bombsPerMinute.find((entry) => survivalSeconds < entry.until);
  return phase?.rate ?? BALANCE.spawn.bombsPerMinute.at(-1)!.rate;
}

export function coinTrailPositions(x: number, y: number, heading: number, curvature: number): { x: number; y: number }[] {
  const points = [{ x, y }];
  for (let index = 1; index < BALANCE.spawn.coinTrailCount; index += 1) {
    const angle = heading + curvature * index;
    x += Math.cos(angle) * BALANCE.spawn.coinTrailSpacing;
    y += Math.sin(angle) * BALANCE.spawn.coinTrailSpacing;
    points.push({ x, y });
  }
  return points;
}

export function canArmRegularBomb(survivalSeconds: number): boolean {
  return survivalSeconds >= BALANCE.spawn.bombCooldownSeconds;
}

export function respectsObjectCap(kind: MagneticObjectKind, activeCount: number): boolean {
  if (kind === 'training') return activeCount < 1;
  return activeCount < BALANCE.spawn.caps[kind];
}

export function requiredSpawnSeparation(kind: MagneticObjectKind, radius: number, otherKind: MagneticObjectKind, otherRadius: number): number {
  const extra = kind === 'bomb' || otherKind === 'bomb' ? 22 : BALANCE.spawn.minSeparation;
  return radius + otherRadius + extra;
}
