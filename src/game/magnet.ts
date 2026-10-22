import type { MagneticObjectKind } from '../config/gameConfig';
import { BALANCE } from '../config/gameConfig';

export type Polarity = 'attract' | 'repel';

export interface Vector2 {
  x: number;
  y: number;
}

export interface MagneticAcceleration extends Vector2 {
  magnitude: number;
}

export function calculateMagneticAcceleration(
  object: Vector2,
  player: Vector2,
  polarity: Polarity,
  response: number,
): MagneticAcceleration {
  const dx = player.x - object.x;
  const dy = player.y - object.y;
  const distanceSquared = dx * dx + dy * dy;
  const radius = polarity === 'attract' ? BALANCE.magnet.attractionRadius : BALANCE.magnet.repulsionRadius;

  if (distanceSquared <= 1e-8 || distanceSquared >= radius * radius) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  const distance = Math.sqrt(distanceSquared);
  const falloff = 1 - distance / radius;
  const maximum = polarity === 'attract'
    ? BALANCE.magnet.attractionAcceleration
    : BALANCE.magnet.repulsionAcceleration;
  const magnitude = maximum * falloff * falloff * response;
  const direction = polarity === 'attract' ? 1 : -1;

  return {
    x: (dx / distance) * magnitude * direction,
    y: (dy / distance) * magnitude * direction,
    magnitude,
  };
}

export function dampVelocity(velocity: Vector2, dragPerSecond: number, deltaSeconds: number): Vector2 {
  const retention = Math.exp(-Math.max(0, dragPerSecond) * Math.max(0, deltaSeconds));
  return { x: velocity.x * retention, y: velocity.y * retention };
}

export function clampVector(velocity: Vector2, maximumLength: number): Vector2 {
  const lengthSquared = velocity.x * velocity.x + velocity.y * velocity.y;
  const maximumSquared = maximumLength * maximumLength;
  if (lengthSquared <= maximumSquared || lengthSquared === 0) return velocity;
  const scale = maximumLength / Math.sqrt(lengthSquared);
  return { x: velocity.x * scale, y: velocity.y * scale };
}

/** Constrains the next fixed-step velocity without turning acceleration into an impulse. */
export function constrainAcceleration(
  velocity: Vector2,
  acceleration: Vector2,
  maximumSpeed: number,
  deltaSeconds: number,
): Vector2 {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return { x: 0, y: 0 };
  const nextVelocity = clampVector({
    x: velocity.x + acceleration.x * deltaSeconds,
    y: velocity.y + acceleration.y * deltaSeconds,
  }, maximumSpeed);
  return {
    x: (nextVelocity.x - velocity.x) / deltaSeconds,
    y: (nextVelocity.y - velocity.y) / deltaSeconds,
  };
}

export function objectResponse(kind: MagneticObjectKind): number {
  return BALANCE.magnet.response[kind];
}
