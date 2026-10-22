import { expect, test } from '@playwright/test';

type BalanceRow = {
  policy: string; seed: number; seconds: number; health: number; score: number;
  coins: number; combo: number; firstDamage: number | null;
  minimumBombDistance: number; maximumBombs: number; events: Record<string, number>;
};

test('moving and defending beats camping across three reproducible 90-second scenarios', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__MAGNET_TEST__));
  // Stop the renderer before taking control of Arcade's existing fixed-step
  // world. Only presentation callbacks are replaced; gameplay is unchanged.
  const rows = await page.evaluate<BalanceRow[]>(`(() => {
    window.__MAGNET_TEST__.start(42);
    const game = window.__MAGNET_GAME__;
    game.loop.sleep();
    const scene = game.scene.getScene('GameScene');
    const sim = scene.simulation;
    let movement = { x: 0, y: 0 }, held = false, events = {};
    let minimumBombDistance = Infinity;
    sim.controls.getMovement = () => movement;
    Object.defineProperty(sim.controls, 'isRepelling', { configurable: true, get: () => held });
    sim.emit = event => {
      events[event.type] = (events[event.type] || 0) + 1;
      if (event.type === 'spawn' && event.kind === 'bomb') {
        if (!event.warning || sim.state.simTime < 10) throw new Error('Unsafe early bomb');
        minimumBombDistance = Math.min(minimumBombDistance, Math.hypot(event.x - sim.player.x, event.y - sim.player.y));
      }
    };
    const results = [];
    for (const policy of ['idle', 'collect']) for (const seed of [42, 77, 20261022]) {
      events = {}; held = false; movement = { x: 0, y: 0 }; minimumBombDistance = Infinity;
      sim.start(seed, 'balance-' + policy + '-' + seed, false);
      let firstDamage = null, maximumBombs = 0;
      for (let tick = 0; tick < 90 * 60 && sim.state.running; tick++) {
        if (policy === 'collect') {
          let nearest = null, distance = Infinity, danger = null, dangerDistance = Infinity;
          for (const entity of sim.entities) {
            if (!entity.active || entity.warningRemaining > 0) continue;
            const d = Math.hypot(entity.sprite.x - sim.player.x, entity.sprite.y - sim.player.y);
            if ((entity.kind === 'coin' || entity.kind === 'crystal') && d < distance) { nearest = entity; distance = d; }
            if (entity.kind === 'bomb' && d < dangerDistance) { danger = entity; dangerDistance = d; }
          }
          let dx = nearest ? nearest.sprite.x - sim.player.x : Math.cos(tick / 170) * 160;
          let dy = nearest ? nearest.sprite.y - sim.player.y : Math.sin(tick / 170) * 100;
          let length = Math.max(1, Math.hypot(dx, dy)); dx /= length; dy /= length;
          if (danger && dangerDistance < 125) {
            dx += (sim.player.x - danger.sprite.x) / Math.max(1, dangerDistance) * 1.8;
            dy += (sim.player.y - danger.sprite.y) / Math.max(1, dangerDistance) * 1.8;
          }
          length = Math.max(1, Math.hypot(dx, dy)); movement = { x: dx / length, y: dy / length };
          held = dangerDistance < 105 && sim.state.energy > 5 && !sim.state.exhaustedLatch;
        }
        scene.physics.world.update(tick * 1000 / 60, 1000 / 60);
        scene.physics.world.postUpdate();
        if (firstDamage === null && sim.state.health < 3) firstDamage = sim.state.simTime;
        maximumBombs = Math.max(maximumBombs, sim.entities.filter(entity => entity.active && entity.kind === 'bomb').length);
        if (!Number.isFinite(sim.player.x) || !Number.isFinite(sim.player.y)) throw new Error('Non-finite player');
      }
      results.push({ policy, seed, seconds: sim.state.simTime, health: sim.state.health,
        score: sim.state.score, coins: sim.state.coinsCollected, combo: sim.state.peakMultiplier,
        firstDamage, minimumBombDistance, maximumBombs, events });
    }
    return results;
  })()`);
  await testInfo.attach('gameplay-balance.json', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
  for (const idle of rows.filter((row) => row.policy === 'idle')) {
    const active = rows.find((row) => row.policy === 'collect' && row.seed === idle.seed)!;
    expect(idle.firstDamage).toBeGreaterThanOrEqual(10.8);
    expect(idle.firstDamage).toBeLessThan(35);
    expect(idle.health).toBe(0);
    expect(idle.seconds).toBeLessThan(60);
    expect(active.seconds).toBeGreaterThan(idle.seconds + 15);
    expect(active.coins).toBeGreaterThan(idle.coins * 2);
    expect(active.combo).toBeGreaterThanOrEqual(3);
  }
  for (const row of rows) {
    expect(row.minimumBombDistance).toBeGreaterThanOrEqual(230 - 1e-6);
    expect(row.maximumBombs).toBeLessThanOrEqual(10);
  }
});
