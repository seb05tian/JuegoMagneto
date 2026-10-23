import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __MAGNET_POKI_EVENTS__?: string[];
    __MAGNET_RELEASE_BREAK__?: (() => void) | null;
  }
}

const sdkStub = `
window.__MAGNET_POKI_EVENTS__ = [];
window.__MAGNET_RELEASE_BREAK__ = null;
window.PokiSDK = {
  init: () => Promise.resolve(),
  gameLoadingStart: () => window.__MAGNET_POKI_EVENTS__.push('loadingStart'),
  gameLoadingFinished: () => window.__MAGNET_POKI_EVENTS__.push('loadingFinished'),
  gameplayStart: () => window.__MAGNET_POKI_EVENTS__.push('gameplayStart'),
  gameplayStop: () => window.__MAGNET_POKI_EVENTS__.push('gameplayStop'),
  commercialBreak: (onStart) => {
    window.__MAGNET_POKI_EVENTS__.push('commercialBreak');
    if (onStart) onStart();
    return new Promise((resolve) => { window.__MAGNET_RELEASE_BREAK__ = resolve; });
  }
};`;

const pokiSdkUrl = 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js';

test('production plugin reports loading once and gates resume until commercial break resolves', async ({ page }) => {
  let sdkRequests = 0;
  const unexpectedExternalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4174') return;
    if (request.url() === pokiSdkUrl) sdkRequests += 1;
    else unexpectedExternalRequests.push(request.url());
  });
  await page.route(pokiSdkUrl, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: sdkStub }),
  );
  await page.goto('/');
  const canvas = page.locator('#game canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => window.__MAGNET_POKI_EVENTS__?.includes('loadingFinished'));
  expect(await page.evaluate(() => ({
    testHook: '__MAGNET_TEST__' in window,
    gameHook: '__MAGNET_GAME__' in window,
  }))).toEqual({ testHook: false, gameHook: false });
  expect(sdkRequests).toBe(1);
  expect(unexpectedExternalRequests).toEqual([]);
  const initial = await page.evaluate(() => [...(window.__MAGNET_POKI_EVENTS__ ?? [])]);
  expect(initial.filter((event) => event === 'loadingStart')).toHaveLength(1);
  expect(initial.filter((event) => event === 'loadingFinished')).toHaveLength(1);

  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Production canvas is missing');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 374 / 540);
  await page.waitForFunction(() => window.__MAGNET_POKI_EVENTS__?.includes('gameplayStart'));
  await page.mouse.click(bounds.x + bounds.width * 918 / 960, bounds.y + bounds.height * 31 / 540);
  await page.waitForFunction(() => window.__MAGNET_POKI_EVENTS__?.includes('gameplayStop'));
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height * 254 / 540);
  await page.waitForFunction(() => window.__MAGNET_POKI_EVENTS__?.includes('commercialBreak'));
  await page.waitForTimeout(120);
  const duringBreak = await page.evaluate(() => [...(window.__MAGNET_POKI_EVENTS__ ?? [])]);
  expect(duringBreak.filter((event) => event === 'gameplayStart')).toHaveLength(1);
  expect(duringBreak.filter((event) => event === 'gameplayStop')).toHaveLength(1);

  await page.evaluate(() => window.__MAGNET_RELEASE_BREAK__?.());
  await page.waitForFunction(() => window.__MAGNET_POKI_EVENTS__?.filter((event) => event === 'gameplayStart').length === 2);
  const resumed = await page.evaluate(() => [...(window.__MAGNET_POKI_EVENTS__ ?? [])]);
  expect(resumed.filter((event) => event === 'commercialBreak')).toHaveLength(1);
  expect(resumed.filter((event) => event === 'gameplayStart')).toHaveLength(2);
  expect(resumed.filter((event) => event === 'gameplayStop')).toHaveLength(1);
});
