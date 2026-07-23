import Phaser from 'phaser';
import { drawMirrorPanel, MirrorPanelSurface } from '@game/rendering/textures/mirror-panel-renderer';
import { Obstacle } from '@game/contracts/game-state.types';
import { BUSH_COVER_DEPTH, OBSTACLE_ASSET_BY_TYPE, OBS } from '@game/config/game-scene.constants';
import { GameSceneLayers } from '@game/rendering/game-scene-layers';

export class ObstacleRenderer {
  private obsGfx: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private obsTextureKeys: Map<string, string | null> = new Map();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layers: GameSceneLayers,
  ) {}

  reset(): void {
    this.obsGfx.forEach(gfx => gfx.destroy());
    this.obsGfx.clear();
    this.obsTextureKeys.clear();
  }

  remove(id: string): void {
    const gfx = this.obsGfx.get(id);
    if (gfx) {
      gfx.destroy();
      this.obsGfx.delete(id);
    }
    this.obsTextureKeys.delete(id);
  }

  ensure(obs: Obstacle): void {
    const textureKey = this.getObstacleTextureKey(obs);
    if (!this.obsGfx.has(obs.id)) {
      this.obsGfx.set(obs.id, this.createObstacleGfx(obs));
      this.obsTextureKeys.set(obs.id, textureKey);
    } else if (this.obsTextureKeys.get(obs.id) !== textureKey) {
      const gfx = this.obsGfx.get(obs.id);
      if (gfx) gfx.destroy();
      this.obsGfx.set(obs.id, this.createObstacleGfx(obs));
      this.obsTextureKeys.set(obs.id, textureKey);
    }
  }

  drawGlows(obstacles: Obstacle[]): void {
    obstacles.forEach(obs => {
      const ox = obs.x - obs.width / 2;
      const oy = obs.y - obs.height / 2;
      switch (obs.type) {
        case 'bush':
          this.layers.glowGfx.fillStyle(0x77aa33, 0.08);
          this.layers.glowGfx.fillEllipse(obs.x, obs.y + obs.height * 0.2, obs.width * 0.8, obs.height * 0.28);
          break;
        case 'mirror':
          this.layers.glowGfx.lineStyle(22, 0x00bbdd, 0.07);
          this.layers.glowGfx.strokeRect(ox - 9, oy - 9, obs.width + 18, obs.height + 18);
          this.layers.glowGfx.lineStyle(14, 0x00ccee, 0.13);
          this.layers.glowGfx.strokeRect(ox - 5, oy - 5, obs.width + 10, obs.height + 10);
          this.layers.glowGfx.lineStyle(7, 0x00ddff, 0.26);
          this.layers.glowGfx.strokeRect(ox - 2, oy - 2, obs.width + 4, obs.height + 4);
          this.layers.glowGfx.lineStyle(3, 0x00ffff, 0.45);
          this.layers.glowGfx.strokeRect(ox, oy, obs.width, obs.height);
          this.layers.glowGfx.fillStyle(0x00ddff, 0.07);
          this.layers.glowGfx.fillRect(ox, oy, obs.width, obs.height);
          break;
        case 'steel':
          this.layers.glowGfx.lineStyle(5, 0x2255cc, 0.14);
          this.layers.glowGfx.strokeRect(ox - 1, oy - 1, obs.width + 2, obs.height + 2);
          break;
      }
    });
  }

  getObstacleTextureKey(obs: Obstacle): string | null {
    if (obs.type === 'wood') {
      return `obstacle-${this.getDamageVariant('wood_barricade', obs)}`;
    }

    if (obs.type === 'rock') {
      return `obstacle-${this.getDamageVariant('rock_block', obs)}`;
    }

    const assetId = obs.assetId ?? OBSTACLE_ASSET_BY_TYPE[obs.type];
    return assetId ? `obstacle-${assetId}` : null;
  }

  private getDamageVariant(baseAssetId: 'rock_block' | 'wood_barricade', obs: Obstacle): string {
    const healthRatio = obs.healthRatio ?? (obs.maxHp > 0 ? obs.hp / obs.maxHp : 1);

    if (healthRatio > 0.66) return `${baseAssetId}_1`;
    if (healthRatio > 0.33) return `${baseAssetId}_2`;
    return `${baseAssetId}_3`;
  }

  private createObstacleGfx(obs: Obstacle): Phaser.GameObjects.GameObject {
    const textureKey = this.getObstacleTextureKey(obs);
    if (obs.type === 'mirror') {
      const gfx = this.scene.add.graphics().setDepth(2);
      this.drawMirrorObstacle(gfx, obs);
      return gfx;
    }

    if (textureKey && this.scene.textures.exists(textureKey)) {
      return this.scene.add.image(obs.x, obs.y, textureKey)
        .setOrigin(0.5)
        .setDisplaySize(obs.width, obs.height)
        .setDepth(obs.type === 'bush' ? BUSH_COVER_DEPTH : 2);
    }

    const gfx = this.scene.add.graphics().setDepth(obs.type === 'bush' ? BUSH_COVER_DEPTH : 2);

    const col = OBS[obs.type] ?? OBS['rock'];
    gfx.fillStyle(col.fill, 1);
    gfx.fillRect(obs.x - obs.width / 2, obs.y - obs.height / 2, obs.width, obs.height);
    return gfx;
  }

  private drawMirrorObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle): void {
    const surface: MirrorPanelSurface = {
      fillRect: (x, y, width, height, color, alpha) => {
        gfx.fillStyle(color, alpha);
        gfx.fillRect(x, y, width, height);
      },
      fillRoundedRect: (x, y, width, height, radius, color, alpha) => {
        gfx.fillStyle(color, alpha);
        gfx.fillRoundedRect(x, y, width, height, radius);
      },
      strokeLine: (x1, y1, x2, y2, width, color, alpha) => {
        gfx.lineStyle(width, color, alpha);
        gfx.lineBetween(x1, y1, x2, y2);
      },
      strokeRoundedRect: (x, y, width, height, radius, lineWidth, color, alpha) => {
        gfx.lineStyle(lineWidth, color, alpha);
        gfx.strokeRoundedRect(x, y, width, height, radius);
      },
      fillCircle: (x, y, radius, color, alpha) => {
        gfx.fillStyle(color, alpha);
        gfx.fillCircle(x, y, radius);
      },
    };
    drawMirrorPanel(surface, obs);
  }
}
