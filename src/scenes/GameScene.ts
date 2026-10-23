import Phaser from 'phaser';
import type { PokiPlugin } from '@poki/phaser-3';
import { BALANCE, GAME, type CosmeticId } from '../config/gameConfig';
import { AudioManager } from '../audio/audioManager';
import { TouchControls } from '../input/TouchControls';
import { PokiBridge, type PokiApi } from '../platform/poki';
import { ProfileStore } from '../storage/profile';
import { RunSimulation, type RunState, type SimEvent } from '../game/RunSimulation';
import { safeArcadeDeltaMs } from '../game/physicsStep';
import { magnetTextureKey, type MagnetMood, type MagnetSkin } from '../game/art';
import { layoutForViewport, type ArenaLayout } from '../game/layout';

type ScreenMode = 'menu' | 'instructions' | 'playing' | 'paused' | 'ad' | 'results' | 'cosmetics';
type BreakAction = 'resume' | 'restart';

const COSMETIC_INFO: Record<CosmeticId, { name: string; detail: string }> = {
  classic: { name: 'CLASSIC', detail: 'The original red and cyan magnet.' },
  electric: { name: 'ELECTRIC', detail: 'Charged metal with bright lightning accents.' },
  gold: { name: 'GOLD', detail: 'A polished golden finish.' },
  trail: { name: 'STAR TRAIL', detail: 'Leaves bright star sparks as you move.' },
  pulse: { name: 'NOVA PULSE', detail: 'Turns your repel wave into a cyan nova.' },
};

export class GameScene extends Phaser.Scene {
  private mode: ScreenMode = 'menu';
  private readonly profile = new ProfileStore();
  private bridge!: PokiBridge;
  private readonly audio = new AudioManager(this.profile.muted);
  private controls!: TouchControls;
  private simulation!: RunSimulation;
  private layout!: ArenaLayout;
  private arenaBackground!: Phaser.GameObjects.Image;
  private arenaFrame!: Phaser.GameObjects.Graphics;
  private motionFeedback!: Phaser.GameObjects.Graphics;
  private shieldAura!: Phaser.GameObjects.Graphics;
  private playerAvatar!: Phaser.GameObjects.Image;
  private hud!: Phaser.GameObjects.Container;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private scoreLabel!: Phaser.GameObjects.Text;
  private highScoreLabel!: Phaser.GameObjects.Text;
  private timeLabel!: Phaser.GameObjects.Text;
  private energyModeLabel!: Phaser.GameObjects.Text;
  private healthLabel!: Phaser.GameObjects.Text;
  private comboLabel!: Phaser.GameObjects.Text;
  private goalLabel!: Phaser.GameObjects.Text;
  private overdriveLabel!: Phaser.GameObjects.Text;
  private shieldLabel!: Phaser.GameObjects.Text;
  private tutorialLabel!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Container;
  private readonly particles: Phaser.GameObjects.Image[] = [];
  private readonly particleTweens = new Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween>();
  private readonly transientObjects = new Set<Phaser.GameObjects.GameObject>();
  private readonly transientTweens = new Map<Phaser.GameObjects.GameObject, Phaser.Tweens.Tween>();
  private readonly overlayTweens: Phaser.Tweens.Tween[] = [];
  private lastHudState = '';
  private runCounter = 0;
  private effectCounter = 0;
  private trailAccumulator = 0;
  private recordAtRunStart = 0;
  private currentRunNewRecord = false;
  private newlyUnlocked: CosmeticId[] = [];
  private lockedAtRunStart = new Set<CosmeticId>();
  private lastPersistedSecond = 0;
  private focusBlocked = false;
  private storageWarningShown = false;
  private lastPhysicsStepCount = 0;
  private maximumStepsObserved = 0;
  private currentAvatarTexture = '';
  private lastRunResult: Extract<SimEvent, { type: 'game-over' }> | null = null;
  private previousHighScore = 0;
  private cosmeticsFrom: 'menu' | 'paused' = 'menu';
  private avatarHurtRemaining = 0;
  private avatarCelebrateRemaining = 0;
  private avatarRespawnRemaining = 0;
  private readonly onWindowBlur = (): void => this.handleFocusLoss();
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.handleFocusLoss();
  };

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // No gameplaySceneKey is configured on the plugin: this adapter owns every
    // gameplayStart/Stop transition, while the plugin owns loading events only.
    const plugin = import.meta.env.DEV ? null : this.plugins.get('poki') as PokiPlugin | undefined;
    this.bridge = new PokiBridge(plugin ? plugin as unknown as PokiApi : null);
    this.cameras.main.setBackgroundColor(GAME.colors.background);
    this.layout = layoutForViewport(window.innerWidth, window.innerHeight);
    this.arenaBackground = this.add.image(this.layout.width / 2, this.layout.height / 2, this.layout.portrait ? 'arena-background-portrait' : 'arena-background')
      .setDepth(-20);
    this.fitArenaBackground();
    this.drawArenaFrame();
    this.controls = new TouchControls(this);
    this.controls.setLayout(this.layout);
    this.controls.setActive(false);
    this.simulation = new RunSimulation(this, this.controls, (event) => this.onSimulationEvent(event), this.layout);
    this.motionFeedback = this.add.graphics().setDepth(22);
    this.shieldAura = this.add.graphics().setDepth(23).setVisible(false);
    this.playerAvatar = this.add.image(this.layout.width / 2, this.layout.height / 2, 'magnet-classic')
      .setDisplaySize(BALANCE.player.displaySize, BALANCE.player.displaySize).setDepth(24).setVisible(false);
    this.createHud();
    this.overlay = this.add.container(0, 0).setDepth(100);
    this.overlay.setPosition(this.layout.width / 2 - 480, this.layout.height / 2 - 270);
    for (let index = 0; index < 24; index += 1) {
      this.particles.push(this.add.image(0, 0, 'spark').setDepth(80).setVisible(false).setActive(false));
    }
    this.setMode('menu');
    this.showMenu();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    if (import.meta.env.DEV) {
      void import('./testHooks').then(({ installTestHooks }) => installTestHooks(this));
    }
  }

  update(time: number, delta: number): void {
    if (this.mode !== 'playing') return;
    if (this.controls.consumePausePress()) {
      this.pauseGame();
      return;
    }

    // Arcade Physics owns the sole accumulator and advances only in fixed 1/60 s
    // steps. This single call feeds it a bounded render delta, never a second loop.
    const safeDelta = safeArcadeDeltaMs(delta);
    this.physics.world.update(time, safeDelta);
    this.lastPhysicsStepCount = this.physics.world.stepsLastFrame;
    this.maximumStepsObserved = Math.max(this.maximumStepsObserved, this.lastPhysicsStepCount);
    if (this.mode !== 'playing') return;
    const wholeSecond = Math.floor(this.simulation.state.simTime);
    if (wholeSecond > this.lastPersistedSecond) {
      this.lastPersistedSecond = wholeSecond;
      this.profile.recordAchievements(wholeSecond, this.simulation.state.peakMultiplier);
    }
    this.syncStorageWarning();
    this.updateHud();
    this.updatePlayerPresentation(safeDelta);
  }

  private handleScaleResize(): void {
    if (!this.simulation || !this.controls || !this.overlay) return;
    const touchDeviceChanged = this.controls.refreshDeviceDetection();
    const next = layoutForViewport(window.innerWidth, window.innerHeight);
    if (next.width === this.layout.width && next.height === this.layout.height && next.portrait === this.layout.portrait) {
      if (touchDeviceChanged && this.mode === 'menu') this.showMenu();
      else if (touchDeviceChanged && this.mode === 'instructions') this.showInstructions();
      return;
    }
    const orientationChanged = next.portrait !== this.layout.portrait;
    this.layout = next;
    this.simulation.resizeArena(next);
    this.controls.setLayout(next);
    this.arenaBackground.setPosition(next.width / 2, next.height / 2);
    this.fitArenaBackground();
    this.drawArenaFrame();
    this.overlay.setPosition(next.width / 2 - 480, next.height / 2 - 270);
    this.layoutHud();
    this.lastHudState = '';
    this.clearTransientEffects();
    this.playerAvatar.setPosition(this.simulation.player.x, this.simulation.player.y);
    if (this.mode === 'playing' && orientationChanged) {
      this.pauseGame();
      return;
    }
    switch (this.mode) {
      case 'menu': this.showMenu(); break;
      case 'instructions': this.showInstructions(); break;
      case 'paused': this.showPause(); break;
      case 'ad': this.showAdWait(); break;
      case 'results':
        if (this.lastRunResult) this.showResults(this.lastRunResult, this.previousHighScore, false);
        break;
      case 'cosmetics': this.showCosmetics(this.cosmeticsFrom); break;
      case 'playing': break;
    }
  }

  private drawArenaFrame(): void {
    this.arenaFrame ??= this.add.graphics().setDepth(-10);
    const frame = this.arenaFrame;
    frame.clear();
    frame.lineStyle(2, 0x5674b4, 0.38).strokeRoundedRect(8, 8, this.layout.width - 16, this.layout.height - 16, 22);
    frame.lineStyle(1, 0x75dff2, 0.1).strokeRoundedRect(14, 14, this.layout.width - 28, this.layout.height - 28, 19);
    frame.fillStyle(0x4fb8e8, 0.2);
    const inset = 28;
    const corners: readonly [number, number][] = [
      [inset, inset], [this.layout.width - inset, inset],
      [inset, this.layout.height - inset], [this.layout.width - inset, this.layout.height - inset],
    ];
    for (const [x, y] of corners) frame.fillCircle(x, y, 2.5);
  }

  private fitArenaBackground(): void {
    const key = this.layout.portrait ? 'arena-background-portrait' : 'arena-background';
    this.arenaBackground.setTexture(key);
    const frame = this.textures.getFrame(key);
    if (this.layout.portrait && frame) {
      const sourceRatio = frame.width / frame.height;
      const targetRatio = this.layout.width / this.layout.height;
      let cropX = 0;
      let cropY = 0;
      let cropWidth = frame.width;
      let cropHeight = frame.height;
      if (targetRatio > sourceRatio) {
        cropHeight = frame.width / targetRatio;
        cropY = (frame.height - cropHeight) / 2;
      } else {
        cropWidth = frame.height * targetRatio;
        cropX = (frame.width - cropWidth) / 2;
      }
      this.arenaBackground.setCrop(cropX, cropY, cropWidth, cropHeight);
    } else if (frame) {
      this.arenaBackground.setCrop(0, 0, frame.width, frame.height);
    }
    this.arenaBackground.setDisplaySize(this.layout.width, this.layout.height);
  }

  private createHud(): void {
    this.hud = this.add.container(0, 0).setDepth(60).setVisible(false);
    this.hudGraphics = this.add.graphics();
    this.hud.add(this.hudGraphics);
    this.scoreLabel = this.hudText(34, 27, '0', 23, '#f4f7ff', 'left');
    this.highScoreLabel = this.hudText(152, 28, 'BEST 0', 12, '#a4b5d5', 'left');
    this.timeLabel = this.hudText(480, 25, '00:00', 20, '#f3f6ff', 'center');
    this.energyModeLabel = this.hudText(286, 50, 'PULL', 10, '#7eeaff', 'left');
    this.healthLabel = this.hudText(650, 26, 'HEALTH', 10, '#aebcda', 'left');
    this.shieldLabel = this.hudText(850, 28, 'NO SHIELD', 10, '#93a2c3', 'right');
    this.comboLabel = this.hudText(480, 92, '', 16, '#ffdb83', 'center');
    this.goalLabel = this.hudText(480, 132, '', 10, '#cbd7ee', 'center');
    this.overdriveLabel = this.hudText(480, 152, '', 10, '#d9bdff', 'center');
    this.tutorialLabel = this.hudText(480, this.layout.height - 26, '', 13, '#e8f4ff', 'center')
      .setBackgroundColor('#0a1930').setPadding(10, 5).setVisible(false);
    this.addButton(this.hud, 918, 31, 44, 38, 'Ⅱ', () => this.pauseGame(), { small: true, labelSize: 19 });
    this.layoutHud();
  }

  private layoutHud(): void {
    const width = this.layout.width;
    this.scoreLabel.setPosition(this.layout.portrait ? 20 : 34, 25);
    this.highScoreLabel.setPosition(this.layout.portrait ? 20 : 152, this.layout.portrait ? 51 : 28);
    this.timeLabel.setPosition(width / 2, 25);
    this.energyModeLabel.setPosition(this.layout.portrait ? 20 : 286, this.layout.portrait ? 78 : 50);
    this.energyModeLabel.setFontSize(this.layout.portrait ? 13 : 10);
    this.healthLabel.setVisible(!this.layout.portrait).setPosition(650, 26);
    this.shieldLabel.setPosition(this.layout.portrait ? width - 18 : 850, this.layout.portrait ? 78 : 28)
      .setOrigin(this.layout.portrait ? 1 : 0.5, 0.5)
      .setFontSize(this.layout.portrait ? 12 : 10);
    this.comboLabel.setPosition(width / 2, this.layout.portrait ? 126 : 92);
    this.goalLabel.setPosition(this.layout.portrait ? width / 2 : 190, this.layout.portrait ? 158 : 88);
    this.overdriveLabel.setPosition(this.layout.portrait ? width / 2 : 780, this.layout.portrait ? 181 : 88);
    this.goalLabel.setFontSize(this.layout.portrait ? 14 : 10);
    this.overdriveLabel.setFontSize(this.layout.portrait ? 13 : 10);
    this.highScoreLabel.setFontSize(this.layout.portrait ? 13 : 12);
    this.tutorialLabel.setFontSize(this.layout.portrait ? 15 : 13);
    this.tutorialLabel.setPosition(width / 2, this.layout.height - (this.layout.portrait ? 218 : 26));
    this.pauseButton.setPosition(this.layout.portrait ? width - 50 : 918, this.layout.portrait ? 42 : 31)
      .setScale(this.layout.portrait ? 1.8 : 1);
    this.drawHudBars(this.simulation.state);
  }

  private hudText(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): Phaser.GameObjects.Text {
    const text = this.add.text(x, y, value, {
      fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color,
      align, stroke: '#081226', strokeThickness: size > 16 ? 3 : 2,
      resolution: this.uiTextResolution(),
    }).setOrigin(align === 'left' ? 0 : 0.5, 0.5);
    this.hud.add(text);
    return text;
  }

  private updateHud(): void {
    const state = this.simulation.state;
    const score = `${state.score}`;
    const best = `BEST ${Math.max(this.profile.highScore, state.score)}`;
    const seconds = Math.floor(state.simTime);
    const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const nextCombo = BALANCE.scoring.objectsPerMultiplier - state.streak % BALANCE.scoring.objectsPerMultiplier;
    const combo = state.streak > 0 ? state.multiplier < BALANCE.scoring.maximumMultiplier
      ? `x${state.multiplier} COMBO  /  ${nextCombo} TO x${state.multiplier + 1}`
      : `x${state.multiplier} MAX COMBO  /  ${state.streak}` : '';
    const tutorial = state.tutorialActive
      ? state.tutorialStep === 'move'
        ? (this.controls.isTouchDevice ? 'MOVE WITH THE LEFT JOYSTICK' : 'MOVE WITH WASD OR ARROW KEYS')
        : (this.controls.isTouchDevice ? 'HOLD THE ORANGE PULSE TO REPEL' : 'HOLD SPACE TO REPEL THE TRAINING BOMB')
      : '';
    const comboTick = Math.ceil(state.comboTimeRemaining * 10);
    const features = this.simulation.features;
    const goal = features.goalText();
    const power = features.overdriveActive
      ? `OVERDRIVE  ${features.overdriveRemaining.toFixed(1)}s`
      : features.charge >= BALANCE.runFeatures.overdrive.chargeRequired ? 'OVERDRIVE  READY' : `OVERDRIVE  ${Math.floor(features.charge / BALANCE.runFeatures.overdrive.chargeRequired * 100)}%`;
    const key = `${score}|${best}|${clock}|${combo}|${comboTick}|${tutorial}|${goal}|${power}|${state.energy.toFixed(1)}|${state.health}|${state.hasShield}|${state.repulsionActive}|${state.exhaustedLatch}`;
    if (key === this.lastHudState) return;
    this.lastHudState = key;
    this.scoreLabel.setText(score);
    this.highScoreLabel.setText(best);
    this.timeLabel.setText(clock);
    this.comboLabel.setText(combo);
    this.goalLabel.setText(goal);
    this.overdriveLabel.setText(power).setColor(features.overdriveActive ? '#f2c7ff' : features.charge >= BALANCE.runFeatures.overdrive.chargeRequired ? '#ffe394' : '#c3a9ef');
    this.comboLabel.setColor(state.multiplier >= 4 ? '#ffd06a' : '#a4efff');
    this.tutorialLabel.setText(tutorial).setVisible(Boolean(tutorial));
    this.shieldLabel.setText(state.hasShield ? 'SHIELD READY' : 'NO SHIELD');
    this.shieldLabel.setColor(state.hasShield ? '#88ffe0' : '#93a2c3');
    this.energyModeLabel.setText(state.repulsionActive ? 'PUSH' : state.exhaustedLatch
      ? state.energy >= BALANCE.energy.reactivationMinimum ? 'RELEASE' : 'CHARGE' : 'PULL');
    this.energyModeLabel.setColor(state.repulsionActive ? '#ffae78' : state.exhaustedLatch ? '#ffcb8a' : '#7eeaff');
    this.drawHudBars(state);
  }

  private drawHudBars(state: Readonly<RunState>): void {
    const graphics = this.hudGraphics;
    graphics.clear();
    const width = this.layout.width;
    const portrait = this.layout.portrait;
    const panelWidth = width - 16;
    const panelHeight = portrait ? 100 : 61;
    graphics.fillStyle(0x071024, 0.78).fillRoundedRect(8, 8, panelWidth, panelHeight, 16);
    graphics.lineStyle(1, 0x7795d3, 0.34).strokeRoundedRect(8, 8, panelWidth, panelHeight, 16);
    const energyX = portrait ? 96 : 344;
    const energyY = portrait ? 73 : 45;
    const energyWidth = portrait ? width - 202 : 270;
    graphics.fillStyle(0x253452, 0.95).fillRoundedRect(energyX, energyY, energyWidth, 11, 6);
    const ratio = Phaser.Math.Clamp(state.energy / BALANCE.energy.maximum, 0, 1);
    const energyColor = state.exhaustedLatch ? 0xff7a6c : state.repulsionActive ? 0xffa15e : 0x5fe9f3;
    if (ratio > 0) {
      graphics.fillStyle(energyColor, 0.16).fillRoundedRect(energyX - 2, energyY - 2, energyWidth * ratio + 4, 15, 8);
      graphics.fillStyle(energyColor, 0.98).fillRoundedRect(energyX, energyY, energyWidth * ratio, 11, 6);
    }
    graphics.lineStyle(1, 0xd0e5ff, 0.3).strokeRoundedRect(energyX, energyY, energyWidth, 11, 6);
    if (state.streak > 0) {
      const comboWidth = 172;
      const comboX = (width - comboWidth) / 2;
      const comboY = portrait ? 143 : 108;
      graphics.fillStyle(0x30394c, 0.82).fillRoundedRect(comboX, comboY, comboWidth, 4, 2);
      const timeRatio = Phaser.Math.Clamp(state.comboTimeRemaining / BALANCE.scoring.comboWindow, 0, 1);
      if (timeRatio > 0) graphics.fillStyle(state.multiplier >= 4 ? 0xffd36b : 0x6eeaff, 0.96)
        .fillRoundedRect(comboX, comboY, comboWidth * timeRatio, 4, 2);
    }
    const features = this.simulation.features;
    const overdriveWidth = portrait ? Math.min(260, width - 220) : 130;
    const overdriveX = portrait ? (width - overdriveWidth) / 2 : 715;
    const overdriveY = portrait ? 194 : 103;
    const overdriveRatio = features.overdriveActive
      ? Phaser.Math.Clamp(features.overdriveRemaining / BALANCE.runFeatures.overdrive.seconds, 0, 1)
      : Phaser.Math.Clamp(features.charge / BALANCE.runFeatures.overdrive.chargeRequired, 0, 1);
    graphics.fillStyle(0x342c4b, 0.86).fillRoundedRect(overdriveX, overdriveY, overdriveWidth, 5, 3);
    if (overdriveRatio > 0) graphics.fillStyle(features.overdriveActive ? 0xd89cff : 0x9b82ff, 0.96)
      .fillRoundedRect(overdriveX, overdriveY, overdriveWidth * overdriveRatio, 5, 3);
    for (let index = 0; index < BALANCE.player.maxHealth; index += 1) {
      const x = portrait ? width - 155 + index * 18 : 710 + index * 18;
      const y = portrait ? 27 : 29;
      const alpha = index < state.health && state.health === 1 ? 0.74 + Math.sin(state.simTime * 9) * 0.2 : 1;
      const color = index < state.health ? 0xff6984 : 0x384259;
      graphics.fillStyle(color, index < state.health ? alpha : 0.62)
        .fillCircle(x - 3, y, 3.3).fillCircle(x + 3, y, 3.3)
        .fillTriangle(x - 6, y + 1, x + 6, y + 1, x, y + 9);
      graphics.lineStyle(1, index < state.health ? 0xffcad3 : 0x69738a, 0.76)
        .strokeCircle(x - 3, y, 3.3).strokeCircle(x + 3, y, 3.3);
    }
    if (state.repulsionActive) {
      graphics.lineStyle(2, 0xff9c68, 0.75).strokeCircle(portrait ? 83 : 687, portrait ? 78 : 50, 6 + Math.sin(state.simTime * 16) * 1.4);
    } else if (state.exhaustedLatch) {
      graphics.lineStyle(2, 0xff7a6c, 0.78).strokeCircle(portrait ? 83 : 687, portrait ? 78 : 50, 7);
    }
  }

  private updatePlayerPresentation(delta: number): void {
    const player = this.simulation.player;
    const body = player.body as Phaser.Physics.Arcade.Body;
    const speedX = body.velocity.x;
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    const wasRespawning = this.avatarRespawnRemaining > 0;
    this.avatarRespawnRemaining = Math.max(0, this.avatarRespawnRemaining - delta / 1000);
    const justReappeared = wasRespawning && this.avatarRespawnRemaining === 0;
    this.avatarHurtRemaining = Math.max(0, this.avatarHurtRemaining - delta / 1000);
    this.avatarCelebrateRemaining = Math.max(0, this.avatarCelebrateRemaining - delta / 1000);
    const skin: MagnetSkin = this.profile.equippedCosmetic === 'electric' || this.profile.equippedCosmetic === 'gold'
      ? this.profile.equippedCosmetic : 'classic';
    const health = this.simulation.state.health;
    let mood: MagnetMood = health <= 1 ? 'serious' : health === 2 ? 'worried' : 'idle';
    if (this.avatarHurtRemaining > 0) mood = 'hurt';
    else if (this.avatarCelebrateRemaining > 0) mood = 'celebrate';
    else if (health >= BALANCE.player.maxHealth && this.simulation.state.repulsionActive) mood = 'repel';
    else if (health >= BALANCE.player.maxHealth && this.hasNearbyMagneticObject()) mood = 'attract';
    const texture = magnetTextureKey(skin, mood);
    if (texture !== this.currentAvatarTexture) {
      this.currentAvatarTexture = texture;
      this.playerAvatar.setTexture(texture);
    }
    const moving = Phaser.Math.Clamp(speed / BALANCE.player.maxSpeed, 0, 1);
    const horizontal = Phaser.Math.Clamp(speedX / BALANCE.player.maxSpeed, -1, 1);
    const vertical = Phaser.Math.Clamp(body.velocity.y / BALANCE.player.maxSpeed, -1, 1);
    const targetRotation = Phaser.Math.Clamp(horizontal * 0.19 - vertical * 0.045, -0.21, 0.21);
    const rotationEase = 1 - Math.exp(-14 * Math.max(0, delta) / 1000);
    const rotation = Phaser.Math.Linear(this.playerAvatar.rotation, targetRotation, rotationEase);
    const time = this.simulation.state.simTime;
    const idleBob = (1 - moving) * Math.sin(time * 4.5) * 2.2;
    const movementBob = moving * Math.sin(time * 16) * 1.2;
    this.playerAvatar.setVisible(this.avatarRespawnRemaining === 0).setPosition(player.x, player.y + idleBob + movementBob)
      .setRotation(rotation);
    this.playerAvatar.setDisplaySize(
      BALANCE.player.displaySize * (1 + moving * 0.04),
      BALANCE.player.displaySize * (1 - moving * 0.05),
    );
    player.setVisible(false);
    if (this.simulation.state.invulnerabilityRemaining > 0) {
      const flash = Math.sin(this.simulation.state.simTime * 25) > 0 ? 0.38 : 1;
      this.playerAvatar.setAlpha(flash);
    } else this.playerAvatar.setAlpha(1);
    this.updateShieldAura(time);
    if (justReappeared) {
      this.burst(player.x, player.y, 12, '#9af5ff');
      this.collectionRing(player.x, player.y, 0x83efff);
    }
    this.drawBombMotionFeedback();
    if (this.profile.equippedCosmetic === 'trail') {
      this.trailAccumulator += delta / 1000;
      if (this.trailAccumulator >= 0.16 && Math.hypot(speedX, (player.body as Phaser.Physics.Arcade.Body).velocity.y) > 45) {
        this.trailAccumulator = 0;
        this.spark(player.x - speedX * 0.08, player.y + 10, 0.55, '#8ef7ff');
      }
    }
  }

  private hasNearbyMagneticObject(): boolean {
    const player = this.simulation.player;
    const radiusSquared = BALANCE.magnet.attractionRadius * BALANCE.magnet.attractionRadius;
    for (const entity of this.simulation.entities) {
      if (!entity.active || entity.kind === 'training' || entity.warningRemaining > 0) continue;
      const dx = entity.sprite.x - player.x;
      const dy = entity.sprite.y - player.y;
      if (dx * dx + dy * dy < radiusSquared) return true;
    }
    return false;
  }

  private updateShieldAura(time: number): void {
    const graphics = this.shieldAura;
    graphics.clear();
    if (!this.simulation.state.hasShield || !this.playerAvatar.visible) {
      graphics.setVisible(false);
      return;
    }
    graphics.setVisible(true);

    const pulse = 0.5 + Math.sin(time * 5.6) * 0.5;
    const radius = this.playerAvatar.displayWidth * 0.62;
    const centerX = this.playerAvatar.x;
    const centerY = this.playerAvatar.y;
    const corners = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 3;
      return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
    });

    graphics.fillStyle(0x62f2d1, 0.035 + pulse * 0.025).fillPoints(corners, true);
    graphics.lineStyle(1.5, 0x7fffe0, 0.24 + pulse * 0.24).strokePoints(corners, true);

    const orbit = time * 1.1;
    for (let index = 0; index < 3; index += 1) {
      const angle = orbit - Math.PI / 2 + (index * Math.PI * 2) / 3;
      const plateX = centerX + Math.cos(angle) * (radius + 1.5);
      const plateY = centerY + Math.sin(angle) * (radius + 1.5);
      const plate = Array.from({ length: 6 }, (_, vertex) => {
        const vertexAngle = angle + (vertex * Math.PI) / 3;
        const plateRadius = vertex % 2 === 0 ? 6.2 : 4.8;
        return { x: plateX + Math.cos(vertexAngle) * plateRadius, y: plateY + Math.sin(vertexAngle) * plateRadius };
      });
      graphics.fillStyle(0x58eecb, 0.68 + pulse * 0.24).fillPoints(plate, true);
      graphics.lineStyle(1.1, 0xe0fff5, 0.72 + pulse * 0.24).strokePoints(plate, true);
    }
  }

  private shieldShatter(x: number, y: number): void {
    const shards = this.add.graphics().setPosition(x, y).setDepth(26);
    const radius = this.playerAvatar.displayWidth * 0.62;
    const corners = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 3;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    shards.lineStyle(2.4, 0x9bffe7, 0.96);
    for (let index = 0; index < corners.length; index += 1) {
      const start = corners[index]!;
      const end = corners[(index + 1) % corners.length]!;
      shards.lineBetween(start.x, start.y, end.x, end.y);
    }
    shards.lineStyle(1.2, 0xf0fffb, 0.92);
    for (let index = 0; index < corners.length; index += 2) {
      const corner = corners[index]!;
      const angle = Math.atan2(corner.y, corner.x);
      shards.lineBetween(Math.cos(angle) * 10, Math.sin(angle) * 10, corner.x * 0.72, corner.y * 0.72);
    }
    const tween = this.tweens.add({
      targets: shards, scale: 1.18, alpha: 0, duration: 260, ease: 'Cubic.Out', onComplete: () => shards.destroy(),
    });
    this.trackTransient(shards, tween);
  }

  private drawBombMotionFeedback(): void {
    const graphics = this.motionFeedback;
    graphics.clear();
    // This short, straight tracer follows a bomb's real velocity; it is not an aim guide.
    for (const entity of this.simulation.entities) {
      if (!entity.active || entity.kind !== 'bomb' || entity.repelledUntil <= this.simulation.state.simTime) continue;
      const speed = Math.hypot(entity.body.velocity.x, entity.body.velocity.y);
      if (speed < 80) continue;
      const length = Phaser.Math.Clamp(speed * 0.11, 12, 34);
      const tailX = entity.sprite.x - entity.body.velocity.x / speed * length;
      const tailY = entity.sprite.y - entity.body.velocity.y / speed * length;
      graphics.lineStyle(5, GAME.colors.orange, 0.16).lineBetween(tailX, tailY, entity.sprite.x, entity.sprite.y);
      graphics.lineStyle(2, 0xffd1a9, 0.68).lineBetween(tailX, tailY, entity.sprite.x, entity.sprite.y);
    }
  }

  private showMenu(): void {
    this.setMode('menu');
    this.playerAvatar?.setVisible(false);
    this.shieldAura?.setVisible(false).clear();
    for (const target of this.simulation?.targets ?? []) target.sprite.setVisible(false);
    for (const entity of this.simulation?.entities ?? []) entity.sprite.setVisible(false);
    this.clearOverlay();
    this.hud.setVisible(false);
    this.controls.setActive(false);
    const profile = this.profile.get();
    const hero = this.add.image(480, 205, magnetTextureKey(
      profile.equipped === 'electric' || profile.equipped === 'gold' ? profile.equipped : 'classic',
      'idle',
    )).setDisplaySize(148, 148);
    this.overlay.add(hero);
    const heroTween = this.tweens.add({ targets: hero, y: 211, angle: 2, duration: 1250, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.overlayTweens.push(heroTween);
    this.addOverlayText(480, 72, 'MAGNET', 52, '#f4f7ff', true, 3);
    this.addOverlayText(480, 119, 'MADNESS', 21, '#75eaf6', true, 4);
    this.addOverlayText(480, 286, 'A LITTLE MAGNET. A VERY BIG MESS.', 13, '#c2cde5', true, 2);
    this.addOverlayText(480, 313, 'PULL IN TREASURE  /  PUSH BOMBS INTO TARGETS  /  SURVIVE', 11, '#889bbd', false, 2);
    this.addOverlayText(480, 333, 'GIFTS: +1-2 HEARTS  /  SHIELD BLOCKS A BOMB  /  OVERDRIVE BOOSTS SCORE + MAGNET', 9, '#91a2c3', false, 1);
    this.addButton(this.overlay, 480, 384, 260, 58, 'START RUN', () => this.beginRun(), { primary: true });
    this.addButton(this.overlay, 480, 447, 200, 42, 'MAGNET LAB', () => this.showCosmetics('menu'), { small: true });
    this.addOverlayText(480, 489, `BEST SCORE  ${profile.highScore.toLocaleString()}     ·     ${profile.coins} COINS`, 11, '#95a6c8', true, 1);
    const storageUnavailable = !this.profile.storageIsAvailable;
    if (storageUnavailable) {
      this.storageWarningShown = true;
      this.addStorageWarning(504);
    }
    this.addMenuTopButtons();
    this.addOverlayText(480, storageUnavailable ? 528 : 518, this.controls.isTouchDevice ? 'LEFT JOYSTICK  ·  HOLD ORANGE PULSE TO REPEL' : 'WASD / ARROWS  MOVE     SPACE  REPEL     ESC  PAUSE', storageUnavailable ? 9 : 10, '#657694', false, 1);
    this.enterOverlay();
    if (this.runCounter > 0) {
      this.audio.setInterrupted(false);
      void this.audio.unlock();
      this.audio.playMusic();
    }
  }

  private showInstructions(): void {
    if (this.mode !== 'menu' && this.mode !== 'instructions') return;
    this.setMode('instructions');
    this.clearOverlay();
    this.addScrim(0.82);

    const panelWidth = Math.min(680, this.layout.width - 24);
    const panelHeight = this.layout.portrait ? 532 : 448;
    this.addPanel(480, 270, panelWidth, panelHeight);
    this.addOverlayText(480, this.layout.portrait ? 35 : 81, 'HOW TO PLAY', 25, '#f4f7ff', true, 2);
    this.addOverlayText(480, this.layout.portrait ? 64 : 108, 'CONTROL YOUR MAGNET. TURN BOMBS INTO POINTS.', 12, '#75eaf6', true, 1);

    const controls = this.controls.isTouchDevice
      ? 'LEFT JOYSTICK / MOVE\nHOLD ORANGE PULSE / REPEL\nTwo thumbs work at once.'
      : 'W / ↑ = UP; A / ← = LEFT\nS / ↓ = DOWN; D / → = RIGHT\nHOLD SPACE = PUSH; RELEASE = PULL\nP OR ESC = PAUSE';
    const cards = [
      { title: 'CONTROLS', detail: controls, color: 0x68e7f5 },
      { title: 'YOUR MISSION', detail: 'Your magnet pulls in nearby pickups.\nPush bombs into corner targets for score.\nAvoid blasts; you start with 3 hearts.', color: 0xff8b62 },
      { title: 'PICKUPS', detail: 'CRYSTAL / +10 energy   BATTERY / +25\nSHIELD blocks the next bomb.\nGIFT gives 1-2 hearts, a shield, or Overdrive.', color: 0xffd36b },
      { title: 'COMBOS & OVERDRIVE', detail: 'Collect 5 coins/crystals to raise your combo.\nFill the meter for Overdrive: double score,\nstronger magnet, and half repel energy cost.', color: 0xa98bff },
    ] as const;

    if (this.layout.portrait) {
      const cardWidth = panelWidth - 32;
      const cardHeight = 80;
      const centers = [128, 213, 298, 383];
      cards.forEach((card, index) => this.addInstructionCard(480, centers[index]!, cardWidth, cardHeight, card.title, card.detail, card.color));
      this.addOverlayText(480, 440, 'FIELD TIP / BOMBS GROW; YOUR MAGNET PULL GETS STRONGER EVERY 2,500 POINTS.', 11, '#c4d0e6', true, 0);
      if (!this.profile.storageIsAvailable) this.addStorageWarning(456);
      this.addButton(this.overlay, 480, this.profile.storageIsAvailable ? 480 : 493, 170, 38, 'BACK TO MENU', () => this.showMenu(), { small: true, labelSize: 11 });
    } else {
      const cardWidth = (panelWidth - 42) / 2;
      const cardHeight = 124;
      const centerOffset = cardWidth / 2 + 8;
      const positions = [
        [480 - centerOffset, 183], [480 + centerOffset, 183],
        [480 - centerOffset, 317], [480 + centerOffset, 317],
      ] as const;
      cards.forEach((card, index) => {
        const [x, y] = positions[index]!;
        this.addInstructionCard(x, y, cardWidth, cardHeight, card.title, card.detail, card.color);
      });
      this.addOverlayText(480, 407, 'FIELD TIP / BOMBS GROW; YOUR MAGNET PULL GETS STRONGER EVERY 2,500 POINTS.', 11, '#c4d0e6', true, 0);
      if (!this.profile.storageIsAvailable) this.addStorageWarning(429);
      this.addButton(this.overlay, 480, 461, 170, 38, 'BACK TO MENU', () => this.showMenu(), { small: true, labelSize: 11 });
    }

    this.addMenuMuteButton();
    this.enterOverlay();
  }

  private addInstructionCard(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    detail: string,
    accent: number,
  ): void {
    const card = this.add.graphics();
    card.fillStyle(0x0d1930, 0.82).fillRoundedRect(x - width / 2, y - height / 2, width, height, 13);
    card.lineStyle(1, accent, 0.34).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 13);
    card.fillStyle(accent, 0.88).fillRoundedRect(x - width / 2 + 11, y - height / 2 + 13, 3, height - 26, 2);
    this.overlay.add(card);

    this.addOverlayText(x - width / 2 + 22, y - height / 2 + 22, title, 12, '#f3f7ff', true, 0, 'left');
    const copy = this.add.text(x - width / 2 + 22, y - height / 2 + 38, detail, {
      fontFamily: 'Arial, sans-serif', fontSize: '12px',
      color: '#d0dcef', lineSpacing: 1, wordWrap: { width: width - 42 },
      resolution: this.uiTextResolution(),
    }).setOrigin(0, 0);
    this.overlay.add(copy);
  }

  private addMenuTopButtons(): void {
    const scale = this.layout.portrait ? 1.5 : 1;
    const soundX = this.layout.width - 80;
    const sound = this.menuOverlayPoint(soundX, 31);
    this.addMuteButton(sound.x, sound.y);

    const instructionsWidth = 118;
    const instructionsX = soundX - (96 / 2 + instructionsWidth / 2 + 8) * scale;
    const instructions = this.menuOverlayPoint(instructionsX, 31);
    this.addButton(this.overlay, instructions.x, instructions.y, instructionsWidth, 34, 'INSTRUCTIONS', () => this.showInstructions(), { small: true, labelSize: 9 });
  }

  private addMenuMuteButton(): void {
    const point = this.menuOverlayPoint(this.layout.width - 80, 31);
    this.addMuteButton(point.x, point.y);
  }

  private addStorageWarning(y: number): void {
    this.addOverlayText(480, y, 'PROGRESS WILL NOT BE SAVED IN THIS BROWSER', 10, '#ffb982', true, 1);
  }

  private syncStorageWarning(): void {
    if (this.profile.storageIsAvailable || this.storageWarningShown) return;
    this.storageWarningShown = true;
    if (this.mode === 'playing') {
      this.floatingText(this.layout.width / 2, this.layout.height / 2 + 90, 'PROGRESS WILL NOT BE SAVED', '#ffb982', 13);
    }
  }

  private menuOverlayPoint(screenX: number, screenY: number): { x: number; y: number } {
    return { x: screenX - this.overlay.x, y: screenY - this.overlay.y };
  }

  private pauseGame(): void {
    if (this.mode !== 'playing') return;
    this.simulation.setRunning(false);
    this.controls.setActive(false);
    this.physics.world.pause();
    for (const tween of new Set(this.transientTweens.values())) tween.pause();
    for (const tween of this.particleTweens.values()) tween.pause();
    this.bridge.stopGameplay();
    this.audio.stopMusic();
    this.audio.setInterrupted(true);
    this.setMode('paused');
    this.showPause();
  }

  private showPause(): void {
    this.clearOverlay();
    this.addScrim();
    this.addPanel(480, 270, 410, 335);
    this.addOverlayText(480, 160, 'PAUSED', 34, '#f4f7ff', true, 2);
    this.addOverlayText(480, 197, 'Your magnet is taking a breather.', 14, '#a7b7d5', false, 1);
    this.addButton(this.overlay, 480, 254, 230, 52, 'CONTINUE', () => { void this.returnThroughBreak('resume'); }, { primary: true });
    this.addButton(this.overlay, 480, 322, 230, 46, 'RESTART RUN', () => { void this.returnThroughBreak('restart'); }, { small: true });
    this.addButton(this.overlay, 480, 382, 230, 42, 'BACK TO MENU', () => this.abandonToMenu(), { small: true, muted: true });
    if (!this.profile.storageIsAvailable) this.addStorageWarning(422);
    this.addMuteButton(620, 130);
    this.enterOverlay();
  }

  private showAdWait(): void {
    this.clearOverlay();
    this.addScrim(0.92);
    this.addPanel(480, 270, 420, 220);
    this.addOverlayText(480, 232, 'COMMERCIAL BREAK', 22, '#eaf1ff', true, 2);
    this.addOverlayText(480, 273, 'Your run will continue when the break ends.', 13, '#a9b8d5', false, 1);
    const dots = this.add.text(480, 319, '•   •   •', { fontFamily: 'Arial', fontSize: '19px', color: '#70eaff' }).setOrigin(0.5);
    this.overlay.add(dots);
    const tween = this.tweens.add({ targets: dots, alpha: 0.32, duration: 430, yoyo: true, repeat: -1 });
    this.overlayTweens.push(tween);
    this.enterOverlay();
  }

  private async returnThroughBreak(action: BreakAction): Promise<void> {
    if (this.mode !== 'paused' && this.mode !== 'results') return;
    this.focusBlocked = false;
    this.bridge.stopGameplay();
    this.physics.world.pause();
    this.simulation.setRunning(false);
    this.controls.setActive(false);
    this.audio.setInterrupted(true);
    this.setMode('ad');
    this.showAdWait();
    await this.bridge.requestCommercialBreak(() => {
      if (this.mode === 'ad') this.audio.setInterrupted(true);
    });
    if ((this.mode as ScreenMode) !== 'ad') return;
    if (this.focusBlocked || document.hidden) {
      this.audio.setInterrupted(true);
      this.setMode('paused');
      this.showPause();
      return;
    }
    this.audio.setInterrupted(false);
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.clearOverlay();
    if (action === 'restart') {
      this.beginRun();
    } else {
      this.setMode('playing');
      this.simulation.setRunning(true);
      this.controls.setActive(true);
      this.hud.setVisible(true);
      this.bridge.startGameplay();
      void this.audio.unlock();
      this.audio.playMusic();
    }
  }

  private abandonToMenu(): void {
    if (this.mode !== 'paused') return;
    this.simulation.setRunning(false);
    this.controls.setActive(false);
    this.physics.world.pause();
    this.bridge.stopGameplay();
    this.audio.setInterrupted(false);
    this.audio.stopMusic();
    this.setMode('menu');
    this.showMenu();
  }

  private beginRun(seed?: number): void {
    this.clearTransientEffects();
    this.shieldAura.setVisible(false).clear();
    this.clearOverlay();
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.hud.setVisible(true);
    this.controls.refreshDeviceDetection();
    this.controls.setActive(true);
    this.recordAtRunStart = this.profile.highScore;
    this.currentRunNewRecord = false;
    this.newlyUnlocked = [];
    const unlockables: CosmeticId[] = ['electric', 'gold', 'trail', 'pulse'];
    this.lockedAtRunStart = new Set(unlockables.filter((id) => !this.profile.isUnlocked(id)));
    this.lastPersistedSecond = 0;
    this.trailAccumulator = 0;
    this.avatarHurtRemaining = 0;
    this.avatarCelebrateRemaining = 0;
    this.avatarRespawnRemaining = 0;
    this.playerAvatar.setVisible(true).setAlpha(1).setDisplaySize(BALANCE.player.displaySize, BALANCE.player.displaySize).setRotation(0);
    this.lastHudState = '';
    this.runCounter += 1;
    const runId = this.makeRunId();
    const runSeed = seed ?? ((Math.floor(Math.random() * 0x7fffffff) ^ this.runCounter) >>> 0);
    this.simulation.setCosmetic(this.profile.equippedCosmetic);
    this.setMode('playing');
    this.simulation.start(runSeed || 1, runId, !this.profile.tutorialSeen);
    for (const target of this.simulation.targets) target.sprite.setVisible(true);
    // Arcade actor owns the collision circle only. A separate presentation sprite
    // can bob, squash and change expression without moving or resizing the hitbox.
    this.simulation.player.setVisible(false);
    if (!this.profile.tutorialSeen) this.profile.markTutorialSeen();
    this.bridge.startGameplay();
    void this.audio.unlock();
    this.audio.setInterrupted(false);
    this.audio.playMusic();
    this.updateHud();
  }

  private completeRun(event: Extract<SimEvent, { type: 'game-over' }>): void {
    this.clearTransientEffects();
    this.playerAvatar.setVisible(false);
    this.shieldAura.setVisible(false).clear();
    this.physics.world.pause();
    this.controls.setActive(false);
    this.bridge.stopGameplay();
    this.audio.stopMusic();
    this.audio.play('end');
    const prior = this.profile.get();
    this.profile.completeRun(event.runId, event.score, event.survivalSeconds, event.peakMultiplier);
    this.currentRunNewRecord = event.score > this.recordAtRunStart;
    this.newlyUnlocked = (['electric', 'gold', 'trail', 'pulse'] as CosmeticId[])
      .filter((id) => this.lockedAtRunStart.has(id) && this.profile.isUnlocked(id));
    this.setMode('results');
    this.hud.setVisible(false);
    this.showResults(event, prior.highScore);
  }

  private showResults(event: Extract<SimEvent, { type: 'game-over' }>, oldHighScore: number, celebrate = true): void {
    this.lastRunResult = event;
    this.previousHighScore = oldHighScore;
    this.clearOverlay();
    this.addScrim(0.76);
    this.addPanel(480, 270, 500, 410);
    this.addOverlayText(480, 112, this.currentRunNewRecord ? 'NEW PERSONAL BEST!' : 'RUN COMPLETE', this.currentRunNewRecord ? 26 : 24, this.currentRunNewRecord ? '#ffd576' : '#f3f6ff', true, 2);
    this.addOverlayText(480, 174, event.score.toLocaleString(), 52, '#ffffff', true, 3);
    this.addOverlayText(480, 214, 'POINTS', 11, '#a9bad8', true, 1);
    const minutes = Math.floor(event.survivalSeconds / 60);
    const seconds = Math.floor(event.survivalSeconds % 60);
    this.addOverlayText(480, 258, `SURVIVED  ${minutes}:${String(seconds).padStart(2, '0')}     ·     BEST  ${Math.max(oldHighScore, event.score).toLocaleString()}`, 13, '#d0dcf2', true, 1);
    this.addOverlayText(480, 288, `${event.coinsCollected} PROGRESS COINS     ·     PEAK COMBO  x${event.peakMultiplier}`, 12, '#d2def2', true, 1);
    if (this.newlyUnlocked.length > 0) {
      this.addOverlayText(480, 319, `UNLOCKED  ${this.newlyUnlocked.map((id) => COSMETIC_INFO[id].name).join('  ·  ')}`, 12, '#86f2db', true, 1);
    }
    this.addOverlayText(480, 302, `GOALS ${event.goalsCompleted}/3    ·    OVERDRIVE ${event.overdriveActivations}    ·    DEFLECT ${event.deflections}`, 11, '#d0c6f2', true, 1);
    this.addButton(this.overlay, 480, 369, 250, 52, 'TRY AGAIN', () => { void this.returnThroughBreak('restart'); }, { primary: true });
    this.addButton(this.overlay, 480, 429, 185, 38, 'MAIN MENU', () => this.showMenu(), { small: true, muted: true, labelSize: 12 });
    if (!this.profile.storageIsAvailable) this.addStorageWarning(467);
    this.addMuteButton(662, 443);
    this.enterOverlay();
    if (this.currentRunNewRecord && celebrate) this.audio.play('record');
  }

  private showCosmetics(from: 'menu' | 'paused'): void {
    const rebuilding = this.mode === 'cosmetics';
    if (from === 'paused') {
      if (this.mode !== 'paused' && !rebuilding) return;
    } else if (this.mode !== 'menu' && !rebuilding) return;
    this.cosmeticsFrom = from;
    this.setMode('cosmetics');
    this.clearOverlay();
    this.addScrim(0.87);
    this.addPanel(480, 270, 590, 460);
    const profile = this.profile.get();
    this.addOverlayText(480, 71, 'MAGNET LAB', 28, '#f3f7ff', true, 1);
    this.addOverlayText(480, 102, `COSMETIC COLLECTION  ·  ${profile.coins} PROGRESS COINS`, 11, '#a9bad3', true, 0);
    const cosmetics: CosmeticId[] = ['classic', 'electric', 'gold', 'trail', 'pulse'];
    cosmetics.forEach((id, index) => {
      const y = 151 + index * 64;
      const unlocked = this.profile.isUnlocked(id);
      const equipped = profile.equipped === id;
      const row = this.add.graphics();
      row.fillStyle(equipped ? 0x17394a : 0x1a2a48, equipped ? 0.94 : 0.78)
        .fillRoundedRect(228, y - 29, 504, 58, 14);
      row.lineStyle(1, equipped ? 0x66e7db : unlocked ? 0x7892c0 : 0x596b8d, equipped ? 0.7 : 0.34)
        .strokeRoundedRect(228, y - 29, 504, 58, 14);
      row.fillStyle(0x09152a, 0.88).fillRoundedRect(236, y - 22, 48, 44, 12);
      row.lineStyle(1, 0x9db8e4, 0.22).strokeRoundedRect(236, y - 22, 48, 44, 12);
      this.overlay.add(row);
      this.addCosmeticPreview(id, 260, y);

      const progress = this.cosmeticUnlockProgress(id, profile, unlocked);
      this.addOverlayText(296, y - 14, COSMETIC_INFO[id].name, 13, unlocked ? '#f4f7ff' : '#c0cbe0', true, 0, 'left');
      this.addOverlayText(296, y + 2, COSMETIC_INFO[id].detail, 10, '#c0cde4', false, 0, 'left');
      this.addOverlayText(296, y + 18, progress, 9, unlocked ? '#75e7d8' : '#9aaccb', true, 0, 'left');
      this.addButton(this.overlay, 664, y, 130, 36, equipped ? 'EQUIPPED' : unlocked ? 'EQUIP' : 'LOCKED', () => {
        if (!unlocked || !this.profile.equip(id)) return;
        this.simulation.setCosmetic(id);
        this.audio.play('click');
        this.showCosmetics(from);
      }, { small: true, muted: !unlocked, labelSize: 10 });
    });
    if (!this.profile.storageIsAvailable) this.addStorageWarning(443);
    this.addButton(this.overlay, 480, 472, 180, 38, from === 'paused' ? 'BACK TO PAUSE' : 'BACK', () => {
      if (from === 'paused') { this.setMode('paused'); this.showPause(); } else this.showMenu();
    }, { small: true });
    this.enterOverlay();
  }

  private cosmeticUnlockProgress(id: CosmeticId, profile: ReturnType<ProfileStore['get']>, unlocked: boolean): string {
    if (id === 'classic') return 'AVAILABLE FROM START';
    const value = id === 'electric' ? profile.coins
      : id === 'gold' ? Math.floor(profile.stats.longestRunSeconds)
        : id === 'trail' ? profile.stats.bestMultiplier
          : profile.stats.targetHits;
    const goal = id === 'electric' ? BALANCE.cosmetics.electricCoins
      : id === 'gold' ? BALANCE.cosmetics.goldSurvivalSeconds
        : id === 'trail' ? 5
          : BALANCE.cosmetics.targetHits;
    const current = Math.min(value, goal);
    const progress = id === 'trail' ? `x${current}/x${goal} BEST COMBO`
      : id === 'gold' ? `${current}/${goal} SEC IN ONE RUN`
        : id === 'pulse' ? `${current}/${goal} TARGETS HIT`
          : `${current}/${goal} COINS`;
    return unlocked ? `UNLOCKED  ·  ${progress}` : `UNLOCK AT  ·  ${progress}`;
  }

  private addCosmeticPreview(id: CosmeticId, x: number, y: number): void {
    if (id === 'classic' || id === 'electric' || id === 'gold') {
      this.overlay.add(this.add.image(x, y, magnetTextureKey(id)).setDisplaySize(50, 50));
      return;
    }

    const effect = this.add.graphics();
    if (id === 'trail') {
      effect.lineStyle(2.5, 0x66eaff, 0.3).lineBetween(x - 17, y - 5, x - 3, y - 5);
      effect.lineStyle(2, 0x80f5ff, 0.52).lineBetween(x - 14, y + 4, x + 1, y + 4);
      effect.lineStyle(1.5, 0xb5fbff, 0.78).lineBetween(x - 10, y + 12, x + 3, y + 12);
      effect.fillStyle(0x8ff5ff, 0.82).fillCircle(x - 13, y - 12, 2);
      effect.fillStyle(0xd9ffff, 0.9).fillCircle(x - 7, y + 13, 1.6);
      this.overlay.add(effect);
      this.overlay.add(this.add.image(x + 8, y, 'item-crystal').setDisplaySize(27, 27));
      this.overlay.add(this.add.image(x - 12, y - 14, 'spark').setDisplaySize(10, 10));
      return;
    }

    effect.lineStyle(2, 0x79edff, 0.24).strokeCircle(x, y, 20);
    effect.lineStyle(2, 0x91f3ff, 0.48).strokeCircle(x, y, 14);
    effect.lineStyle(1.5, 0xd5ffff, 0.76).strokeCircle(x, y, 8);
    this.overlay.add(effect);
    this.overlay.add(this.add.image(x, y, 'spark').setDisplaySize(18, 18));
  }

  private addMuteButton(x: number, y: number): void {
    const label = this.profile.muted ? 'SOUND OFF' : 'SOUND ON';
    this.addButton(this.overlay, x, y, 96, 34, label, () => {
      const muted = !this.profile.muted;
      this.profile.setMuted(muted);
      this.audio.setMuted(muted);
      this.audio.play('click');
      if (this.mode === 'menu') this.showMenu();
      else if (this.mode === 'instructions') this.showInstructions();
      else if (this.mode === 'paused') this.showPause();
      else if (this.mode === 'results') this.showResultsFromProfile();
    }, { small: true, labelSize: 10 });
  }

  private showResultsFromProfile(): void {
    // The final panel is already present; refresh only the sound control by rebuilding
    // it from the latest profile while preserving the run summary.
    if (this.mode !== 'results') return;
    const text = this.profile.muted ? 'SOUND OFF' : 'SOUND ON';
    const existing = this.overlay.list.find((item) => item instanceof Phaser.GameObjects.Container && item.getData('mute-control')) as Phaser.GameObjects.Container | undefined;
    if (existing) {
      const label = existing.list.find((item) => item instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      label?.setText(text);
    }
  }

  private addScrim(alpha = 0.78): void {
    const scrim = this.add.graphics();
    scrim.fillStyle(0x050a18, alpha).fillRect(-this.overlay.x, -this.overlay.y, this.layout.width, this.layout.height);
    this.overlay.add(scrim);
  }

  private addPanel(x: number, y: number, width: number, height: number): void {
    const panel = this.add.graphics();
    width = Math.min(width, this.layout.width - 24);
    height = Math.min(height, this.layout.height - 24);
    panel.fillStyle(0x142342, 0.985).fillRoundedRect(x - width / 2, y - height / 2, width, height, 24);
    panel.lineStyle(2, 0x9bbaff, 0.72).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 24);
    panel.lineStyle(1, 0x74e7f3, 0.3).strokeRoundedRect(x - width / 2 + 5, y - height / 2 + 5, width - 10, height - 10, 20);
    this.overlay.add(panel);
  }

  private addOverlayText(
    x: number,
    y: number,
    value: string,
    size: number,
    color: string,
    bold: boolean,
    stroke = 0,
    align: 'left' | 'center' = 'center',
  ): Phaser.GameObjects.Text {
    const text = this.add.text(x, y, value, {
      fontFamily: 'Arial, sans-serif', fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal',
      color, align, stroke: '#071021', strokeThickness: stroke, resolution: this.uiTextResolution(),
    }).setOrigin(align === 'left' ? 0 : 0.5, 0.5);
    this.overlay.add(text);
    return text;
  }

  private addButton(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: () => void,
    options: { primary?: boolean; small?: boolean; muted?: boolean; labelSize?: number } = {},
  ): Phaser.GameObjects.Container {
    const button = this.add.container(x, y).setSize(width, height);
    const background = this.add.graphics();
    const render = (hover: boolean, pressed = false): void => {
      background.clear();
      if (options.primary) {
        background.fillStyle(hover ? 0x75f0f3 : 0x4dcbd9, pressed ? 0.86 : 1).fillRoundedRect(-width / 2, -height / 2, width, height, 16);
        background.lineStyle(1, 0xc8ffff, 0.78).strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
        background.fillStyle(0xffffff, 0.12).fillRoundedRect(-width / 2 + 5, -height / 2 + 4, width - 10, height * 0.37, 10);
      } else {
        const fill = options.muted ? 0x34415e : options.small ? 0x1d2b49 : 0x203553;
        background.fillStyle(hover ? fill + 0x070707 : fill, options.muted ? 0.68 : 0.94).fillRoundedRect(-width / 2, -height / 2, width, height, options.small ? 11 : 14);
        background.lineStyle(1, hover ? 0x8edbe9 : 0x7289b5, hover ? 0.72 : 0.42).strokeRoundedRect(-width / 2, -height / 2, width, height, options.small ? 11 : 14);
      }
    };
    render(false);
    const text = this.add.text(0, 0, label, {
      fontFamily: 'Arial, sans-serif', fontSize: `${options.labelSize ?? (options.small ? 11 : 16)}px`, fontStyle: 'bold',
      color: options.primary ? '#061c2c' : options.muted ? '#aab8d0' : '#eaf2ff', align: 'center', letterSpacing: options.primary ? 1.3 : 0.4,
      resolution: this.uiTextResolution(),
    }).setOrigin(0.5);
    button.add([background, text]);
    button.setInteractive({ useHandCursor: true });
    if (this.layout?.portrait && parent !== this.hud) button.setScale(1.5);
    button.on('pointerover', () => render(true));
    button.on('pointerout', () => render(false));
    button.on('pointerdown', () => {
      render(true, true);
      this.audio.play('click');
      action();
    });
    button.on('pointerup', () => render(true));
    if (label === 'SOUND ON' || label === 'SOUND OFF') button.setData('mute-control', true);
    parent.add(button);
    if (parent === this.hud) this.pauseButton = button;
    return button;
  }

  private uiTextResolution(): number {
    const canvas = this.game.canvas;
    const displayScale = Math.max(canvas.clientWidth / this.layout.width, canvas.clientHeight / this.layout.height, 1);
    return Phaser.Math.Clamp(displayScale * (window.devicePixelRatio || 1), 1, 3);
  }

  private enterOverlay(): void {
    this.overlay.setAlpha(0);
    const tween = this.tweens.add({ targets: this.overlay, alpha: 1, duration: 190, ease: 'Sine.Out' });
    this.overlayTweens.push(tween);
  }

  private clearOverlay(): void {
    for (const tween of this.overlayTweens) tween.stop();
    this.overlayTweens.length = 0;
    for (const child of [...this.overlay.list]) child.destroy();
    this.overlay.removeAll(false);
  }

  private setMode(mode: ScreenMode): void {
    this.mode = mode;
    if (mode !== 'playing') this.motionFeedback?.clear();
    this.game.registry.set('magnet-mode', mode);
  }

  private onSimulationEvent(event: SimEvent): void {
    switch (event.type) {
      case 'collect': {
        if (event.kind !== 'gift') this.audio.play(event.kind, event.multiplier);
        const comboMilestone = event.streak > 0 && event.streak % BALANCE.scoring.objectsPerMultiplier === 0;
        if (comboMilestone) {
          this.audio.play('combo');
          this.avatarCelebrateRemaining = 0.46;
          this.popText(this.comboLabel);
        }
        const color = event.kind === 'coin' ? '#ffdc82'
          : event.kind === 'crystal' ? '#8beeff'
            : event.kind === 'battery' ? '#91ffd3'
              : event.kind === 'gift' ? '#ffe49b' : '#9bffe4';
        const burstCount = event.kind === 'coin' ? 12 : event.kind === 'crystal' ? 16 : event.kind === 'gift' ? 14 : 10;
        const ringColor = event.kind === 'coin' ? 0xffd36b : event.kind === 'crystal' ? 0x6feeff : event.kind === 'gift' ? 0xffd879 : 0x85ffd0;
        this.burst(event.x, event.y, burstCount, color);
        this.collectionRing(event.x, event.y, ringColor);
        if (event.points > 0) this.popText(this.scoreLabel);
        if (event.points > 0) this.floatingText(event.x, event.y - 12, `+${event.points}${event.multiplier > 1 ? `  x${event.multiplier}` : ''}`, color);
        if (comboMilestone) this.floatingText(event.x, event.y - 35, `x${event.multiplier} COMBO!`, '#ffe08d');
        if (event.kind === 'coin') this.profile.addCoin();
        if (event.kind === 'crystal') this.profile.addCrystal();
        this.profile.recordAchievements(this.simulation.state.simTime, event.multiplier);
        break;
      }
      case 'gift-reward': {
        this.audio.play('gift');
        this.avatarCelebrateRemaining = 0.82;
        const rewardTitle = event.reward === 'hearts'
          ? `+${event.hearts} ${event.hearts === 1 ? 'HEART' : 'HEARTS'}`
          : event.reward === 'shield' ? 'BOMB SHIELD' : 'OVERDRIVE +5s';
        const rewardDetail = event.reward === 'hearts'
          ? 'RESTORES LOST HEALTH'
          : event.reward === 'shield' ? 'BLOCKS THE NEXT BOMB' : '2X PICKUP SCORE / STRONGER MAGNET / HALF REPEL COST';
        const color = event.reward === 'hearts' ? '#ff9cad' : event.reward === 'shield' ? '#9effe1' : '#e2b7ff';
        this.burst(event.x, event.y, event.reward === 'hearts' && event.hearts === 2 ? 22 : 16, color);
        this.collectionRing(event.x, event.y, event.reward === 'hearts' ? 0xff718f : event.reward === 'shield' ? 0x7bffe0 : 0xc697ff);
        this.floatingText(event.x, event.y - 36, rewardTitle, color, 13);
        this.floatingText(event.x, event.y - 19, rewardDetail, color, 10);
        if (event.reward === 'hearts' && event.hearts === 2) this.cameras.main.shake(130, 0.0016);
        break;
      }
      case 'target':
        this.audio.play('target'); this.profile.addTargetHit(); this.burst(event.x, event.y, event.golden ? 16 : 10, event.golden ? '#ffe08a' : '#ff977d');
        this.collectionRing(event.x, event.y, event.golden ? 0xffd36b : 0xff7c83);
        this.avatarCelebrateRemaining = 0.48;
        this.cameras.main.shake(event.golden ? 110 : 85, event.golden ? 0.002 : 0.0014);
        this.floatingText(event.x, event.y - 15, `+${event.points}${event.golden ? '  GOLD!' : ''}`, event.golden ? '#ffe08a' : '#ffd481');
        break;
      case 'golden-target':
        this.audio.play('target');
        this.collectionRing(event.x, event.y, 0xffd36b);
        this.floatingText(event.x, event.y + 48, 'GOLD TARGET  +100', '#ffe08a');
        break;
      case 'overdrive':
        this.audio.play('overdrive');
        this.collectionRing(event.x, event.y, 0xb990ff);
        this.burst(event.x, event.y, 16, '#d9b7ff');
        this.pulseRing(event.x, event.y);
        this.floatingText(event.x, event.y - 40, 'OVERDRIVE!', '#e3c1ff');
        break;
      case 'goal':
        this.audio.play('goal');
        this.burst(event.x, event.y, 12, '#b9f6dd');
        this.collectionRing(event.x, event.y, 0x83f2ce);
        this.floatingText(event.x, event.y - 32, `GOAL ${event.number}  +${event.points}`, '#aaffdf');
        break;
      case 'damage':
        if (event.shieldConsumed) {
          this.avatarHurtRemaining = 0.34;
          this.audio.play('shield');
          this.shieldShatter(event.x, event.y);
          this.burst(event.x, event.y, 13, '#8effe4');
          this.collectionRing(event.x, event.y, 0x8effe4);
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.cameras.main.shake(100, 0.0028);
          this.cameras.main.flash(80, 128, 255, 220, false);
        } else {
          this.avatarHurtRemaining = 0.76;
          this.avatarRespawnRemaining = BALANCE.player.magnetReplacementSeconds;
          this.playerAvatar.setVisible(false);
          this.audio.play('explosion');
          this.magnetExplosion(event.x, event.y);
          this.cameras.main.flash(130, 255, 161, 100, false);
        }
        break;
      case 'energy-empty': this.audio.play('empty'); this.floatingText(event.x, event.y - 44, 'ENERGY LOW', '#ff987e'); break;
      case 'repulse-pulse': this.audio.play('repel'); this.pulseRing(event.x, event.y); break;
      case 'spawn':
        if (event.kind === 'bomb' && event.warning) this.warningMarker(event.x, event.y, event.launchX, event.launchY);
        break;
      case 'tutorial':
        if (event.step === 'complete') this.burst(this.simulation.player.x, this.simulation.player.y, 7, '#7df6f5');
        break;
      case 'game-over': this.completeRun(event); break;
      case 'new-run': break;
    }
  }

  private burst(x: number, y: number, count: number, color: string): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + ((this.effectCounter++ % 5) - 2) * 0.04;
      const distance = 24 + (index % 3) * 9;
      this.spark(x, y, 0.52 + (index % 3) * 0.13, color, Math.cos(angle) * distance, Math.sin(angle) * distance);
    }
  }

  private magnetExplosion(x: number, y: number): void {
    const flash = this.add.graphics().setPosition(x, y).setDepth(27).setScale(0.35);
    flash.fillStyle(0xff684f, 0.64).fillCircle(0, 0, 31);
    flash.fillStyle(0xffb45f, 0.88).fillCircle(0, 0, 21);
    flash.fillStyle(0xfff5ce, 0.98).fillCircle(0, 0, 9);
    const flashTween = this.tweens.add({
      targets: flash, scale: 3.2, alpha: 0, duration: 330, ease: 'Cubic.Out', onComplete: () => flash.destroy(),
    });
    this.trackTransient(flash, flashTween);

    const shockwave = this.add.graphics().setPosition(x, y).setDepth(26).setScale(0.55);
    shockwave.lineStyle(4, 0xffe7a6, 0.95).strokeCircle(0, 0, 20);
    shockwave.lineStyle(2, 0xff815e, 0.84).strokeCircle(0, 0, 29);
    const waveTween = this.tweens.add({
      targets: shockwave, scale: 3.8, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => shockwave.destroy(),
    });
    this.trackTransient(shockwave, waveTween);

    const smoke = this.add.container(x, y).setDepth(25).setScale(0.5);
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      const distance = 8 + (index % 3) * 4;
      const radius = 10 + (index % 4) * 2;
      const puff = this.add.circle(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        radius,
        index % 2 === 0 ? 0x34445e : 0x55475f,
        0.58,
      );
      smoke.add(puff);
    }
    const smokeTween = this.tweens.add({
      targets: smoke, scale: 2.8, alpha: 0, duration: 640, ease: 'Sine.Out', onComplete: () => smoke.destroy(),
    });
    this.trackTransient(smoke, smokeTween);

    const colors = ['#fff4cc', '#ffd06f', '#ff875d', '#ff637d', '#c5faff'];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sparkCount = reducedMotion ? 12 : this.particles.length;
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = (Math.PI * 2 * index) / sparkCount + ((this.effectCounter++ % 5) - 2) * 0.035;
      const distance = 48 + (index % 4) * 18;
      this.spark(
        x,
        y,
        0.8 + (index % 3) * 0.18,
        colors[index % colors.length]!,
        Math.cos(angle) * distance,
        Math.sin(angle) * distance - 8,
      );
    }
    if (!reducedMotion) this.cameras.main.shake(220, 0.006);
  }

  private collectionRing(x: number, y: number, color: number): void {
    const ring = this.add.graphics().setPosition(x, y).setDepth(21);
    ring.lineStyle(2.2, color, 0.8).strokeCircle(0, 0, 11);
    ring.lineStyle(1, 0xffffff, 0.62).strokeCircle(0, 0, 6);
    const tween = this.tweens.add({ targets: ring, scale: 2.5, alpha: 0, duration: 340, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    this.trackTransient(ring, tween);
  }

  private popText(text: Phaser.GameObjects.Text): void {
    this.tweens.killTweensOf(text);
    text.setScale(1);
    const tween = this.tweens.add({ targets: text, scale: 1.16, duration: 90, yoyo: true, ease: 'Back.Out' });
    tween.once('complete', () => text.setScale(1));
  }

  private spark(x: number, y: number, scale: number, tint: string, dx = 0, dy = -20): void {
    const sprite = this.particles.find((candidate) => !candidate.active) ?? this.particles[0];
    if (!sprite) return;
    const previous = this.particleTweens.get(sprite);
    previous?.stop();
    sprite.setActive(true).setVisible(true).setPosition(x, y).setAlpha(0.9).setScale(scale).setTint(Phaser.Display.Color.HexStringToColor(tint).color);
    const tween = this.tweens.add({
      targets: sprite, x: x + dx, y: y + dy, alpha: 0, scale: 0.06, duration: 380 + (this.effectCounter % 5) * 45,
      ease: 'Cubic.Out', onComplete: () => { sprite.setActive(false).setVisible(false); this.particleTweens.delete(sprite); },
    });
    this.particleTweens.set(sprite, tween);
  }

  private floatingText(x: number, y: number, value: string, color: string, fontSize = 14): void {
    const text = this.add.text(x, y, value, {
      fontFamily: 'Arial, sans-serif', fontSize: `${fontSize}px`, fontStyle: 'bold', color,
      stroke: '#071021', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(85);
    const tween = this.tweens.add({ targets: text, y: y - 28, alpha: 0, scale: 1.08, duration: 650, ease: 'Sine.Out', onComplete: () => text.destroy() });
    this.trackTransient(text, tween);
  }

  private pulseRing(x: number, y: number): void {
    const ring = this.add.graphics().setPosition(x, y).setDepth(40);
    const pulseSkin = this.profile.equippedCosmetic === 'pulse';
    ring.lineStyle(pulseSkin ? 4 : 3, pulseSkin ? 0x8defff : 0xffa36d, 0.78);
    ring.strokeCircle(0, 0, 28);
    ring.lineStyle(1, 0xf7fbff, 0.48).strokeCircle(0, 0, 18);
    const tween = this.tweens.add({ targets: ring, scale: pulseSkin ? 4.3 : 3.6, alpha: 0, duration: 460, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    this.trackTransient(ring, tween);
  }

  private warningMarker(x: number, y: number, launchX: number, launchY: number): void {
    const warning = this.add.graphics().setPosition(x, y).setDepth(70);
    warning.lineStyle(2.2, 0xff657d, 0.9).strokeCircle(0, 0, 26);
    warning.lineStyle(1, 0xffd8b0, 0.7).strokeCircle(0, 0, 33);
    const length = Math.max(1, Math.hypot(launchX, launchY));
    const dx = launchX / length;
    const dy = launchY / length;
    warning.lineStyle(2, 0xffa098, 0.82).lineBetween(dx * 18, dy * 18, dx * 51, dy * 51)
      .lineBetween(dx * 51, dy * 51, dx * 42 - dy * 5, dy * 42 + dx * 5)
      .lineBetween(dx * 51, dy * 51, dx * 42 + dy * 5, dy * 42 - dx * 5);
    warning.fillStyle(0xff657d, 0.88).fillCircle(0, -39, 9);
    const icon = this.add.text(x, y - 39, '!', { fontFamily: 'Arial', fontSize: '12px', fontStyle: 'bold', color: '#2b1020' }).setOrigin(0.5).setDepth(71);
    const tween = this.tweens.add({ targets: [warning, icon], alpha: { from: 0.55, to: 1 }, scale: { from: 0.8, to: 1.08 }, duration: BALANCE.objects.bomb.warning * 1000, onComplete: () => { warning.destroy(); icon.destroy(); } });
    this.trackTransient(warning, tween);
    this.trackTransient(icon, tween);
  }

  private trackTransient(object: Phaser.GameObjects.GameObject, tween: Phaser.Tweens.Tween): void {
    this.transientObjects.add(object);
    this.transientTweens.set(object, tween);
    tween.once('complete', () => {
      this.transientObjects.delete(object);
      this.transientTweens.delete(object);
    });
  }

  private clearTransientEffects(): void {
    for (const tween of new Set(this.transientTweens.values())) tween.stop();
    for (const object of this.transientObjects) object.destroy();
    this.transientObjects.clear();
    this.transientTweens.clear();
    for (const tween of this.particleTweens.values()) tween.stop();
    this.particleTweens.clear();
    for (const particle of this.particles) particle.setActive(false).setVisible(false).setAlpha(0);
  }

  private handleFocusLoss(): void {
    if (this.mode === 'playing') this.pauseGame();
    else if (this.mode === 'ad') this.focusBlocked = true;
  }

  private makeRunId(): string {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${this.runCounter.toString(36)}`;
    return `${id}-${this.runCounter}`;
  }

  private onShutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.controls?.destroy();
    this.simulation?.destroy();
    this.audio.dispose();
    for (const tween of this.overlayTweens) tween.stop();
    this.clearTransientEffects();
    this.tweens.killAll();
  }
}
