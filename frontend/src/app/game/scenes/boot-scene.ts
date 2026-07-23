import Phaser from 'phaser';
import { PHASER_GAME_ASSETS } from '@game/assets/game-assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    PHASER_GAME_ASSETS.forEach((asset) => {
      if (asset.type === 'audio') this.load.audio(asset.key, asset.path);
      else if (asset.type === 'image') this.load.image(asset.key, asset.path as string);
      else this.load.svg(asset.key, asset.path as string, asset.textureSize);
    });
  }

  create(): void {
    const particle = this.make.graphics({ x: 0, y: 0 } as never, false);
    particle.fillStyle(0xffffff, 1);
    particle.fillCircle(6, 6, 6);
    particle.generateTexture('particle', 12, 12);
    particle.destroy();

    // The authoritative match is already running when Angular enters /game.
    // Start gameplay as soon as preload completes instead of delaying input.
    this.scene.start('GameScene');
  }
}
