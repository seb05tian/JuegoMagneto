import Phaser from 'phaser';
import { GAME } from '../config/gameConfig';
import { touchControlLayout, type ArenaLayout } from '../game/layout';

type PointerRole = 'move' | 'repel';

export class TouchControls {
  isTouchDevice: boolean;
  private readonly scene: Phaser.Scene;
  private readonly pointerRoles = new Map<number, PointerRole>();
  private readonly visual: Phaser.GameObjects.Graphics;
  private readonly moveLabel: Phaser.GameObjects.Text;
  private readonly repelLabel: Phaser.GameObjects.Text;
  private joystickPointer: number | null = null;
  private joystickX = 0;
  private joystickY = 0;
  private active = true;
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key | undefined>;
  private layout: ArenaLayout;
  private positions: ReturnType<typeof touchControlLayout>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.isTouchDevice = this.detectTouchDevice();
    this.keys = this.createKeys();
    const width = scene.scale.gameSize.width;
    const height = scene.scale.gameSize.height;
    this.layout = {
      width, height, portrait: height > width,
      hudBottom: height > width ? 108 : GAME.hudTopPanelBottom,
      arenaTop: height > width ? 116 : GAME.arenaTop,
      worldBottom: height > width ? height - 188 : height,
    };
    this.positions = touchControlLayout(this.layout);
    this.visual = scene.add.graphics().setDepth(90).setScrollFactor(0);
    this.visual.setVisible(this.isTouchDevice);
    this.moveLabel = scene.add.text(this.positions.joystickX, this.positions.labelY, 'MOVE', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#c4d8fa',
      stroke: '#071021', strokeThickness: 2, letterSpacing: 1,
    }).setOrigin(0.5).setDepth(91).setScrollFactor(0).setVisible(this.isTouchDevice);
    this.repelLabel = scene.add.text(this.positions.repelX, this.positions.labelY, 'HOLD TO PUSH', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', fontStyle: 'bold', color: '#ffd0b1',
      stroke: '#071021', strokeThickness: 2, letterSpacing: 0.6,
    }).setOrigin(0.5).setDepth(91).setScrollFactor(0).setVisible(this.isTouchDevice);
    if (this.isTouchDevice) this.drawControls();
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('pointerupoutside', this.onPointerUp, this);
    scene.input.on('gameout', this.reset, this);
  }

  getMovement(): { x: number; y: number } {
    if (!this.active) return { x: 0, y: 0 };
    const left = this.keys.left?.isDown || this.keys.a?.isDown || false;
    const right = this.keys.right?.isDown || this.keys.d?.isDown || false;
    const up = this.keys.up?.isDown || this.keys.w?.isDown || false;
    const down = this.keys.down?.isDown || this.keys.s?.isDown || false;
    let x = Number(right) - Number(left) + this.joystickX;
    let y = Number(down) - Number(up) + this.joystickY;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y };
  }

  get isRepelling(): boolean {
    if (!this.active) return false;
    if (this.keys.space?.isDown) return true;
    for (const role of this.pointerRoles.values()) if (role === 'repel') return true;
    return false;
  }

  consumePausePress(): boolean {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return false;
    return Boolean(
      (this.keys.escape && Phaser.Input.Keyboard.JustDown(this.keys.escape)) ||
      (this.keys.p && Phaser.Input.Keyboard.JustDown(this.keys.p)),
    );
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.reset();
    this.visual.setVisible(active && this.isTouchDevice);
    this.moveLabel.setVisible(active && this.isTouchDevice);
    this.repelLabel.setVisible(active && this.isTouchDevice);
  }

  setLayout(layout: ArenaLayout): void {
    this.refreshDeviceDetection();
    this.layout = layout;
    this.positions = touchControlLayout(layout);
    this.moveLabel.setPosition(this.positions.joystickX, this.positions.labelY);
    this.repelLabel.setPosition(this.positions.repelX, this.positions.labelY);
    this.moveLabel.setFontSize(layout.portrait ? 14 : 10);
    this.repelLabel.setFontSize(layout.portrait ? 14 : 10);
    this.reset();
    this.syncVisibility();
  }

  refreshDeviceDetection(): boolean {
    const detected = this.detectTouchDevice();
    if (detected === this.isTouchDevice) return false;
    this.isTouchDevice = detected;
    this.syncVisibility();
    return true;
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    this.scene.input.off('gameout', this.reset, this);
    this.visual.destroy();
    this.moveLabel.destroy();
    this.repelLabel.destroy();
    this.pointerRoles.clear();
  }

  private createKeys(): Record<string, Phaser.Input.Keyboard.Key | undefined> {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return {};
    const cursors = keyboard.createCursorKeys();
    const wasd = keyboard.addKeys('W,A,S,D,P') as Record<string, Phaser.Input.Keyboard.Key>;
    return {
      left: cursors.left,
      right: cursors.right,
      up: cursors.up,
      down: cursors.down,
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      escape: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      a: wasd.A,
      d: wasd.D,
      w: wasd.W,
      s: wasd.S,
      p: wasd.P,
    };
  }

  private detectTouchDevice(): boolean {
    const userAgent = navigator.userAgent;
    const touchPoints = navigator.maxTouchPoints ?? 0;
    const handheld = /Android|iPhone|iPad|iPod|Mobile|Tablet|Windows Phone/i.test(userAgent);
    const iPadDesktopMode = /Macintosh/i.test(userAgent) && touchPoints > 1;
    const touchFirstDevice = touchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;

    // `ontouchstart` can exist in desktop Chromium even when the device has no
    // touch screen. Use device identity or a real coarse touch pointer instead.
    return handheld || iPadDesktopMode || touchFirstDevice;
  }

  private syncVisibility(): void {
    const visible = this.active && this.isTouchDevice;
    this.visual.setVisible(visible);
    this.moveLabel.setVisible(visible);
    this.repelLabel.setVisible(visible);
    if (this.isTouchDevice) this.drawControls();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch && !this.isTouchDevice) {
      this.isTouchDevice = true;
      this.syncVisibility();
    }
    if (!this.active || !this.isTouchDevice || this.pointerRoles.has(pointer.id)) return;
    const { x, y } = pointer;
    if (Phaser.Math.Distance.Between(x, y, this.positions.joystickX, this.positions.joystickY) < 95 && this.joystickPointer === null) {
      this.pointerRoles.set(pointer.id, 'move');
      this.joystickPointer = pointer.id;
      this.updateJoystick(x, y);
      return;
    }
    if (Phaser.Math.Distance.Between(x, y, this.positions.repelX, this.positions.repelY) < 88) {
      this.pointerRoles.set(pointer.id, 'repel');
      this.drawControls();
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pointerRoles.get(pointer.id) !== 'move') return;
    this.updateJoystick(pointer.x, pointer.y);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const role = this.pointerRoles.get(pointer.id);
    if (!role) return;
    this.pointerRoles.delete(pointer.id);
    if (role === 'move') {
      this.joystickPointer = null;
      this.joystickX = 0;
      this.joystickY = 0;
    }
    this.drawControls();
  }

  private updateJoystick(x: number, y: number): void {
    const dx = x - this.positions.joystickX;
    const dy = y - this.positions.joystickY;
    const distance = Math.hypot(dx, dy);
    const reach = Math.min(58, distance);
    this.joystickX = distance === 0 ? 0 : (dx / distance) * (reach / 58);
    this.joystickY = distance === 0 ? 0 : (dy / distance) * (reach / 58);
    this.drawControls();
  }

  private reset(): void {
    this.pointerRoles.clear();
    this.joystickPointer = null;
    this.joystickX = 0;
    this.joystickY = 0;
    this.drawControls();
  }

  private drawControls(): void {
    this.visual.clear();
    if (!this.isTouchDevice) return;

    const centerX = this.positions.joystickX;
    const centerY = this.positions.joystickY;
    this.visual.fillStyle(0x91a8d8, 0.08);
    this.visual.fillCircle(centerX, centerY, 68);
    this.visual.lineStyle(2, 0xb6c7ed, 0.36);
    this.visual.strokeCircle(centerX, centerY, 68);
    this.visual.lineStyle(1, 0xb6c7ed, 0.15);
    this.visual.strokeCircle(centerX, centerY, 43);
    const knobX = centerX + this.joystickX * 43;
    const knobY = centerY + this.joystickY * 43;
    this.visual.fillStyle(0xc6d8ff, 0.24);
    this.visual.fillCircle(knobX, knobY, 27);
    this.visual.lineStyle(2, 0xe2edff, 0.64);
    this.visual.strokeCircle(knobX, knobY, 27);

    const repelX = this.positions.repelX;
    const repelY = this.positions.repelY;
    let held = false;
    for (const role of this.pointerRoles.values()) if (role === 'repel') { held = true; break; }
    this.visual.fillStyle(held ? 0xff874a : 0xff874a, held ? 0.35 : 0.14);
    this.visual.fillCircle(repelX, repelY, 62);
    this.visual.lineStyle(3, held ? 0xffc39c : 0xffa879, held ? 0.95 : 0.56);
    this.visual.strokeCircle(repelX, repelY, 62);
    this.visual.lineStyle(2, 0xffc7a7, 0.65);
    this.visual.strokeCircle(repelX, repelY, 47);
    this.visual.fillStyle(0xffffff, 0.92);
    this.visual.fillCircle(repelX, repelY, 5);
    this.visual.lineStyle(2, 0xffffff, 0.75);
    this.visual.strokeCircle(centerX, centerY, 14);
  }
}
