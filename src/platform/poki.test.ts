import { describe, expect, it, vi } from 'vitest';
import { PokiBridge } from './poki';

describe('Poki lifecycle adapter', () => {
  it('prevents duplicate start/stop events', () => {
    const api = { gameplayStart: vi.fn(), gameplayStop: vi.fn(), commercialBreak: vi.fn(async () => undefined) };
    const bridge = new PokiBridge(api);
    expect(bridge.startGameplay()).toBe(true);
    expect(bridge.startGameplay()).toBe(false);
    expect(bridge.stopGameplay()).toBe(true);
    expect(bridge.stopGameplay()).toBe(false);
    expect(api.gameplayStart).toHaveBeenCalledTimes(1);
    expect(api.gameplayStop).toHaveBeenCalledTimes(1);
  });

  it('blocks gameplay start until an ad promise settles and recovers from ad failure', async () => {
    let finishBreak: (() => void) | undefined;
    const api = {
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      commercialBreak: vi.fn(() => new Promise<void>((resolve) => { finishBreak = resolve; })),
    };
    const bridge = new PokiBridge(api);
    const waiting = bridge.requestCommercialBreak();
    await Promise.resolve();
    expect(bridge.isBreakPending).toBe(true);
    expect(bridge.startGameplay()).toBe(false);
    finishBreak?.();
    await waiting;
    expect(bridge.startGameplay()).toBe(true);

    const failing = new PokiBridge({
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      commercialBreak: vi.fn(async () => { throw new Error('ad blocked'); }),
    });
    await failing.requestCommercialBreak();
    expect(failing.startGameplay()).toBe(true);
  });
});
