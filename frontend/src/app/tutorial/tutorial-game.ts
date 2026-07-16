import Phaser from 'phaser';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';
import { CANVAS_HEIGHT, GAME_VIEW_WIDTH } from '../game/viewport.config';
import { TutorialScene, TutorialSceneCallbacks } from './tutorial-scene';

export class TutorialGame extends Phaser.Game {
  constructor(parent: HTMLElement, callbacks: TutorialSceneCallbacks, playerName: string) {
    super({
      type: Phaser.AUTO,
      parent,
      backgroundColor: ACTIVE_BACKGROUND_SCENARIO.canvasBackground,
      scene: [new TutorialScene(callbacks, playerName)],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_VIEW_WIDTH,
        height: CANVAS_HEIGHT,
      },
      render: { antialias: true, pixelArt: false },
      input: { activePointers: 4 },
      fps: { target: 60 },
    });
  }
}
