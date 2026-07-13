import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';
import { CANVAS_HEIGHT, GAME_VIEW_WIDTH } from './viewport.config';

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
        width: GAME_VIEW_WIDTH,
        height: CANVAS_HEIGHT,
      },
      render: {
        antialias: true,
        pixelArt: false,
      },
      input: {
        // Move stick + aim stick + action button pressed simultaneously.
        activePointers: 4,
      },
      fps: {
        target: 60,
      },
    });
  }
}
