import { expect, test, type Page } from '@playwright/test';

type HarnessEntity = { kind: string; active: boolean; sprite: object; repelledUntil: number };
type HarnessSimulation = {
  state: { energy: number; tutorialActive: boolean; simTime: number; score: number };
  entities: HarnessEntity[];
  player: { x: number; y: number };
  features: { overdriveActive: boolean; activations: number; completedGoals: number; charge: number };
  targets: Array<{ sprite: { x: number; y: number }; golden: boolean }>;
  goldenTargetIndex: number;
  deactivateEntity: (entity: HarnessEntity) => void;
  activateEntity: (entity: HarnessEntity, kind: string, x: number, y: number, warning: boolean) => void;
  onPlayerOverlap: (object: object) => void;
  updateTargets: (delta: number) => void;
  onTargetOverlap: (object: object, target: object) => void;
};

declare global {
  interface Window { __MAGNET_GAME__?: { scene: { getScene: (key: string) => unknown } } }
}

type BodyGeometry = { x: number; y: number; centerX: number; centerY: number; radius: number };

type MagnetSnapshot = {
  mode: string;
  running: boolean;
  simTime: number;
  totalEntities: number;
  worldstepListeners: number;
  stepsLastFrame: number;
  maximumStepsObserved: number;
  bodies: number;
  gameObjects: number;
  audioTimers: number;
  energy: number;
  layout: { width: number; height: number; portrait: boolean; arenaTop: number; worldBottom: number };
  overdrive: { active: boolean; charge: number; remaining: number; activations: number };
  goals: { completed: number; current: { kind: string; progress: number; target: number } | null; deflections: number; text: string };
  goldenTargetIndex: number;
  playerX: number;
  playerY: number;
  avatarDisplayWidth: number;
  collisionGeometry: { player: BodyGeometry; targets: BodyGeometry[]; objects: (BodyGeometry & { kind: string })[] };
  score: number;
  health: number;
  tutorialActive: boolean;
  tutorialStep: string;
  tutorialText: string;
  touchDevice: boolean;
  storageAvailable: boolean;
  overlayTexts: string[];
  instructionControls: { text: string; y: number; height: number } | null;
  training: { active: boolean; x: number; y: number; velocityX: number; velocityY: number };
  activeBombs: number;
  gameplayActive: boolean;
};

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#game canvas').waitFor();
  await expect.poll(() => page.evaluate(() => Boolean(window.__MAGNET_TEST__))).toBe(true);
}

async function clickGamePoint(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('#game canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Game canvas is missing');
  await page.mouse.click(bounds.x + bounds.width * x / 960, bounds.y + bounds.height * y / 540);
}

async function snapshot(page: Page): Promise<MagnetSnapshot> {
  return page.evaluate(() => window.__MAGNET_TEST__!.snapshot() as MagnetSnapshot);
}

test('menu loads cleanly, keyboard movement and repulsion work, pause freezes and resume waits for break', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await ready(page);
  await expect(page).toHaveTitle('Magnet Madness');
  await expect(page.locator('#rotate-hint')).toBeHidden();
  await page.screenshot({ path: 'test-results/menu-review.png' });
  await clickGamePoint(page, 480, 374);
  await expect.poll(async () => (await snapshot(page)).mode, { intervals: [10, 20, 40] }).toBe('playing');
  await page.waitForTimeout(180);

  const starting = await snapshot(page);
  expect(starting.avatarDisplayWidth).toBeGreaterThanOrEqual(61);
  expect(starting.avatarDisplayWidth).toBeLessThanOrEqual(64);
  await page.keyboard.down('d');
  await page.waitForTimeout(340);
  await page.keyboard.up('d');
  const moved = await snapshot(page);
  expect(moved.playerX).toBeGreaterThan(starting.playerX + 12);
  await page.keyboard.down('Space');
  await page.waitForTimeout(360);
  await page.keyboard.up('Space');
  const repelled = await snapshot(page);
  expect(repelled.energy).toBeLessThan(100);
  expect(repelled.stepsLastFrame).toBeLessThanOrEqual(5);
  expect(repelled.maximumStepsObserved).toBeLessThanOrEqual(5);
  await page.screenshot({ path: 'test-results/gameplay-review.png' });

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).mode).toBe('paused');
  const paused = await snapshot(page);
  await page.waitForTimeout(260);
  expect((await snapshot(page)).simTime).toBe(paused.simTime);
  await page.screenshot({ path: 'test-results/pause-review.png' });
  await clickGamePoint(page, 480, 254);
  await expect.poll(async () => (await snapshot(page)).mode, { intervals: [10, 20, 40] }).toBe('playing');
  const resumed = await snapshot(page);
  expect(resumed.simTime).toBeGreaterThanOrEqual(paused.simTime);

  await page.evaluate(() => window.__MAGNET_TEST__!.finish());
  await expect.poll(async () => (await snapshot(page)).mode).toBe('results');
  await page.screenshot({ path: 'test-results/results-review.png' });
  await clickGamePoint(page, 480, 369);
  await expect.poll(async () => (await snapshot(page)).mode).toBe('playing');
  expect((await snapshot(page)).gameplayActive).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test('blocked browser storage is clearly disclosed before progress can be lost', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => { throw new DOMException('Storage access blocked', 'SecurityError'); },
    });
  });
  await ready(page);
  const initial = await snapshot(page);
  expect(initial.storageAvailable).toBe(false);
  expect(initial.overlayTexts.join('\n')).toContain('PROGRESS WILL NOT BE SAVED IN THIS BROWSER');
});

test('training bomb stays harmless and the short tutorial responds to movement and repulsion', async ({ page }) => {
  await ready(page);
  await clickGamePoint(page, 480, 374);
  await expect.poll(async () => (await snapshot(page)).mode).toBe('playing');
  const trainingStart = await snapshot(page);
  expect(trainingStart.tutorialActive).toBe(true);
  expect(trainingStart.tutorialStep).toBe('move');
  expect(trainingStart.training.active).toBe(true);
  expect(trainingStart.activeBombs).toBe(0);
  expect(trainingStart.health).toBe(3);

  await page.keyboard.down('d');
  await page.waitForTimeout(320);
  await page.keyboard.up('d');
  await expect.poll(async () => (await snapshot(page)).tutorialStep).toBe('repel');
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot(page)).tutorialActive, { timeout: 2500 }).toBe(false);
  await page.keyboard.up('Space');
  const trained = await snapshot(page);
  expect(trained.tutorialStep).toBe('complete');
  expect(trained.training.active).toBe(false);
  expect(trained.activeBombs).toBe(0);
  expect(trained.health).toBe(3);
});

test('scaled artwork keeps player, pickups and static target collision circles centered', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__MAGNET_TEST__!.start(20261022));
  await page.waitForTimeout(180);
  const initial = (await snapshot(page)).collisionGeometry;
  const check = (body: BodyGeometry, radius: number): void => {
    expect(body.centerX).toBeCloseTo(body.x, 1);
    expect(body.centerY).toBeCloseTo(body.y, 1);
    expect(body.radius).toBeCloseTo(radius, 1);
  };
  check(initial.player, 18);
  for (const target of initial.targets) check(target, 25);
  const trainer = initial.objects.find((object) => object.kind === 'training');
  expect(trainer).toBeDefined();
  check(trainer!, 13);
  await expect.poll(async () => (await snapshot(page)).collisionGeometry.objects.some((object) => object.kind === 'coin'), { intervals: [20], timeout: 2500 }).toBe(true);
  const coin = (await snapshot(page)).collisionGeometry.objects.find((object) => object.kind === 'coin');
  expect(coin).toBeDefined();
  check(coin!, 13);
});

test('an aimed bomb pushed by continuous repulsion hits a real target once for 50 points', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__MAGNET_TEST__!.start(20261022));
  // Arrange positions only; the shot uses keyboard input and the actual Arcade
  // world, magnetic acceleration, group overlap and reward consumption path.
  await page.evaluate(`(() => {
    const simulation = window.__MAGNET_GAME__.scene.getScene('GameScene').simulation;
    for (const entity of simulation.entities) simulation.deactivateEntity(entity);
    simulation.state.tutorialActive = false;
    const target = simulation.targets[0].sprite;
    simulation.player.body.reset(target.x + 150, target.y);
    const bomb = simulation.entities.find(entity => entity.kind === 'bomb');
    simulation.activateEntity(bomb, 'bomb', target.x + 75, target.y, false);
    bomb.body.setVelocity(0, 0);
  })()`);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot(page)).score, { intervals: [30], timeout: 5000 }).toBe(50);
  await page.keyboard.up('Space');
  expect((await snapshot(page)).activeBombs).toBe(0);
  await page.waitForTimeout(180);
  expect((await snapshot(page)).score).toBe(50);
});

test('collecting, deflecting, target hits, and Overdrive rewards work inside the run', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__MAGNET_TEST__!.start(7));
  const afterCoins = await page.evaluate(() => {
    const simulation = (window.__MAGNET_GAME__!.scene.getScene('GameScene') as { simulation: HarnessSimulation }).simulation;
    simulation.state.energy = 40;
    for (const entity of simulation.entities) simulation.deactivateEntity(entity);
    simulation.state.tutorialActive = false;
    for (let index = 0; index < 30; index += 1) {
      const coin = simulation.entities.find((entity) => entity.kind === 'coin' && !entity.active);
      if (!coin) throw new Error('Coin pool was exhausted while collecting one at a time');
      simulation.activateEntity(coin, 'coin', simulation.player.x + 32, simulation.player.y, false);
      simulation.onPlayerOverlap(coin.sprite);
    }
    return {
      score: simulation.state.score,
      energy: simulation.state.energy,
      overdrive: simulation.features.overdriveActive,
      activations: simulation.features.activations,
      goal: simulation.features.completedGoals,
      charge: simulation.features.charge,
    };
  });
  expect(afterCoins.overdrive).toBe(true);
  expect(afterCoins.activations).toBe(1);
  expect(afterCoins.charge).toBe(0);
  expect(afterCoins.energy).toBe(80);
  expect(afterCoins.goal).toBe(1);

  const goldenHit = await page.evaluate((scoreBefore) => {
    const simulation = (window.__MAGNET_GAME__!.scene.getScene('GameScene') as { simulation: HarnessSimulation }).simulation;
    simulation.state.simTime = 30;
    simulation.updateTargets(1 / 60);
    const target = simulation.targets[simulation.goldenTargetIndex]!;
    const bomb = simulation.entities.find((entity) => entity.kind === 'bomb');
    if (!bomb) throw new Error('Bomb pool is missing');
    simulation.activateEntity(bomb, 'bomb', target.sprite.x + 60, target.sprite.y, false);
    bomb.repelledUntil = 31;
    simulation.onTargetOverlap(bomb.sprite, target.sprite);
    return { points: simulation.state.score - scoreBefore, golden: target.golden, activeBombs: simulation.entities.filter((entity) => entity.kind === 'bomb' && entity.active).length };
  }, afterCoins.score);
  expect(goldenHit.golden).toBe(true);
  expect(goldenHit.points).toBe(100);
  expect(goldenHit.activeBombs).toBe(0);
});

test('100 complete starts and retries keep physics bodies, listeners and timers bounded', async ({ page }) => {
  await ready(page);
  const diagnostics = await page.evaluate(async () => {
    const hooks = window.__MAGNET_TEST__!;
    hooks.start(20261022);
    const first = hooks.snapshot() as unknown as MagnetSnapshot;
    const baseline = {
      bodies: first.bodies,
      totalEntities: first.totalEntities,
      worldstepListeners: first.worldstepListeners,
      gameObjects: first.gameObjects,
    };
    for (let cycle = 0; cycle < 100; cycle += 1) {
      hooks.finish();
      if (hooks.snapshot().mode !== 'results') throw new Error(`Cycle ${cycle}: results did not open`);
      await hooks.retry();
      const state = hooks.snapshot() as unknown as MagnetSnapshot;
      if (state.mode !== 'playing' || !state.running) throw new Error(`Cycle ${cycle}: retry did not start`);
      if (state.bodies !== baseline.bodies) throw new Error(`Cycle ${cycle}: physics bodies grew`);
      if (state.totalEntities !== baseline.totalEntities) throw new Error(`Cycle ${cycle}: pooled entities grew`);
      if (state.worldstepListeners !== baseline.worldstepListeners) throw new Error(`Cycle ${cycle}: physics listeners grew`);
      if (state.gameObjects !== baseline.gameObjects) throw new Error(`Cycle ${cycle}: game objects grew`);
      if (state.audioTimers > 1) throw new Error(`Cycle ${cycle}: audio timers grew`);
    }
    hooks.finish();
    return { ...(hooks.snapshot() as unknown as MagnetSnapshot), baseline, completedCycles: 100 };
  });
  expect(diagnostics.completedCycles).toBe(100);
  expect(diagnostics.mode).toBe('results');
  expect(diagnostics.bodies).toBe(diagnostics.baseline.bodies);
  expect(diagnostics.worldstepListeners).toBe(1);
  expect(diagnostics.audioTimers).toBe(0);
});

test('mobile landscape keeps multitouch and portrait adapts to a tall playable arena', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await ready(page);
  await expect(page.locator('#rotate-hint')).toHaveCount(0);
  await clickGamePoint(page, 480, 374);
  await expect.poll(async () => (await snapshot(page)).mode).toBe('playing');

  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('Mobile game canvas is missing');
  const ratioX = canvas.width / 960;
  const ratioY = canvas.height / 540;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: canvas.x + 166 * ratioX, y: canvas.y + 423 * ratioY, radiusX: 18, radiusY: 18, force: 1 },
      { id: 2, x: canvas.x + 852 * ratioX, y: canvas.y + 428 * ratioY, radiusX: 22, radiusY: 22, force: 1 },
    ],
  });
  await page.waitForTimeout(380);
  const touched = await snapshot(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(touched.playerX).toBeGreaterThan(480);
  expect(touched.energy).toBeLessThan(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await snapshot(page)).layout.portrait).toBe(true);
  const portrait = await snapshot(page);
  expect(portrait.mode).toBe('paused');
  expect(portrait.layout.width).toBe(540);
  expect(portrait.layout.height).toBeGreaterThan(1100);
  await expect(page.locator('#game canvas')).toHaveCSS('visibility', 'visible');
  const bounds = await page.locator('#game canvas').boundingBox();
  expect(bounds?.width).toBeGreaterThan(380);
  expect(bounds?.height).toBeGreaterThan(820);
  await context.close();
});

test('4:3 tablet landscape keeps the arena undistorted and shows usable touch and keyboard instructions', async ({ browser }) => {
  const tabletContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const tablet = await tabletContext.newPage();
  await ready(tablet);
  await clickGamePoint(tablet, 765, 31);
  await expect.poll(async () => (await snapshot(tablet)).mode).toBe('instructions');
  const touchInstructions = await snapshot(tablet);
  expect(touchInstructions.touchDevice).toBe(true);
  expect(touchInstructions.overlayTexts.join('\n')).toContain('LEFT JOYSTICK / MOVE');
  expect(touchInstructions.overlayTexts.join('\n')).toContain('HOLD ORANGE PULSE / REPEL');

  const tabletCanvas = await tablet.locator('#game canvas').boundingBox();
  if (!tabletCanvas) throw new Error('Tablet game canvas is missing');
  expect(tabletCanvas.width / tabletCanvas.height).toBeCloseTo(16 / 9, 2);
  expect(tabletCanvas.width).toBeLessThanOrEqual(1024);
  expect(tabletCanvas.height).toBeLessThanOrEqual(768);
  expect(tabletCanvas.x).toBeCloseTo((1024 - tabletCanvas.width) / 2, 1);
  expect(tabletCanvas.y).toBeCloseTo((768 - tabletCanvas.height) / 2, 1);

  await clickGamePoint(tablet, 480, 461);
  await expect.poll(async () => (await snapshot(tablet)).mode).toBe('menu');
  await tablet.evaluate(() => window.__MAGNET_TEST__!.start(42));
  await expect.poll(async () => (await snapshot(tablet)).mode).toBe('playing');
  expect((await snapshot(tablet)).tutorialText).toBe('MOVE WITH THE LEFT JOYSTICK');

  const canvas = await tablet.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('Tablet game canvas is missing');
  const ratioX = canvas.width / 960;
  const ratioY = canvas.height / 540;
  const session = await tabletContext.newCDPSession(tablet);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: canvas.x + 202 * ratioX, y: canvas.y + 378 * ratioY, radiusX: 18, radiusY: 18, force: 1 },
      { id: 2, x: canvas.x + 790 * ratioX, y: canvas.y + 378 * ratioY, radiusX: 20, radiusY: 20, force: 1 },
    ],
  });
  await tablet.waitForTimeout(360);
  const touched = await snapshot(tablet);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(touched.playerX).toBeGreaterThan(480);
  expect(touched.energy).toBeLessThan(100);
  await tabletContext.close();

  const keyboardPage = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await ready(keyboardPage);
  await clickGamePoint(keyboardPage, 765, 31);
  await expect.poll(async () => (await snapshot(keyboardPage)).mode).toBe('instructions');
  const keyboardInstructions = await snapshot(keyboardPage);
  expect(keyboardInstructions.touchDevice).toBe(false);
  expect(keyboardInstructions.overlayTexts.join('\n')).toContain('W / ↑ = UP; A / ← = LEFT');
  expect(keyboardInstructions.overlayTexts.join('\n')).toContain('S / ↓ = DOWN; D / → = RIGHT');
  expect(keyboardInstructions.overlayTexts.join('\n')).toContain('HOLD SPACE = PUSH; RELEASE = PULL');
  expect(keyboardInstructions.overlayTexts.join('\n')).toContain('P OR ESC = PAUSE');
  const controls = keyboardInstructions.instructionControls;
  expect(controls).not.toBeNull();
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(245);
  await keyboardPage.close();
});

test('portrait starts directly and simultaneous touch controls remain inside the screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await ready(page);
  await expect(page.locator('#rotate-hint')).toHaveCount(0);
  await page.evaluate(() => window.__MAGNET_TEST__!.start(42));
  const initial = await snapshot(page);
  expect(initial.layout.portrait).toBe(true);
  expect(initial.mode).toBe('playing');
  await page.screenshot({ path: 'test-results/portrait-review.png' });
  const canvas = await page.locator('#game canvas').boundingBox();
  if (!canvas) throw new Error('Portrait game canvas is missing');
  const ratioX = canvas.width / initial.layout.width;
  const ratioY = canvas.height / initial.layout.height;
  const joystickX = initial.layout.width * 0.19;
  const joystickY = initial.layout.height - 106;
  const repelX = initial.layout.width - joystickX;
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: canvas.x + (joystickX + 42) * ratioX, y: canvas.y + joystickY * ratioY, radiusX: 16, radiusY: 16, force: 1 },
      { id: 2, x: canvas.x + repelX * ratioX, y: canvas.y + joystickY * ratioY, radiusX: 20, radiusY: 20, force: 1 },
    ],
  });
  await page.waitForTimeout(320);
  const touched = await snapshot(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(touched.playerX).toBeGreaterThan(initial.layout.width / 2);
  expect(touched.energy).toBeLessThan(100);
  await context.close();
});
