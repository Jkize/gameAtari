import Phaser from 'phaser';
import { PowerUpSpawn } from '@game/contracts/game-state.types';
import {
  hashString,
  POWER_UP_COLOR,
  POWER_UP_GLOW_SCALE,
  POWER_UP_ICON_SCALE,
  POWER_UP_RING_SCALE,
} from '@game/config/game-scene.constants';
import { GameSceneLayers } from '@game/rendering/game-scene-layers';

export class PowerUpRenderer {
  private powerUpGfx: Map<string, Phaser.GameObjects.Image> = new Map();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layers: GameSceneLayers,
  ) {}

  reset(): void {
    this.powerUpGfx.forEach(gfx => gfx.destroy());
    this.powerUpGfx.clear();
  }

  ensure(powerUp: PowerUpSpawn): void {
    if (!this.powerUpGfx.has(powerUp.id)) {
      this.powerUpGfx.set(powerUp.id, this.createPowerUpGfx(powerUp));
    }
  }

  remove(id: string): Phaser.GameObjects.Image | undefined {
    const gfx = this.powerUpGfx.get(id);
    if (gfx) {
      gfx.destroy();
      this.powerUpGfx.delete(id);
    }
    return gfx;
  }

  get(id: string): Phaser.GameObjects.Image | undefined {
    return this.powerUpGfx.get(id);
  }

  draw(powerUps: PowerUpSpawn[], time: number): void {
    powerUps.forEach(powerUp => {
      const icon = this.powerUpGfx.get(powerUp.id);
      const color = POWER_UP_COLOR[powerUp.type];
      const bob = Math.sin(time * 0.004 + hashString(powerUp.id) * 0.01) * 6;
      const pulse = 1 + Math.sin(time * 0.006) * 0.06;

      this.layers.glowGfx.fillStyle(color, 0.16);
      this.layers.glowGfx.fillCircle(powerUp.x, powerUp.y + bob, powerUp.radius * POWER_UP_GLOW_SCALE);
      this.layers.glowGfx.lineStyle(2, color, 0.55);
      this.layers.glowGfx.strokeCircle(powerUp.x, powerUp.y + bob, powerUp.radius * POWER_UP_RING_SCALE);

      if (icon) {
        icon
          .setPosition(powerUp.x, powerUp.y + bob)
          .setDisplaySize(
            powerUp.radius * POWER_UP_ICON_SCALE * pulse,
            powerUp.radius * POWER_UP_ICON_SCALE * pulse,
          )
          .setAlpha(0.95);
      }
    });
  }

  private createPowerUpGfx(powerUp: PowerUpSpawn): Phaser.GameObjects.Image {
    const textureKey = `weapon-${powerUp.assetId}`;
    const image = this.scene.add.image(
      powerUp.x,
      powerUp.y,
      this.scene.textures.exists(textureKey) ? textureKey : 'particle',
    )
      .setOrigin(0.5)
      .setDisplaySize(powerUp.radius * POWER_UP_ICON_SCALE, powerUp.radius * POWER_UP_ICON_SCALE)
      .setDepth(9);

    if (!this.scene.textures.exists(textureKey)) {
      image.setTint(POWER_UP_COLOR[powerUp.type]);
    }

    return image;
  }
}
