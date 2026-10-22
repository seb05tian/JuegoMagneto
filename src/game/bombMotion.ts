import { BALANCE } from '../config/gameConfig';
import type { Vector2 } from './magnet';

/** Fixed launch toward the position seen at warning time. Never homes afterward. */
export function bombLaunchVelocity(origin: Vector2, target: Vector2, angleSample: number, speedSample: number): Vector2 {
  const angle = Math.atan2(target.y - origin.y, target.x - origin.x) + (angleSample * 2 - 1) * BALANCE.objects.bomb.launchSpread;
  const speed = BALANCE.objects.bomb.minimumDriftSpeed + speedSample *
    (BALANCE.objects.bomb.autonomousSpeed - BALANCE.objects.bomb.minimumDriftSpeed);
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
}
