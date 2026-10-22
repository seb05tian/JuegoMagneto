import { describe, expect, it } from 'vitest';
import { movementAcceleration } from './movement';
import { BALANCE } from '../config/gameConfig';

function advance(input: { x: number; y: number }, initial = { x: 0, y: 0 }, steps = 30) {
  const velocity = { ...initial };
  for (let step = 0; step < steps; step += 1) {
    const acceleration = movementAcceleration(velocity, input, 1 / 60);
    velocity.x += acceleration.x / 60;
    velocity.y += acceleration.y / 60;
  }
  return velocity;
}

describe('precise movement', () => {
  it('normalizes diagonal input and preserves analog speed', () => {
    const diagonal = advance({ x: 1, y: 1 });
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(BALANCE.player.maxSpeed);
    expect(advance({ x: 0.5, y: 0 }).x).toBeCloseTo(BALANCE.player.maxSpeed / 2);
  });
  it('brakes the old axis when turning and stops without overshoot', () => {
    const turned = advance({ x: 0, y: 1 }, { x: 230, y: 0 }, 12);
    expect(turned.x).toBeCloseTo(0);
    expect(turned.y).toBeCloseTo(230);
    expect(advance({ x: 0, y: 0 }, { x: 230, y: 0 }, 6).x).toBeCloseTo(0);
  });
  it('ignores joystick drift and invalid elapsed time', () => {
    expect(advance({ x: 0.02, y: 0.02 })).toEqual({ x: 0, y: 0 });
    expect(movementAcceleration({ x: 1, y: 1 }, { x: 1, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
  });
});
