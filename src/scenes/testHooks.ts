import Phaser from 'phaser';
import type { GameScene } from './GameScene';

declare global {
  interface Window {
    __MAGNET_TEST__?: {
      finish: () => void;
      retry: () => Promise<void>;
      start: (seed: number) => void;
      snapshot: () => Record<string, unknown>;
    };
  }
}

/** Development-only bridge used by Playwright. The production entry point never imports this module. */
export function installTestHooks(scene: GameScene): void {
  const host = scene as unknown as any;
  window.__MAGNET_TEST__ = {
    finish: () => host.simulation.finishRun(),
    retry: async () => {
      if (host.mode === 'results') await host.returnThroughBreak('restart');
      else throw new Error(`Cannot retry from ${host.mode}`);
    },
    start: (seed: number) => host.beginRun(seed),
    snapshot: () => {
      const trainer = host.simulation.entities[host.simulation.entities.length - 1];
      const geometry = (sprite: any) => {
        const body = sprite.body;
        return { x: sprite.x, y: sprite.y, centerX: body.center.x, centerY: body.center.y, radius: body.halfWidth };
      };
      const overlayTexts = host.overlay.list
        .filter((object: any) => typeof object.text === 'string')
        .map((object: any) => object.text as string);
      const instructionControls = host.overlay.list.find((object: any) =>
        typeof object.text === 'string' && object.text.includes('HOLD SPACE = PUSH'));

      return {
        mode: host.mode,
        running: host.simulation.state.running,
        simTime: host.simulation.state.simTime,
        activeEntities: host.simulation.activeEntityCount,
        totalEntities: host.simulation.entities.length,
        worldstepListeners: host.physics.world.listenerCount('worldstep'),
        stepsLastFrame: host.lastPhysicsStepCount,
        maximumStepsObserved: host.maximumStepsObserved,
        bodies: host.physics.world.bodies.entries.length + host.physics.world.staticBodies.entries.length,
        gameObjects: host.children.length,
        audioTimers: host.audio.activeTimerCount,
        energy: host.simulation.state.energy,
        layout: { ...host.layout },
        overdrive: {
          active: host.simulation.features.overdriveActive,
          charge: host.simulation.features.charge,
          remaining: host.simulation.features.overdriveRemaining,
          activations: host.simulation.features.activations,
        },
        goals: {
          completed: host.simulation.features.completedGoals,
          current: host.simulation.features.currentGoal,
          deflections: host.simulation.features.deflections,
          text: host.simulation.features.goalText(),
        },
        goldenTargetIndex: host.simulation.goldenTargetIndex,
        playerX: host.simulation.player.x,
        playerY: host.simulation.player.y,
        avatarDisplayWidth: host.playerAvatar.displayWidth,
        collisionGeometry: {
          player: geometry(host.simulation.player),
          targets: host.simulation.targets.map((target: any) => geometry(target.sprite)),
          objects: host.simulation.entities.filter((entity: any) => entity.active)
            .map((entity: any) => ({ kind: entity.kind, ...geometry(entity.sprite) })),
        },
        playerVelocity: { ...host.simulation.player.body.velocity },
        playerAcceleration: { ...host.simulation.player.body.acceleration },
        movementInput: host.controls.getMovement(),
        touchDevice: host.controls.isTouchDevice,
        worldPaused: host.physics.world.isPaused,
        score: host.simulation.state.score,
        health: host.simulation.state.health,
        tutorialActive: host.simulation.state.tutorialActive,
        tutorialStep: host.simulation.state.tutorialStep,
        tutorialText: host.tutorialLabel.text,
        storageAvailable: host.profile.storageIsAvailable,
        overlayTexts,
        instructionControls: instructionControls
          ? { text: instructionControls.text, y: instructionControls.y, height: instructionControls.height }
          : null,
        training: {
          active: trainer.active,
          x: trainer.sprite.x,
          y: trainer.sprite.y,
          velocityX: trainer.body.velocity.x,
          velocityY: trainer.body.velocity.y,
        },
        activeBombs: host.simulation.entities.filter((entity: any) => entity.active && entity.kind === 'bomb').length,
        gameplayActive: host.bridge.isGameplayActive,
        breakPending: host.bridge.isBreakPending,
        focusBlocked: host.focusBlocked,
        documentHidden: document.hidden,
      };
    },
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    delete window.__MAGNET_TEST__;
  });
}
