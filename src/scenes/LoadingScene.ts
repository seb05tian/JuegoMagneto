import Phaser from 'phaser';
import { createGameArt } from '../game/art';

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoadingScene' });
  }

  create(): void {
    // All artwork is generated locally; transitioning out of this scene lets the
    // official Poki plugin report gameLoadingFinished at the correct lifecycle point.
    createGameArt(this.textures);
    this.scene.start('GameScene');
  }
}
