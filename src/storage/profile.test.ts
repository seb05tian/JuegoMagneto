import { describe, expect, it } from 'vitest';
import { ProfileStore, PROFILE_KEY, type StorageLike } from './profile';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('profile persistence', () => {
  it('persists currency and unlocks without adding score multipliers to currency', () => {
    const storage = new MemoryStorage();
    const profile = new ProfileStore(storage);
    for (let index = 0; index < 100; index += 1) profile.addCoin();
    expect(profile.get().coins).toBe(100);
    expect(profile.isUnlocked('electric')).toBe(true);
    expect(new ProfileStore(storage).get().stats.coinsCollected).toBe(100);
  });

  it('records a run only once even if its result is reopened', () => {
    const profile = new ProfileStore(new MemoryStorage());
    expect(profile.completeRun('run-1', 420, 180, 5)).toBe(true);
    expect(profile.completeRun('run-1', 420, 180, 5)).toBe(false);
    expect(profile.get().stats.runs).toBe(1);
    expect(profile.isUnlocked('gold')).toBe(true);
    expect(profile.isUnlocked('trail')).toBe(true);
  });

  it('persists survival and combo unlock milestones before a run ends', () => {
    const storage = new MemoryStorage();
    const profile = new ProfileStore(storage);
    profile.recordAchievements(180, 5);
    expect(profile.isUnlocked('gold')).toBe(true);
    expect(profile.isUnlocked('trail')).toBe(true);
    expect(new ProfileStore(storage).get().stats.longestRunSeconds).toBe(180);
    expect(new ProfileStore(storage).get().stats.bestMultiplier).toBe(5);
  });

  it('recovers from corrupt data and blocked storage without breaking progression', () => {
    const corrupt = new MemoryStorage();
    corrupt.values.set(PROFILE_KEY, '{invalid');
    const recovered = new ProfileStore(corrupt);
    recovered.addCoin();
    expect(recovered.get().coins).toBe(1);

    const blocked: StorageLike = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const privateProfile = new ProfileStore(blocked);
    privateProfile.addCoin();
    expect(privateProfile.get().coins).toBe(1);
    expect(privateProfile.storageIsAvailable).toBe(false);
  });

  it('sanitizes missing and malformed fields before using them', () => {
    const storage = new MemoryStorage();
    storage.values.set(PROFILE_KEY, JSON.stringify({ version: 1, highScore: -9, equipped: 'cheat', stats: {} }));
    const profile = new ProfileStore(storage);
    expect(profile.get().highScore).toBe(0);
    expect(profile.get().equipped).toBe('classic');
    expect(profile.equip('gold')).toBe(false);
  });
});
