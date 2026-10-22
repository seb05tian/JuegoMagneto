export interface PokiApi {
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
}

export class PokiBridge {
  private api: PokiApi | null;
  private gameplayActive = false;
  private breakPromise: Promise<void> | null = null;

  constructor(api: PokiApi | null) {
    this.api = api;
  }

  setApi(api: PokiApi | null): void {
    this.api = api;
  }

  startGameplay(): boolean {
    if (this.gameplayActive || this.breakPromise) return false;
    this.gameplayActive = true;
    this.safeCall(() => this.api?.gameplayStart());
    return true;
  }

  stopGameplay(): boolean {
    if (!this.gameplayActive) return false;
    this.gameplayActive = false;
    this.safeCall(() => this.api?.gameplayStop());
    return true;
  }

  requestCommercialBreak(onStart?: () => void): Promise<void> {
    if (this.breakPromise) return this.breakPromise;
    this.breakPromise = Promise.resolve()
      .then(async () => {
        if (this.api?.commercialBreak) await this.api.commercialBreak(onStart);
      })
      .catch(() => undefined)
      .finally(() => { this.breakPromise = null; });
    return this.breakPromise;
  }

  get isGameplayActive(): boolean {
    return this.gameplayActive;
  }

  get isBreakPending(): boolean {
    return this.breakPromise !== null;
  }

  private safeCall(action: () => void): void {
    try { action(); } catch { /* local play must continue if the platform SDK is unavailable */ }
  }
}
