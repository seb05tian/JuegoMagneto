import type { CosmeticId } from '../config/gameConfig';
import { BALANCE } from '../config/gameConfig';

export const PROFILE_KEY = 'magnet-madness-profile';
const PROFILE_VERSION = 1;
const RECENT_RUN_LIMIT = 32;

export interface ProgressProfile {
  version: number;
  highScore: number;
  coins: number;
  stats: {
    runs: number;
    coinsCollected: number;
    crystalsCollected: number;
    targetHits: number;
    longestRunSeconds: number;
    bestMultiplier: number;
  };
  equipped: CosmeticId;
  muted: boolean;
  tutorialSeen: boolean;
  completedRunIds: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createDefaultProfile(): ProgressProfile {
  return {
    version: PROFILE_VERSION,
    highScore: 0,
    coins: 0,
    stats: {
      runs: 0,
      coinsCollected: 0,
      crystalsCollected: 0,
      targetHits: 0,
      longestRunSeconds: 0,
      bestMultiplier: 1,
    },
    equipped: 'classic',
    muted: false,
    tutorialSeen: false,
    completedRunIds: [],
  };
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

function sanitizeProfile(value: unknown): ProgressProfile {
  const defaults = createDefaultProfile();
  if (!value || typeof value !== 'object') return defaults;
  const record = value as Record<string, unknown>;
  const statsValue = record.stats && typeof record.stats === 'object'
    ? record.stats as Record<string, unknown>
    : {};
  const allowedCosmetics: CosmeticId[] = ['classic', 'electric', 'gold', 'trail', 'pulse'];
  const equipped = allowedCosmetics.includes(record.equipped as CosmeticId)
    ? record.equipped as CosmeticId
    : 'classic';
  const completedRunIds = Array.isArray(record.completedRunIds)
    ? record.completedRunIds.filter((id): id is string => typeof id === 'string').slice(-RECENT_RUN_LIMIT)
    : [];

  return {
    version: PROFILE_VERSION,
    highScore: nonNegativeInteger(record.highScore),
    coins: nonNegativeInteger(record.coins),
    stats: {
      runs: nonNegativeInteger(statsValue.runs),
      coinsCollected: nonNegativeInteger(statsValue.coinsCollected),
      crystalsCollected: nonNegativeInteger(statsValue.crystalsCollected),
      targetHits: nonNegativeInteger(statsValue.targetHits),
      longestRunSeconds: nonNegativeInteger(statsValue.longestRunSeconds),
      bestMultiplier: Math.min(5, Math.max(1, nonNegativeInteger(statsValue.bestMultiplier, 1))),
    },
    equipped,
    muted: record.muted === true,
    tutorialSeen: record.tutorialSeen === true,
    completedRunIds,
  };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cloneProfile(profile: ProgressProfile): ProgressProfile {
  return {
    ...profile,
    stats: { ...profile.stats },
    completedRunIds: [...profile.completedRunIds],
  };
}

export class ProfileStore {
  private profile: ProgressProfile;
  private storage: StorageLike | null;
  private storageAvailable = true;

  constructor(storage: StorageLike | null = browserStorage()) {
    this.storage = storage;
    this.profile = this.load();
  }

  get(): ProgressProfile {
    return cloneProfile(this.profile);
  }

  get storageIsAvailable(): boolean {
    return this.storageAvailable;
  }

  get highScore(): number { return this.profile.highScore; }
  get progressCoins(): number { return this.profile.coins; }
  get equippedCosmetic(): CosmeticId { return this.profile.equipped; }
  get muted(): boolean { return this.profile.muted; }
  get tutorialSeen(): boolean { return this.profile.tutorialSeen; }
  get longestRunSeconds(): number { return this.profile.stats.longestRunSeconds; }
  get bestMultiplier(): number { return this.profile.stats.bestMultiplier; }
  get targetHits(): number { return this.profile.stats.targetHits; }

  isUnlocked(cosmetic: CosmeticId): boolean {
    const profile = this.profile;
    switch (cosmetic) {
      case 'classic': return true;
      case 'electric': return profile.coins >= BALANCE.cosmetics.electricCoins;
      case 'gold': return profile.stats.longestRunSeconds >= BALANCE.cosmetics.goldSurvivalSeconds;
      case 'trail': return profile.stats.bestMultiplier >= 5;
      case 'pulse': return profile.stats.targetHits >= BALANCE.cosmetics.targetHits;
    }
  }

  addCoin(): void {
    this.update((profile) => {
      profile.coins += 1;
      profile.stats.coinsCollected += 1;
    });
  }

  addCrystal(): void {
    this.update((profile) => { profile.stats.crystalsCollected += 1; });
  }

  addTargetHit(): void {
    this.update((profile) => { profile.stats.targetHits += 1; });
  }

  recordAchievements(survivalSeconds: number, peakMultiplier: number): void {
    const survival = nonNegativeInteger(survivalSeconds);
    const multiplier = Math.min(5, Math.max(1, nonNegativeInteger(peakMultiplier, 1)));
    if (survival <= this.profile.stats.longestRunSeconds && multiplier <= this.profile.stats.bestMultiplier) return;
    this.update((profile) => {
      profile.stats.longestRunSeconds = Math.max(profile.stats.longestRunSeconds, survival);
      profile.stats.bestMultiplier = Math.max(profile.stats.bestMultiplier, multiplier);
    });
  }

  markTutorialSeen(): void {
    if (!this.profile.tutorialSeen) this.update((profile) => { profile.tutorialSeen = true; });
  }

  setMuted(muted: boolean): void {
    this.update((profile) => { profile.muted = muted; });
  }

  equip(cosmetic: CosmeticId): boolean {
    if (!this.isUnlocked(cosmetic)) return false;
    this.update((profile) => { profile.equipped = cosmetic; });
    return true;
  }

  completeRun(runId: string, score: number, survivalSeconds: number, peakMultiplier: number): boolean {
    if (!runId || this.profile.completedRunIds.includes(runId)) return false;
    this.update((profile) => {
      profile.stats.runs += 1;
      profile.highScore = Math.max(profile.highScore, nonNegativeInteger(score));
      profile.stats.longestRunSeconds = Math.max(
        profile.stats.longestRunSeconds,
        nonNegativeInteger(survivalSeconds),
      );
      profile.stats.bestMultiplier = Math.max(
        profile.stats.bestMultiplier,
        Math.min(5, nonNegativeInteger(peakMultiplier, 1)),
      );
      profile.completedRunIds.push(runId);
      profile.completedRunIds = profile.completedRunIds.slice(-RECENT_RUN_LIMIT);
    });
    return true;
  }

  private load(): ProgressProfile {
    if (!this.storage) {
      this.storageAvailable = false;
      return createDefaultProfile();
    }
    try {
      const raw = this.storage.getItem(PROFILE_KEY);
      if (!raw) return createDefaultProfile();
      const parsed: unknown = JSON.parse(raw);
      return sanitizeProfile(parsed);
    } catch {
      this.storageAvailable = false;
      return createDefaultProfile();
    }
  }

  private update(mutate: (profile: ProgressProfile) => void): void {
    const next = cloneProfile(this.profile);
    mutate(next);
    this.profile = sanitizeProfile(next);
    if (!this.storage || !this.storageAvailable) return;
    try {
      this.storage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
    } catch {
      this.storageAvailable = false;
    }
  }
}
