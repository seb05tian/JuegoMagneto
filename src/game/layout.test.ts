import { describe, expect, it } from 'vitest';
import { layoutForViewport, remapCoordinate, targetPositions, touchControlLayout } from './layout';

describe('responsive playfield layout', () => {
  it('preserves the authored 16:9 world for landscape and builds a tall portrait arena', () => {
    expect(layoutForViewport(844, 390)).toMatchObject({ width: 960, height: 540, portrait: false });
    const phone = layoutForViewport(390, 844);
    expect(phone.portrait).toBe(true);
    expect(phone.width / phone.height).toBeCloseTo(390 / 844, 2);
    expect(phone.worldBottom).toBeLessThan(phone.height);
    expect(phone.worldBottom).toBeGreaterThan(phone.arenaTop + 500);
  });

  it('keeps targets, touch buttons, and remapped objects inside their safe areas', () => {
    const phone = layoutForViewport(390, 844);
    const targets = targetPositions(phone);
    const controls = touchControlLayout(phone);
    expect(targets.every((target) => target.x > 0 && target.x < phone.width && target.y > phone.arenaTop && target.y < phone.worldBottom)).toBe(true);
    expect(controls.joystickX).toBeLessThan(phone.width / 2);
    expect(controls.repelX).toBeGreaterThan(phone.width / 2);
    expect(phone.worldBottom).toBeLessThan(controls.joystickY - 68);
    expect(remapCoordinate(50, 0, 100, 10, 210)).toBe(110);
  });
});
