import Phaser from 'phaser';
import { Obstacle } from '../../types/game-state.types';
import { BUSH_COVER_DEPTH, OBSTACLE_ASSET_BY_TYPE, OBS, hashString, seededRandom } from './game-scene.constants';
import { GameSceneLayers } from './game-scene-layers';

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
    if (obs.type !== 'mirror' && textureKey && this.scene.textures.exists(textureKey)) {
      return this.scene.add.image(obs.x, obs.y, textureKey)
        .setOrigin(0.5)
        .setDisplaySize(obs.width, obs.height)
        .setDepth(obs.type === 'bush' ? BUSH_COVER_DEPTH : 2);
    }

    const gfx = this.scene.add.graphics().setDepth(obs.type === 'bush' ? BUSH_COVER_DEPTH : 2);

    if (obs.type === 'mirror') {
      this.drawMirrorObstacle(gfx, obs, seededRandom(hashString(obs.id)));
      return gfx;
    }

    const col = OBS[obs.type] ?? OBS['rock'];
    gfx.fillStyle(col.fill, 1);
    gfx.fillRect(obs.x - obs.width / 2, obs.y - obs.height / 2, obs.width, obs.height);
    return gfx;
  }

  private drawMirrorObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle, rng: () => number): void {
    const x = obs.x - obs.width / 2;
    const y = obs.y - obs.height / 2;
    const w = obs.width;
    const h = obs.height;
    const horizontal = w >= h;
    const frame = Math.max(3, Math.min(7, Math.min(w, h) * 0.22));
    const glassX = x + frame;
    const glassY = y + frame;
    const glassW = Math.max(1, w - frame * 2);
    const glassH = Math.max(1, h - frame * 2);
    const longSide = horizontal ? w : h;
    const segmentCount = Math.max(2, Math.floor(longSide / 34));

    gfx.fillStyle(0x000000, 0.42);
    gfx.fillRect(x + 5, y + 6, w + 8, h + 8);
    gfx.fillStyle(0x001823, 1);
    gfx.fillRect(x - 5, y - 5, w + 10, h + 10);
    gfx.fillStyle(0x00384e, 1);
    gfx.fillRect(x - 2, y - 2, w + 4, h + 4);
    gfx.fillStyle(0x001f2b, 1);
    gfx.fillRect(x, y, w, h);
    gfx.fillStyle(0x008fa8, 0.58);
    gfx.fillRect(glassX, glassY, glassW, glassH);
    gfx.fillStyle(0x18e6ff, 0.32);
    gfx.fillRect(glassX + 2, glassY + 2, Math.max(1, glassW - 4), Math.max(1, glassH * 0.42));
    gfx.fillStyle(0x004f68, 0.35);
    gfx.fillRect(glassX + 2, glassY + glassH * 0.58, Math.max(1, glassW - 4), Math.max(1, glassH * 0.34));

    gfx.lineStyle(2, 0x00f7ff, 0.55);
    for (let i = 1; i < segmentCount; i++) {
      const t = i / segmentCount;
      if (horizontal) {
        const sx = x + w * t + (rng() - 0.5) * 2;
        gfx.lineBetween(sx, y + frame * 0.7, sx, y + h - frame * 0.7);
      } else {
        const sy = y + h * t + (rng() - 0.5) * 2;
        gfx.lineBetween(x + frame * 0.7, sy, x + w - frame * 0.7, sy);
      }
    }

    gfx.lineStyle(2.5, 0xffffff, 0.62);
    if (horizontal) {
      gfx.lineBetween(glassX + glassW * 0.12, glassY + glassH * 0.34, glassX + glassW * 0.36, glassY + glassH * 0.34);
      gfx.lineBetween(glassX + glassW * 0.50, glassY + glassH * 0.50, glassX + glassW * 0.76, glassY + glassH * 0.50);
      gfx.lineStyle(1.5, 0x9dffff, 0.48);
      gfx.lineBetween(glassX + glassW * 0.18, glassY + glassH * 0.68, glassX + glassW * 0.90, glassY + glassH * 0.68);
    } else {
      gfx.lineBetween(glassX + glassW * 0.36, glassY + glassH * 0.12, glassX + glassW * 0.36, glassY + glassH * 0.36);
      gfx.lineBetween(glassX + glassW * 0.50, glassY + glassH * 0.50, glassX + glassW * 0.50, glassY + glassH * 0.76);
      gfx.lineStyle(1.5, 0x9dffff, 0.48);
      gfx.lineBetween(glassX + glassW * 0.68, glassY + glassH * 0.18, glassX + glassW * 0.68, glassY + glassH * 0.90);
    }

    gfx.lineStyle(3, 0x00eaff, 0.88);
    gfx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    gfx.lineStyle(1.5, 0xb9ffff, 0.72);
    gfx.strokeRect(glassX, glassY, glassW, glassH);

    gfx.fillStyle(0x00eaff, 0.90);
    if (horizontal) {
      gfx.fillRect(x - 3, y - 3, 7, h + 6);
      gfx.fillRect(x + w - 4, y - 3, 7, h + 6);
    } else {
      gfx.fillRect(x - 3, y - 3, w + 6, 7);
      gfx.fillRect(x - 3, y + h - 4, w + 6, 7);
    }
  }
}
