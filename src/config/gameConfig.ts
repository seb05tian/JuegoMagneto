const ARCADE_FPS = 60;
const MAX_ARCADE_STEPS_PER_FRAME = 5;
const FIXED_STEP_SECONDS = 1 / ARCADE_FPS;
const HUD_TOP_PANEL_BOTTOM = 69;

export const GAME = {
  width: 960,
  height: 540,
  physicsFps: ARCADE_FPS,
  fixedStep: FIXED_STEP_SECONDS,
  maxSubSteps: MAX_ARCADE_STEPS_PER_FRAME,
  // Phaser World.update consumes milliseconds. Keep one Arcade accumulator and
  // cap its input so the fractional remainder can still produce at most five steps.
  maxFrameDeltaMs: (MAX_ARCADE_STEPS_PER_FRAME - 1) * FIXED_STEP_SECONDS * 1000,
  hudTopPanelBottom: HUD_TOP_PANEL_BOTTOM,
  arenaTop: HUD_TOP_PANEL_BOTTOM + 8,
  colors: {
    background: 0x080f25,
    arena: 0x101b39,
    cyan: 0x52f1ff,
    blue: 0x3e8bff,
    orange: 0xff874a,
    red: 0xff516d,
    gold: 0xffd36b,
    violet: 0x9d80ff,
    mint: 0x72f0c3,
    text: 0xf1f5ff,
    muted: 0x93a2c3,
  },
} as const;

export const BALANCE = {
  player: {
    radius: 18,
    displaySize: 62,
    maxSpeed: 230,
    acceleration: 2100,
    braking: 2600,
    inputDeadZone: 0.08,
    maxHealth: 3,
    invulnerabilitySeconds: 1.5,
    magnetReplacementSeconds: 0.48,
    deathSequenceSeconds: 0.95,
  },
  magnet: {
    attractionRadius: 175,
    repulsionRadius: 155,
    // Boosted during the feel pass: visible motion should begin promptly while
    // remaining acceleration-based (the speed caps and quadratic falloff stay).
    attractionAcceleration: 1400,
    repulsionAcceleration: 2400,
    attractionMaxSpeed: 290,
    repulsionMaxSpeed: 410,
    response: {
      coin: 1,
      crystal: 0.85,
      battery: 0.85,
      shield: 0.75,
      gift: 0.95,
      bomb: 0.7,
      training: 0.7,
    },
    objectDragPerSecond: 1.2,
    repelledBombDragPerSecond: 0.22,
  },
  energy: {
    maximum: 100,
    starting: 100,
    repulsionPerSecond: 32,
    attractionPerSecond: 15,
    reactivationMinimum: 20,
  },
  objects: {
    coin: { radius: 13, lifetime: 18, score: 10 },
    crystal: { radius: 14, lifetime: 20, score: 30, energy: 10 },
    battery: { radius: 15, lifetime: 20, energy: 25 },
    shield: { radius: 15, lifetime: 20 },
    gift: { radius: 17, lifetime: 28 },
    bomb: {
      radius: 13, displaySize: 54, lifetime: 16, autonomousSpeed: 35, minimumDriftSpeed: 28,
      driftDragPerSecond: 0.1, launchSpread: 0.22, warning: 0.8, repelledWindow: 2,
    },
    target: { radius: 25, score: 50, displaySize: 76, hudClearance: 8, insetFromArenaEdge: 74, flashSeconds: 0.26 },
    training: { radius: 13 },
  },
  progression: {
    bomb: {
      scoreStep: 2500,
      maxLevel: 6,
      displaySizePerLevel: 4,
      radiusPerLevel: 1,
      attractionResponsePerLevel: 0.12,
    },
  },
  spawn: {
    bombDistanceFromPlayer: 230,
    bombMaximumSpawnDistance: 310,
    bombCooldownSeconds: 10,
    maxPlacementAttempts: 18,
    minSeparation: 14,
    // The opening reward ring places early coins inside the magnet's readable
    // field, so the player sees attraction work before the first hazard.
    rewardSpawnMinRadius: 82,
    rewardSpawnMaxRadius: 148,
    rewardOpeningSeconds: 8,
    rewardRouteMinRadius: 140,
    rewardRouteMaxRadius: 225,
    rewardForwardSpread: Math.PI / 3,
    rewardForwardMinimumSpeed: 30,
    rewardForwardAttempts: 10,
    caps: { coin: 28, crystal: 2, bomb: 10, battery: 2, shield: 1, gift: 1, target: 4 },
    firstCoinDelay: 0.35,
    coinTrailCount: 3,
    coinTrailSpacing: 44,
    coinTrailCurvature: 0.2,
    coinInterval: [1.8, 2.3],
    firstCrystalDelay: [7, 9],
    crystalInterval: [10, 14],
    batteryInterval: [12, 18],
    shieldInterval: [45, 60],
    firstGiftDelay: 18,
    giftInterval: [24, 34],
    bombsPerMinute: [
      { until: 30, rate: 6 },
      { until: 60, rate: 10 },
      { until: 120, rate: 14 },
      { until: 180, rate: 18 },
      { until: 300, rate: 22 },
      { until: Number.POSITIVE_INFINITY, rate: 26 },
    ],
  },
  scoring: {
    comboWindow: 2.2,
    objectsPerMultiplier: 5,
    maximumMultiplier: 5,
  },
  tutorial: {
    promptSeconds: 8,
    trainingBombX: 600,
    trainingBombY: 270,
    spacingThreshold: 65,
    spacingDistance: 100,
    spacingMinimum: 88,
    trainingRepelSpeed: 20,
  },
  cosmetics: {
    electricCoins: 100,
    goldSurvivalSeconds: 180,
    targetHits: 20,
  },
  runFeatures: {
    overdrive: {
      chargeRequired: 30,
      seconds: 6,
      forceMultiplier: 1.35,
      speedMultiplier: 1.12,
      energyCostMultiplier: 0.5,
      activationEnergy: 25,
      coinCharge: 1,
      crystalCharge: 3,
      targetCharge: 8,
      scoreMultiplier: 2,
      giftSeconds: 5,
      giftMaximumSeconds: 14,
    },
    goals: {
      coins: 12,
      deflections: 2,
      targets: 1,
      rewardPoints: [100, 200, 300],
      rewardEnergy: 15,
      nextGoalDelay: 1.6,
    },
    goldenTarget: {
      firstAppearsAt: 30,
      rotateEvery: 20,
      rewardPoints: 100,
    },
  },
} as const;

export type MagneticObjectKind = 'coin' | 'crystal' | 'battery' | 'shield' | 'gift' | 'bomb' | 'training';
export type CollectibleKind = 'coin' | 'crystal' | 'battery' | 'shield' | 'gift';
export type CosmeticId = 'classic' | 'electric' | 'gold' | 'trail' | 'pulse';
