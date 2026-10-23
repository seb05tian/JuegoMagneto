import Phaser from 'phaser';
import { BALANCE, GAME, type CollectibleKind, type CosmeticId, type MagneticObjectKind } from '../config/gameConfig';
import { clampVector, calculateMagneticAcceleration, constrainAcceleration, dampVelocity, objectResponse } from './magnet';
import { SeededRandom } from './rng';
import { ComboScorer } from './scoring';
import { stepEnergy } from './energy';
import { resolveBombImpact } from './damage';
import { canBombScoreTargetHit } from './targetRules';
import { bombRateAt, canArmRegularBomb, requiredSpawnSeparation, respectsObjectCap, rewardSpawnOffset, coinTrailPositions } from './spawnRules';
import { movementAcceleration } from './movement';
import { bombLaunchVelocity } from './bombMotion';
import { layoutForViewport, remapCoordinate, targetPositions, type ArenaLayout } from './layout';
import { RunFeatures } from './runFeatures';
import type { TouchControls } from '../input/TouchControls';

export type SimEvent =
  | { type: 'collect'; kind: CollectibleKind; x: number; y: number; points: number; multiplier: number; streak: number }
  | { type: 'gift-reward'; reward: 'hearts' | 'shield' | 'overdrive'; hearts: number; x: number; y: number }
  | { type: 'target'; x: number; y: number; points: number; golden: boolean }
  | { type: 'golden-target'; x: number; y: number }
  | { type: 'overdrive'; x: number; y: number }
  | { type: 'goal'; x: number; y: number; points: number; energy: number; number: number; label: string }
  | { type: 'damage'; x: number; y: number; health: number; shieldConsumed: boolean }
  | { type: 'energy-empty'; x: number; y: number }
  | { type: 'repulse-pulse'; x: number; y: number }
  | { type: 'spawn'; kind: MagneticObjectKind; x: number; y: number; warning: boolean; launchX: number; launchY: number }
  | { type: 'tutorial'; step: 'move' | 'repel' | 'complete' }
  | { type: 'game-over'; runId: string; score: number; survivalSeconds: number; coinsCollected: number; peakMultiplier: number; goalsCompleted: number; overdriveActivations: number; deflections: number }
  | { type: 'new-run'; runId: string };

export interface RunState {
  running: boolean;
  runId: string;
  simTime: number;
  score: number;
  health: number;
  energy: number;
  hasShield: boolean;
  repulsionActive: boolean;
  exhaustedLatch: boolean;
  invulnerabilityRemaining: number;
  streak: number;
  multiplier: number;
  comboTimeRemaining: number;
  peakMultiplier: number;
  coinsCollected: number;
  crystalsCollected: number;
  targetHits: number;
  tutorialActive: boolean;
  tutorialStep: 'move' | 'repel' | 'complete';
}

interface SimEntity {
  sprite: Phaser.Physics.Arcade.Image;
  body: Phaser.Physics.Arcade.Body;
  kind: MagneticObjectKind;
  active: boolean;
  id: number;
  age: number;
  warningRemaining: number;
  repelledUntil: number;
  launchX: number;
  launchY: number;
  deflectionCounted: boolean;
}

interface TargetEntity {
  sprite: Phaser.Physics.Arcade.Image;
  body: Phaser.Physics.Arcade.StaticBody;
  flashRemaining: number;
  golden: boolean;
}

const TEXTURE_BY_KIND: Record<MagneticObjectKind, string> = {
  coin: 'item-coin',
  crystal: 'item-crystal',
  battery: 'item-battery',
  shield: 'item-shield',
  gift: 'item-gift',
  bomb: 'item-bomb',
  training: 'item-training',
};

const DISPLAY_SIZE_BY_KIND: Record<MagneticObjectKind, number> = {
  coin: 72,
  crystal: 72,
  battery: 64,
  shield: 64,
  gift: 74,
  bomb: BALANCE.objects.bomb.displaySize,
  training: BALANCE.objects.bomb.displaySize,
};

const BODY_RADIUS_BY_KIND: Record<MagneticObjectKind, number> = {
  coin: BALANCE.objects.coin.radius,
  crystal: BALANCE.objects.crystal.radius,
  battery: BALANCE.objects.battery.radius,
  shield: BALANCE.objects.shield.radius,
  gift: BALANCE.objects.gift.radius,
  bomb: BALANCE.objects.bomb.radius,
  training: BALANCE.objects.training.radius,
};

const LIFETIME_BY_KIND: Partial<Record<MagneticObjectKind, number>> = {
  coin: BALANCE.objects.coin.lifetime,
  crystal: BALANCE.objects.crystal.lifetime,
  battery: BALANCE.objects.battery.lifetime,
  shield: BALANCE.objects.shield.lifetime,
  gift: BALANCE.objects.gift.lifetime,
  bomb: BALANCE.objects.bomb.lifetime,
};

const SCORE_BY_KIND: Partial<Record<CollectibleKind, number>> = {
  coin: BALANCE.objects.coin.score,
  crystal: BALANCE.objects.crystal.score,
  battery: 0,
  shield: 0,
  gift: 0,
};

type GiftReward = { reward: 'hearts' | 'shield' | 'overdrive'; hearts: number };

function safeTrainingOffset(
  x: number,
  y: number,
  directionX: number,
  directionY: number,
  layout: ArenaLayout,
): { x: number; y: number } {
  const directions: ReadonlyArray<readonly [number, number]> = [
    [directionX, directionY], [-directionX, -directionY],
    [-directionY, directionX], [directionY, -directionX],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  for (const [dx, dy] of directions) {
    const offsetX = Phaser.Math.Clamp(x + dx * BALANCE.tutorial.spacingDistance, 48, layout.width - 48);
    const offsetY = Phaser.Math.Clamp(y + dy * BALANCE.tutorial.spacingDistance, layout.arenaTop + BALANCE.objects.training.radius + 8, layout.worldBottom - 48);
    if (Phaser.Math.Distance.Between(x, y, offsetX, offsetY) >= BALANCE.tutorial.spacingMinimum) {
      return { x: offsetX, y: offsetY };
    }
  }
  return { x: layout.width / 2, y: (layout.arenaTop + layout.worldBottom) / 2 };
}

function bombLevelForScore(score: number): number {
  return Math.min(
    BALANCE.progression.bomb.maxLevel,
    Math.max(0, Math.floor(score / BALANCE.progression.bomb.scoreStep)),
  );
}

function radiusFor(kind: MagneticObjectKind, bombLevel = 0): number {
  if (kind !== 'bomb') return BODY_RADIUS_BY_KIND[kind];
  return BODY_RADIUS_BY_KIND.bomb + bombLevel * BALANCE.progression.bomb.radiusPerLevel;
}

function displaySizeFor(kind: MagneticObjectKind, bombLevel = 0): number {
  if (kind !== 'bomb') return DISPLAY_SIZE_BY_KIND[kind];
  return DISPLAY_SIZE_BY_KIND.bomb + bombLevel * BALANCE.progression.bomb.displaySizePerLevel;
}

export class RunSimulation {
  readonly state: RunState = {
    running: false,
    runId: '',
    simTime: 0,
    score: 0,
    health: BALANCE.player.maxHealth,
    energy: BALANCE.energy.starting,
    hasShield: false,
    repulsionActive: false,
    exhaustedLatch: false,
    invulnerabilityRemaining: 0,
    streak: 0,
    multiplier: 1,
    comboTimeRemaining: 0,
    peakMultiplier: 1,
    coinsCollected: 0,
    crystalsCollected: 0,
    targetHits: 0,
    tutorialActive: false,
    tutorialStep: 'move',
  };

  readonly player: Phaser.Physics.Arcade.Image;
  readonly targets: TargetEntity[] = [];
  readonly entities: SimEntity[] = [];

  private readonly scene: Phaser.Scene;
  private readonly controls: TouchControls;
  private readonly emit: (event: SimEvent) => void;
  private readonly entityGroup: Phaser.Physics.Arcade.Group;
  private readonly targetGroup: Phaser.Physics.Arcade.StaticGroup;
  private readonly entityBySprite = new WeakMap<Phaser.GameObjects.GameObject, SimEntity>();
  private readonly targetBySprite = new WeakMap<Phaser.GameObjects.GameObject, TargetEntity>();
  private readonly scorer = new ComboScorer();
  private random = new SeededRandom(1);
  private coinAt = 0.5;
  private crystalAt = 7;
  private batteryAt = 12;
  private shieldAt = 45;
  private giftAt: number = BALANCE.spawn.firstGiftDelay;
  private bombAt: number = BALANCE.spawn.bombCooldownSeconds;
  private bombProgressionLevel = 0;
  private gameOverTimer: Phaser.Time.TimerEvent | null = null;
  private previousRepelHeld = false;
  private nextEntityId = 0;
  private damageAppliedThisStep = false;
  private readonly playerOverlap: Phaser.Physics.Arcade.Collider;
  private readonly targetOverlap: Phaser.Physics.Arcade.Collider;
  private tutorialMoved = false;
  private tutorialRepelled = false;
  private tutorialDirectionX = 1;
  private tutorialDirectionY = 0;
  private cosmetic: CosmeticId = 'classic';
  private layout: ArenaLayout;
  private currentSeed = 1;
  readonly features = new RunFeatures();

  constructor(scene: Phaser.Scene, controls: TouchControls, emit: (event: SimEvent) => void, initialLayout = layoutForViewport(GAME.width, GAME.height)) {
    this.scene = scene;
    this.controls = controls;
    this.emit = emit;
    this.layout = initialLayout;
    this.scene.physics.world.setBounds(0, this.layout.arenaTop, this.layout.width, this.layout.worldBottom - this.layout.arenaTop);
    this.entityGroup = this.scene.physics.add.group({ runChildUpdate: false, allowGravity: false });
    this.targetGroup = this.scene.physics.add.staticGroup({ runChildUpdate: false });

    this.player = this.scene.physics.add.image(this.layout.width / 2, (this.layout.arenaTop + this.layout.worldBottom) / 2, 'magnet-classic');
    this.player.setDisplaySize(64, 64).setDepth(24);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.setCircleBody(playerBody, BALANCE.player.radius, this.player.width, this.player.scaleX);
    playerBody.setCollideWorldBounds(true);
    playerBody.setMaxVelocity(BALANCE.player.maxSpeed, BALANCE.player.maxSpeed);
    playerBody.setDrag(0, 0);

    const capacities: Record<Exclude<MagneticObjectKind, 'training'>, number> = {
      coin: BALANCE.spawn.caps.coin,
      crystal: BALANCE.spawn.caps.crystal,
      battery: BALANCE.spawn.caps.battery,
      shield: BALANCE.spawn.caps.shield,
      gift: BALANCE.spawn.caps.gift,
      bomb: BALANCE.spawn.caps.bomb,
    };
    for (const kind of Object.keys(capacities) as Array<keyof typeof capacities>) {
      for (let index = 0; index < capacities[kind]; index += 1) this.createPooledEntity(kind);
    }
    const training = this.createEntity('training');
    this.entities.push(training);

    for (const position of targetPositions(this.layout)) {
      // Invisible texture keeps the static target body for scoring without drawing a board.
      const sprite = this.scene.physics.add.staticImage(position.x, position.y, 'target');
      sprite.setDisplaySize(BALANCE.objects.target.displaySize, BALANCE.objects.target.displaySize).setDepth(3);
      const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
      // Static bodies use world pixels; dynamic bodies use unscaled frame pixels.
      const offset = sprite.displayWidth / 2 - BALANCE.objects.target.radius;
      body.setCircle(BALANCE.objects.target.radius, offset, offset);
      body.reset(sprite.x, sprite.y);
      const target = { sprite, body, flashRemaining: 0, golden: false };
      this.targets.push(target);
      this.targetBySprite.set(sprite, target);
      this.targetGroup.add(sprite);
    }

    this.playerOverlap = this.scene.physics.add.overlap(
      this.player,
      this.entityGroup,
      (_player, object) => this.onPlayerOverlap(object as Phaser.GameObjects.GameObject),
    );
    this.targetOverlap = this.scene.physics.add.overlap(
      this.entityGroup,
      this.targetGroup,
      (object, target) => this.onTargetOverlap(object as Phaser.GameObjects.GameObject, target as Phaser.GameObjects.GameObject),
    );
    this.scene.physics.world.on('worldstep', this.onWorldStep, this);

    for (const target of this.targets) {
      target.flashRemaining = 0;
      target.sprite.setAlpha(1);
    }
    this.player.setVisible(false).setActive(false);
  }

  start(seed: number, runId: string, showTutorial: boolean): void {
    this.gameOverTimer?.remove();
    this.gameOverTimer = null;
    this.deactivateAllEntities();
    for (const target of this.targets) {
      target.flashRemaining = 0;
      target.golden = false;
      target.sprite.setTexture('target').setAlpha(1);
    }
    this.scorer.reset();
    this.features.reset();
    this.currentSeed = seed >>> 0;
    this.random = new SeededRandom(seed);
    this.nextEntityId = 0;
    this.state.running = true;
    this.state.runId = runId;
    this.state.simTime = 0;
    this.state.score = 0;
    this.bombProgressionLevel = 0;
    this.state.health = BALANCE.player.maxHealth;
    this.state.energy = BALANCE.energy.starting;
    this.state.hasShield = false;
    this.state.repulsionActive = false;
    this.state.exhaustedLatch = false;
    this.state.invulnerabilityRemaining = 0;
    this.state.streak = 0;
    this.state.multiplier = 1;
    this.state.comboTimeRemaining = 0;
    this.state.peakMultiplier = 1;
    this.state.coinsCollected = 0;
    this.state.crystalsCollected = 0;
    this.state.targetHits = 0;
    this.state.tutorialActive = showTutorial;
    this.state.tutorialStep = 'move';
    this.tutorialMoved = false;
    this.tutorialRepelled = false;
    this.tutorialDirectionX = 1;
    this.tutorialDirectionY = 0;
    this.previousRepelHeld = false;
    this.damageAppliedThisStep = false;
    this.coinAt = BALANCE.spawn.firstCoinDelay;
    this.crystalAt = this.random.between(...BALANCE.spawn.firstCrystalDelay);
    this.batteryAt = this.random.between(...BALANCE.spawn.batteryInterval);
    this.shieldAt = this.random.between(...BALANCE.spawn.shieldInterval);
    this.giftAt = BALANCE.spawn.firstGiftDelay + this.random.between(0, 6);
    this.bombAt = BALANCE.spawn.bombCooldownSeconds;
    this.player.setTexture(`magnet-${this.cosmetic === 'electric' || this.cosmetic === 'gold' ? this.cosmetic : 'classic'}`);
    const startX = this.layout.width / 2;
    const startY = (this.layout.arenaTop + this.layout.worldBottom) / 2;
    this.player.setPosition(startX, startY).setAlpha(1).setRotation(0).setVisible(true).setActive(true);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.enable = true;
    playerBody.reset(startX, startY);
    playerBody.setVelocity(0, 0).setAcceleration(0, 0);
    if (showTutorial) {
      const trainingPosition = safeTrainingOffset(startX, startY, 1, 0, this.layout);
      this.activateEntity(this.entities[this.entities.length - 1]!, 'training', trainingPosition.x, trainingPosition.y, false);
    }
    this.emit({ type: 'new-run', runId });
  }

  resizeArena(next: ArenaLayout): void {
    if (next.width === this.layout.width && next.height === this.layout.height && next.portrait === this.layout.portrait) return;
    const old = this.layout;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const playerVelocity = { x: playerBody.velocity.x, y: playerBody.velocity.y };
    const playerX = remapCoordinate(this.player.x, BALANCE.player.radius, old.width - BALANCE.player.radius, BALANCE.player.radius, next.width - BALANCE.player.radius);
    const playerY = remapCoordinate(this.player.y, old.arenaTop + BALANCE.player.radius, old.worldBottom - BALANCE.player.radius, next.arenaTop + BALANCE.player.radius, next.worldBottom - BALANCE.player.radius);
    this.layout = next;
    this.scene.physics.world.setBounds(0, next.arenaTop, next.width, next.worldBottom - next.arenaTop);
    this.player.setPosition(playerX, playerY);
    playerBody.reset(playerX, playerY);
    playerBody.setVelocity(playerVelocity.x, playerVelocity.y);
    const margin = BALANCE.objects.bomb.radius + 8;
    for (const entity of this.entities) {
      if (!entity.active) continue;
      const x = Phaser.Math.Clamp(remapCoordinate(entity.sprite.x, 0, old.width, 0, next.width), margin, next.width - margin);
      const y = Phaser.Math.Clamp(remapCoordinate(entity.sprite.y, old.arenaTop, old.worldBottom, next.arenaTop, next.worldBottom), next.arenaTop + margin, next.worldBottom - margin);
      const velocity = { x: entity.body.velocity.x, y: entity.body.velocity.y };
      entity.sprite.setPosition(x, y);
      entity.body.reset(x, y);
      entity.body.setVelocity(velocity.x, velocity.y);
    }
    const positions = targetPositions(next);
    this.targets.forEach((target, index) => {
      const position = positions[index];
      if (!position) return;
      target.sprite.setPosition(position.x, position.y);
      target.body.reset(position.x, position.y);
    });
    const trainer = this.entities[this.entities.length - 1];
    if (trainer?.active && this.state.tutorialActive) this.placeTrainingBomb(trainer);
  }

  get goldenTargetIndex(): number {
    return this.features.goldenTargetIndex(this.state.simTime, this.currentSeed, this.targets.length);
  }

  setCosmetic(cosmetic: CosmeticId): void {
    this.cosmetic = cosmetic;
    const skin = cosmetic === 'electric' || cosmetic === 'gold' ? cosmetic : 'classic';
    this.player.setTexture(`magnet-${skin}`);
  }

  setRunning(running: boolean): void {
    this.state.running = running;
  }

  get activeEntityCount(): number {
    let count = 0;
    for (const entity of this.entities) if (entity.active && entity.kind !== 'training') count += 1;
    return count;
  }

  get activeTimerCount(): number {
    return this.gameOverTimer ? 1 : 0;
  }

  destroy(): void {
    this.gameOverTimer?.remove();
    this.gameOverTimer = null;
    this.scene.physics.world.off('worldstep', this.onWorldStep, this);
    this.playerOverlap.destroy();
    this.targetOverlap.destroy();
    this.player.destroy();
    for (const entity of this.entities) entity.sprite.destroy();
    for (const target of this.targets) target.sprite.destroy();
    this.entities.length = 0;
    this.targets.length = 0;
  }

  private createPooledEntity(kind: Exclude<MagneticObjectKind, 'training'>): void {
    const entity = this.createEntity(kind);
    this.entities.push(entity);
  }

  private createEntity(kind: MagneticObjectKind): SimEntity {
    const sprite = this.scene.physics.add.image(0, 0, TEXTURE_BY_KIND[kind]);
    sprite.setDisplaySize(displaySizeFor(kind), displaySizeFor(kind)).setDepth(kind === 'bomb' ? 12 : kind === 'gift' ? 13 : 8).setVisible(false).setActive(false);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    this.setCircleBody(body, radiusFor(kind), sprite.width, sprite.scaleX);
    body.setCollideWorldBounds(true).setBounce(kind === 'bomb' ? 0.55 : 0.32).setDrag(0, 0);
    body.enable = false;
    const entity: SimEntity = {
      sprite,
      body,
      kind,
      active: false,
      id: 0,
      age: 0,
      warningRemaining: 0,
      repelledUntil: 0,
      launchX: 0,
      launchY: 0,
      deflectionCounted: false,
    };
    this.entityGroup.add(sprite);
    this.entityBySprite.set(sprite, entity);
    return entity;
  }

  private setCircleBody(
    body: Phaser.Physics.Arcade.Body,
    worldRadius: number,
    sourceSize: number,
    scale: number,
  ): void {
    const sourceRadius = worldRadius / scale;
    const offset = sourceSize / 2 - sourceRadius;
    body.setCircle(sourceRadius, offset, offset);
    body.updateFromGameObject();
  }

  private deactivateAllEntities(): void {
    for (const entity of this.entities) this.deactivateEntity(entity);
  }

  private activateEntity(entity: SimEntity, kind: MagneticObjectKind, x: number, y: number, warning: boolean): void {
    entity.kind = kind;
    entity.active = true;
    entity.id = ++this.nextEntityId;
    entity.age = 0;
    entity.warningRemaining = warning ? BALANCE.objects.bomb.warning : 0;
    entity.repelledUntil = 0;
    entity.launchX = 0;
    entity.launchY = 0;
    entity.deflectionCounted = false;
    if (kind === 'bomb') {
      const launch = bombLaunchVelocity({ x, y }, this.player, this.random.next(), this.random.next());
      entity.launchX = launch.x;
      entity.launchY = launch.y;
    }
    entity.sprite.setTexture(TEXTURE_BY_KIND[kind]).setPosition(x, y).setAlpha(0.95).setRotation(0);
    entity.sprite.setDisplaySize(displaySizeFor(kind, this.bombProgressionLevel), displaySizeFor(kind, this.bombProgressionLevel))
      .setDepth(kind === 'bomb' ? 12 : kind === 'gift' ? 13 : kind === 'training' ? 11 : 8);
    entity.sprite.setVisible(true).setActive(true);
    entity.body.enable = true;
    this.setCircleBody(entity.body, radiusFor(kind, this.bombProgressionLevel), entity.sprite.width, entity.sprite.scaleX);
    entity.body.reset(x, y);
    entity.body.setVelocity(0, 0).setAcceleration(0, 0);
    entity.body.setCollideWorldBounds(true).setBounce(kind === 'bomb' ? 0.55 : 0.32);
    if (warning) {
      entity.body.setVelocity(0, 0);
      entity.sprite.setAlpha(0.44);
    } else if (kind === 'bomb') {
      entity.body.setVelocity(entity.launchX, entity.launchY);
    }
    this.emit({ type: 'spawn', kind, x, y, warning, launchX: entity.launchX, launchY: entity.launchY });
  }

  private deactivateEntity(entity: SimEntity): void {
    entity.active = false;
    entity.warningRemaining = 0;
    entity.repelledUntil = 0;
    entity.body.stop();
    entity.body.enable = false;
    entity.sprite.setVisible(false).setActive(false).setAlpha(1);
  }

  private onPlayerOverlap(object: Phaser.GameObjects.GameObject): void {
    const entity = this.entityBySprite.get(object);
    if (!entity?.active || !this.state.running || entity.kind === 'training') return;
    if (entity.kind === 'bomb') {
      if (entity.warningRemaining > 0) return;
      this.deactivateEntity(entity);
      if (this.state.invulnerabilityRemaining > 0 || this.damageAppliedThisStep) return;
      const impact = resolveBombImpact({
        health: this.state.health,
        hasShield: this.state.hasShield,
        invulnerabilityRemaining: this.state.invulnerabilityRemaining,
      });
      if (!impact.applied) return;
      this.damageAppliedThisStep = true;
      this.state.health = impact.health;
      this.state.hasShield = impact.hasShield;
      this.state.invulnerabilityRemaining = impact.invulnerabilityRemaining;
      if (impact.breakCombo) {
        this.scorer.breakChain();
        this.state.streak = 0;
        this.state.multiplier = 1;
        this.state.comboTimeRemaining = 0;
      }
      this.emit({ type: 'damage', x: this.player.x, y: this.player.y, health: this.state.health, shieldConsumed: impact.shieldConsumed });
      if (impact.gameOver) {
        this.state.running = false;
        this.controls.setActive(false);
        this.scene.physics.world.pause();
        this.gameOverTimer?.remove();
        this.gameOverTimer = this.scene.time.delayedCall(
          BALANCE.player.deathSequenceSeconds * 1000,
          () => this.finishRun(true),
        );
      }
      return;
    }

    if (entity.kind === 'shield' && this.state.hasShield) return;
    const kind = entity.kind as CollectibleKind;
    const baseScore = SCORE_BY_KIND[kind] ?? 0;
    let award = { points: 0, multiplier: this.state.multiplier, streak: this.state.streak };
    if (kind === 'coin' || kind === 'crystal') {
      const overdriveScore = this.features.overdriveActive ? BALANCE.runFeatures.overdrive.scoreMultiplier : 1;
      award = this.scorer.collect(baseScore * overdriveScore, this.state.simTime);
      this.state.score = this.scorer.score;
      this.state.streak = award.streak;
      this.state.multiplier = award.multiplier;
      this.state.comboTimeRemaining = BALANCE.scoring.comboWindow;
      this.state.peakMultiplier = Math.max(this.state.peakMultiplier, award.multiplier);
    }
    if (kind === 'coin') this.state.coinsCollected += 1;
    if (kind === 'crystal') {
      this.state.crystalsCollected += 1;
      this.state.energy = Math.min(BALANCE.energy.maximum, this.state.energy + BALANCE.objects.crystal.energy);
    }
    if (kind === 'battery') this.state.energy = Math.min(BALANCE.energy.maximum, this.state.energy + BALANCE.objects.battery.energy);
    if (kind === 'shield') this.state.hasShield = true;
    const giftReward = kind === 'gift' ? this.grantGiftReward() : null;
    const x = entity.sprite.x;
    const y = entity.sprite.y;
    this.deactivateEntity(entity);
    this.emit({ type: 'collect', kind, x, y, points: award.points, multiplier: award.multiplier, streak: award.streak });
    if (giftReward) this.emit({ type: 'gift-reward', ...giftReward, x, y });
    if (kind === 'coin') {
      this.features.addCoin();
      this.chargeOverdrive(BALANCE.runFeatures.overdrive.coinCharge, x, y);
      this.completeGoalIfReady(x, y);
    } else if (kind === 'crystal') {
      this.chargeOverdrive(BALANCE.runFeatures.overdrive.crystalCharge, x, y);
    }
  }

  private onTargetOverlap(object: Phaser.GameObjects.GameObject, targetObject: Phaser.GameObjects.GameObject): void {
    const entity = this.entityBySprite.get(object);
    const target = this.targetBySprite.get(targetObject);
    if (!entity?.active || !target || entity.kind !== 'bomb' || entity.warningRemaining > 0 || !this.state.running) return;
    if (!canBombScoreTargetHit(entity, this.state.simTime)) return;
    const x = target.sprite.x;
    const y = target.sprite.y;
    const golden = this.targets.indexOf(target) === this.goldenTargetIndex;
    const points = golden ? BALANCE.runFeatures.goldenTarget.rewardPoints : BALANCE.objects.target.score;
    this.deactivateEntity(entity);
    target.flashRemaining = BALANCE.objects.target.flashSeconds;
    this.state.targetHits += 1;
    this.scorer.addFixedPoints(points);
    this.state.score = this.scorer.score;
    this.features.addTarget();
    this.emit({ type: 'target', x, y, points, golden });
    this.chargeOverdrive(BALANCE.runFeatures.overdrive.targetCharge, x, y);
    this.completeGoalIfReady(x, y);
  }

  private grantGiftReward(): GiftReward {
    const roll = this.random.next();
    const requestedHearts = roll < 0.3 ? 1 : roll < 0.42 ? 2 : 0;
    if (requestedHearts > 0) {
      const hearts = Math.min(requestedHearts, BALANCE.player.maxHealth - this.state.health);
      if (hearts > 0) {
        this.state.health += hearts;
        return { reward: 'hearts', hearts };
      }
    }

    if (roll < 0.76 && !this.state.hasShield) {
      this.state.hasShield = true;
      return { reward: 'shield', hearts: 0 };
    }
    if (this.state.health < BALANCE.player.maxHealth && roll < 0.76) {
      this.state.health += 1;
      return { reward: 'hearts', hearts: 1 };
    }

    this.features.grantOverdrive(BALANCE.runFeatures.overdrive.giftSeconds);
    return { reward: 'overdrive', hearts: 0 };
  }

  private onWorldStep(deltaSeconds: number): void {
    if (!this.state.running || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, GAME.fixedStep * GAME.maxSubSteps);
    this.damageAppliedThisStep = false;
    this.state.simTime += delta;
    this.features.tick(delta);
    this.state.invulnerabilityRemaining = Math.max(0, this.state.invulnerabilityRemaining - delta);
    if (this.scorer.expire(this.state.simTime)) {
      this.state.streak = 0;
      this.state.multiplier = 1;
    }
    this.state.comboTimeRemaining = this.scorer.timeRemaining(this.state.simTime);
    this.updateEnergyAndMovement(delta);
    this.updateBombProgression();
    this.updateEntities(delta);
    this.updateTargets(delta);
    this.updateTutorial();
    this.spawnDueObjects();
  }

  private updateEnergyAndMovement(delta: number): void {
    const held = this.controls.isRepelling;
    const energy = stepEnergy({
      energy: this.state.energy,
      repulsionActive: this.state.repulsionActive,
      exhaustedLatch: this.state.exhaustedLatch,
      previousHeld: this.previousRepelHeld,
    }, held, delta, this.features.overdriveActive ? BALANCE.runFeatures.overdrive.energyCostMultiplier : 1);
    this.state.energy = energy.energy;
    this.state.repulsionActive = energy.repulsionActive;
    this.state.exhaustedLatch = energy.exhaustedLatch;
    this.previousRepelHeld = energy.previousHeld;
    if (energy.justActivated) this.emit({ type: 'repulse-pulse', x: this.player.x, y: this.player.y });
    if (energy.justExhausted) this.emit({ type: 'energy-empty', x: this.player.x, y: this.player.y });
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const movement = this.controls.getMovement();
    const acceleration = movementAcceleration(body.velocity, movement, delta);
    const safeAcceleration = constrainAcceleration(
      body.velocity,
      acceleration,
      BALANCE.player.maxSpeed,
      delta,
    );
    body.setAcceleration(safeAcceleration.x, safeAcceleration.y);
  }

  private updateEntities(delta: number): void {
    for (const entity of this.entities) {
      if (!entity.active) continue;
      entity.age += delta;
      const lifetime = LIFETIME_BY_KIND[entity.kind];
      if (lifetime !== undefined && entity.age >= lifetime) {
        this.deactivateEntity(entity);
        continue;
      }
      if (entity.kind === 'bomb' && entity.warningRemaining > 0) {
        entity.warningRemaining = Math.max(0, entity.warningRemaining - delta);
        entity.body.setVelocity(0, 0).setAcceleration(0, 0);
        entity.sprite.setAlpha(0.38 + Math.abs(Math.sin(this.state.simTime * 11)) * 0.32);
        if (entity.warningRemaining === 0) {
          entity.sprite.setAlpha(1);
          entity.body.setVelocity(entity.launchX, entity.launchY);
        }
        continue;
      }
      if (entity.kind === 'training' && !this.state.repulsionActive) {
        entity.body.setVelocity(0, 0).setAcceleration(0, 0);
        continue;
      }
      if (entity.kind === 'coin') entity.sprite.setRotation(Math.sin(this.state.simTime * 2.5 + entity.id) * 0.11);
      else if (entity.kind === 'crystal') entity.sprite.setRotation(Math.sin(this.state.simTime * 1.8 + entity.id) * 0.12);
      else if (entity.kind === 'battery') entity.sprite.setRotation(Math.sin(this.state.simTime * 2 + entity.id) * 0.045);
      else if (entity.kind === 'shield') entity.sprite.setRotation(Math.sin(this.state.simTime * 1.8 + entity.id) * 0.07);
      else if (entity.kind === 'gift') entity.sprite.setRotation(Math.sin(this.state.simTime * 2.2 + entity.id) * 0.08);
      else if (entity.kind === 'bomb') entity.sprite.setRotation(Math.sin(this.state.simTime * 3.2 + entity.id) * 0.09);
      entity.sprite.setAlpha(lifetime === undefined ? 1 : Math.min(1, (lifetime - entity.age) / 2 + 0.15));
      const polarity = this.state.repulsionActive ? 'repel' : 'attract';
      const response = entity.kind === 'bomb' && polarity === 'attract'
        ? BALANCE.magnet.response.bomb + this.bombProgressionLevel * BALANCE.progression.bomb.attractionResponsePerLevel
        : objectResponse(entity.kind);
      const force = calculateMagneticAcceleration(
        { x: entity.sprite.x, y: entity.sprite.y },
        { x: this.player.x, y: this.player.y },
        polarity,
        response,
      );
      const forceMultiplier = this.features.overdriveActive ? BALANCE.runFeatures.overdrive.forceMultiplier : 1;
      const boostedForce = {
        x: force.x * forceMultiplier,
        y: force.y * forceMultiplier,
        magnitude: force.magnitude * forceMultiplier,
      };
      entity.body.setAcceleration(boostedForce.x, boostedForce.y);
      if (entity.kind === 'bomb' && this.state.repulsionActive && boostedForce.magnitude > 0) {
        entity.repelledUntil = this.state.simTime + BALANCE.objects.bomb.repelledWindow;
      }
      const projectile = entity.kind === 'bomb' && entity.repelledUntil > this.state.simTime;
      const drag = projectile ? BALANCE.magnet.repelledBombDragPerSecond
        : entity.kind === 'bomb' ? BALANCE.objects.bomb.driftDragPerSecond : BALANCE.magnet.objectDragPerSecond;
      const damped = dampVelocity(entity.body.velocity, drag, delta);
      const maximum = (this.state.repulsionActive || projectile
        ? BALANCE.magnet.repulsionMaxSpeed
        : BALANCE.magnet.attractionMaxSpeed) * (this.features.overdriveActive ? BALANCE.runFeatures.overdrive.speedMultiplier : 1);
      const limited = clampVector(damped, maximum);
      entity.body.setVelocity(limited.x, limited.y);
      const safeAcceleration = constrainAcceleration(limited, boostedForce, maximum, delta);
      entity.body.setAcceleration(safeAcceleration.x, safeAcceleration.y);
      if (entity.kind === 'bomb' && !entity.deflectionCounted && this.state.repulsionActive && boostedForce.magnitude >= 25) {
        const dx = entity.sprite.x - this.player.x;
        const dy = entity.sprite.y - this.player.y;
        const distance = Math.hypot(dx, dy);
        const outwardSpeed = distance > 1 ? (entity.body.velocity.x * dx + entity.body.velocity.y * dy) / distance : 0;
        if (outwardSpeed >= 60) {
          entity.deflectionCounted = true;
          this.features.addDeflection();
          this.completeGoalIfReady(entity.sprite.x, entity.sprite.y);
        }
      }
    }
  }

  private updateBombProgression(): void {
    const level = bombLevelForScore(this.state.score);
    if (level === this.bombProgressionLevel) return;
    this.bombProgressionLevel = level;
    for (const entity of this.entities) {
      if (!entity.active || entity.kind !== 'bomb') continue;
      const size = displaySizeFor('bomb', level);
      entity.sprite.setDisplaySize(size, size);
      this.setCircleBody(entity.body, radiusFor('bomb', level), entity.sprite.width, entity.sprite.scaleX);
    }
  }

  private updateTargets(delta: number): void {
    const goldenIndex = this.goldenTargetIndex;
    for (let index = 0; index < this.targets.length; index += 1) {
      const target = this.targets[index]!;
      const golden = index === goldenIndex;
      if (target.golden !== golden) {
        target.golden = golden;
        target.sprite.setTexture(golden ? 'target-gold' : 'target');
        if (golden) this.emit({ type: 'golden-target', x: target.sprite.x, y: target.sprite.y });
      }
      if (target.flashRemaining > 0) {
        target.flashRemaining = Math.max(0, target.flashRemaining - delta);
        const flashRatio = target.flashRemaining / BALANCE.objects.target.flashSeconds;
        target.sprite.setAlpha(0.72 + (1 - flashRatio) * 0.28);
      } else {
        target.sprite.setAlpha(0.9 + Math.sin(this.state.simTime * 2.1 + index * 1.6) * 0.07);
      }
    }
  }

  private updateTutorial(): void {
    if (!this.state.tutorialActive) return;
    if (this.state.simTime >= BALANCE.tutorial.promptSeconds) {
      this.state.tutorialActive = false;
      this.state.tutorialStep = 'complete';
      this.deactivateEntity(this.entities[this.entities.length - 1]!);
      this.emit({ type: 'tutorial', step: 'complete' });
      return;
    }
    const movement = this.controls.getMovement();
    const trainer = this.entities[this.entities.length - 1];
    if (!this.tutorialMoved && Math.hypot(movement.x, movement.y) > 0.1) {
      this.tutorialMoved = true;
      const length = Math.hypot(movement.x, movement.y);
      this.tutorialDirectionX = movement.x / length;
      this.tutorialDirectionY = movement.y / length;
      this.state.tutorialStep = 'repel';
      if (trainer?.active) this.placeTrainingBomb(trainer);
      this.emit({ type: 'tutorial', step: 'repel' });
    }
    if (trainer?.active && !this.state.repulsionActive) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, trainer.sprite.x, trainer.sprite.y);
      if (distance < BALANCE.tutorial.spacingThreshold) {
        this.placeTrainingBomb(trainer);
      }
    }
    if (!this.tutorialRepelled && this.state.repulsionActive && trainer?.active) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, trainer.sprite.x, trainer.sprite.y);
      const speed = Math.hypot(trainer.body.velocity.x, trainer.body.velocity.y);
      if (distance < BALANCE.magnet.repulsionRadius && speed >= BALANCE.tutorial.trainingRepelSpeed) {
        this.tutorialRepelled = true;
        this.state.tutorialActive = false;
        this.state.tutorialStep = 'complete';
        this.deactivateEntity(trainer);
        this.emit({ type: 'tutorial', step: 'complete' });
      }
    }
  }

  private placeTrainingBomb(trainer: SimEntity): void {
    const position = safeTrainingOffset(
      this.player.x,
      this.player.y,
      this.tutorialDirectionX,
      this.tutorialDirectionY,
      this.layout,
    );
    trainer.body.reset(position.x, position.y);
    trainer.sprite.setPosition(position.x, position.y);
  }

  private spawnDueObjects(): void {
    const time = this.state.simTime;
    if (time >= this.coinAt) {
      this.spawnCoinTrail();
      this.coinAt = time + this.random.between(...BALANCE.spawn.coinInterval);
    }
    if (time >= this.crystalAt) {
      this.spawn('crystal');
      this.crystalAt = time + this.random.between(...BALANCE.spawn.crystalInterval);
    }
    if (time >= this.batteryAt) {
      this.spawn('battery');
      this.batteryAt = time + this.random.between(...BALANCE.spawn.batteryInterval);
    }
    if (time >= this.shieldAt) {
      if (!this.state.hasShield && this.countActive('shield') === 0) this.spawn('shield');
      this.shieldAt = time + this.random.between(...BALANCE.spawn.shieldInterval);
    }
    if (time >= this.giftAt) {
      this.spawn('gift');
      this.giftAt = time + this.random.between(...BALANCE.spawn.giftInterval);
    }
    if (canArmRegularBomb(time) && time >= this.bombAt) {
      this.spawn('bomb');
      this.bombAt = time + 60 / bombRateAt(time);
    }
  }

  private spawnCoinTrail(): void {
    if (!respectsObjectCap('coin', this.countActive('coin'))) return;
    const origin = this.findSpawnPosition('coin', BALANCE.objects.coin.radius);
    if (!origin) return;
    const heading = Math.atan2(origin.y - this.player.y, origin.x - this.player.x);
    const curvature = this.random.between(-BALANCE.spawn.coinTrailCurvature, BALANCE.spawn.coinTrailCurvature);
    for (const point of coinTrailPositions(origin.x, origin.y, heading, curvature)) {
      if (!respectsObjectCap('coin', this.countActive('coin'))) break;
      if (!this.isSpawnPositionSafe('coin', point.x, point.y, BALANCE.objects.coin.radius)) break;
      const entity = this.entities.find((candidate) => candidate.kind === 'coin' && !candidate.active);
      if (!entity) break;
      this.activateEntity(entity, 'coin', point.x, point.y, false);
    }
  }

  private spawn(kind: Exclude<MagneticObjectKind, 'training'>): boolean {
    if (!respectsObjectCap(kind, this.countActive(kind))) return false;
    if (kind === 'shield' && this.state.hasShield) return false;
    const entity = this.entities.find((candidate) => candidate.kind === kind && !candidate.active);
    if (!entity) return false;
    const position = this.findSpawnPosition(kind, radiusFor(kind, this.bombProgressionLevel));
    if (!position) return false;
    this.activateEntity(entity, kind, position.x, position.y, kind === 'bomb');
    return true;
  }

  private countActive(kind: MagneticObjectKind): number {
    let count = 0;
    for (const entity of this.entities) if (entity.active && entity.kind === kind) count += 1;
    return count;
  }

  private findSpawnPosition(kind: MagneticObjectKind, radius: number): { x: number; y: number } | null {
    const margin = radius + 26;
    const bomb = kind === 'bomb';
    for (let attempt = 0; attempt < BALANCE.spawn.maxPlacementAttempts; attempt += 1) {
      const rewardRing = kind === 'coin' || kind === 'crystal' || kind === 'gift';
      const velocity = (this.player.body as Phaser.Physics.Arcade.Body).velocity;
      const offset = rewardRing ? rewardSpawnOffset(this.state.simTime, velocity.x, velocity.y, this.random.next(), this.random.next(), attempt) : null;
      const bombAngle = bomb ? this.random.between(0, Math.PI * 2) : 0;
      const bombDistance = bomb ? this.random.between(BALANCE.spawn.bombDistanceFromPlayer, BALANCE.spawn.bombMaximumSpawnDistance) : 0;
      const x = bomb ? this.player.x + Math.cos(bombAngle) * bombDistance : rewardRing
        ? this.player.x + offset!.x
        : this.random.between(margin, this.layout.width - margin);
      const y = bomb ? this.player.y + Math.sin(bombAngle) * bombDistance : rewardRing
        ? this.player.y + offset!.y
        : this.random.between(this.layout.arenaTop + radius + 8, this.layout.worldBottom - margin);
      if (this.isSpawnPositionSafe(kind, x, y, radius)) return { x, y };
    }
    return null;
  }

  private isSpawnPositionSafe(kind: MagneticObjectKind, x: number, y: number, radius: number): boolean {
    const margin = radius + 26;
    if (x < margin || x > this.layout.width - margin || y < this.layout.arenaTop + radius + 8 || y > this.layout.worldBottom - margin) return false;
    if (kind === 'bomb' && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < BALANCE.spawn.bombDistanceFromPlayer) return false;
    for (const target of this.targets) {
      if (Phaser.Math.Distance.Between(x, y, target.sprite.x, target.sprite.y) < radius + BALANCE.objects.target.radius + 18) return false;
    }
    for (const other of this.entities) {
      if (!other.active) continue;
      const required = requiredSpawnSeparation(kind, radius, other.kind, radiusFor(other.kind, this.bombProgressionLevel));
      if (Phaser.Math.Distance.Between(x, y, other.sprite.x, other.sprite.y) < required) return false;
    }
    return true;
  }

  private finishRun(afterDeathSequence = false): void {
    if (!this.state.running && !afterDeathSequence) return;
    this.gameOverTimer?.remove();
    this.gameOverTimer = null;
    this.state.running = false;
    this.emit({
      type: 'game-over',
      runId: this.state.runId,
      score: this.state.score,
      survivalSeconds: this.state.simTime,
      coinsCollected: this.state.coinsCollected,
      peakMultiplier: this.state.peakMultiplier,
      goalsCompleted: this.features.completedGoals,
      overdriveActivations: this.features.activations,
      deflections: this.features.deflections,
    });
  }

  private chargeOverdrive(amount: number, x: number, y: number): void {
    if (!this.features.addCharge(amount)) return;
    this.state.energy = Math.min(BALANCE.energy.maximum, this.state.energy + BALANCE.runFeatures.overdrive.activationEnergy);
    this.emit({ type: 'overdrive', x, y });
  }

  private completeGoalIfReady(x: number, y: number): void {
    const completion = this.features.completeGoalIfReady();
    if (!completion) return;
    this.scorer.addFixedPoints(completion.points);
    this.state.score = this.scorer.score;
    this.state.energy = Math.min(BALANCE.energy.maximum, this.state.energy + completion.energy);
    this.emit({ type: 'goal', x, y, points: completion.points, energy: completion.energy, number: completion.number, label: completion.label });
  }
}
