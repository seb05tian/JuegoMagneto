import { BALANCE } from '../config/gameConfig';
import type { Vector2 } from './magnet';

/** Steer toward the requested velocity, including lateral braking and analog input.
 * Arcade integrates this acceleration in the existing fixed physics step. */
export function movementAcceleration(velocity: Vector2, input: Vector2, delta: number): Vector2 {
  if (!Number.isFinite(delta) || delta <= 0) return { x: 0, y: 0 };
  const magnitude = Math.hypot(input.x, input.y);
  const moving = magnitude > BALANCE.player.inputDeadZone;
  const scale = moving ? BALANCE.player.maxSpeed / Math.max(1, magnitude) : 0;
  const dx = input.x * scale - velocity.x;
  const dy = input.y * scale - velocity.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-8) return { x: 0, y: 0 };
  const maximum = moving ? BALANCE.player.acceleration : BALANCE.player.braking;
  const factor = Math.min(maximum, distance / delta) / distance;
  return { x: dx * factor, y: dy * factor };
}
