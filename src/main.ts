import Phaser from 'phaser';
import { PokiPlugin } from '@poki/phaser-3';
import { GAME } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { LoadingScene } from './scenes/LoadingScene';
import { layoutForViewport } from './game/layout';
import './style.css';

const initialLayout = layoutForViewport(window.innerWidth, window.innerHeight);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: initialLayout.width,
  height: initialLayout.height,
  backgroundColor: GAME.colors.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialLayout.width,
    height: initialLayout.height,
    expandParent: false,
  },
  input: {
    activePointers: 3,
    mouse: true,
    touch: true,
    keyboard: true,
  },
  disableContextMenu: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      fps: GAME.physicsFps,
      fixedStep: true,
      customUpdate: true,
      overlapBias: 4,
      forceX: false,
      debug: false,
    },
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    transparent: false,
    powerPreference: 'high-performance',
  },
  scene: [LoadingScene, GameScene],
  plugins: {
    global: import.meta.env.DEV
      ? []
      : [{ key: 'poki', plugin: PokiPlugin, start: true, data: { loadingSceneKey: 'LoadingScene', autoCommercialBreak: false } }],
  },
  banner: false,
};

const game = new Phaser.Game(config);

let resizeFrame = 0;
const resizeGame = (): void => {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    const layout = layoutForViewport(window.innerWidth, window.innerHeight);
    if (game.scale.gameSize.width !== layout.width || game.scale.gameSize.height !== layout.height) {
      game.scale.setGameSize(layout.width, layout.height);
    }
  });
};
window.addEventListener('resize', resizeGame, { passive: true });
window.visualViewport?.addEventListener('resize', resizeGame, { passive: true });
game.events.once(Phaser.Core.Events.DESTROY, () => {
  window.removeEventListener('resize', resizeGame);
  window.visualViewport?.removeEventListener('resize', resizeGame);
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
});

if (import.meta.env.DEV) {
  Object.assign(window, { __MAGNET_GAME__: game });
}
