import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';

export class TankGame extends Phaser.Game {
  constructor(parent: HTMLElement) {
    super({
      type: Phaser.AUTO,
      parent,
      backgroundColor: ACTIVE_BACKGROUND_SCENARIO.canvasBackground,
      scene: [BootScene, GameScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1280,
        height: 720,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
      fps: {
        target: 60,
      },
    });
  }
}
