import Phaser from 'phaser';
import { BulletPublicState, EBulletKind } from '@game/contracts/game-state.types';
import { C } from '@game/config/game-scene.constants';
import { GameSceneLayers } from '@game/rendering/game-scene-layers';

export class BulletRenderer {
  constructor(private readonly layers: GameSceneLayers) {}

  draw(bullets: BulletPublicState[], time: number): void {
    const flicker = 0.85 + 0.15 * Math.sin(time * 0.012);
    bullets.forEach(b => {
      const r = b.radius;
      const core = b.kind === EBulletKind.GRENADE
        ? 0x8fff5a
        : b.kind === EBulletKind.LASER ? 0xff0030 : C.BULLET;
      const glow = b.kind === EBulletKind.GRENADE
        ? 0x42ff66
        : b.kind === EBulletKind.LASER ? 0xff174f : C.BULLET_GLOW;
      if (b.kind === EBulletKind.LASER) {
        this.drawLaser(b, time, core, glow);
        return;
      }

      this.layers.bulletGlowGfx.fillStyle(glow, 0.18 * flicker);
      this.layers.bulletGlowGfx.fillCircle(b.x, b.y, r * 4);
      this.layers.bulletGlowGfx.fillStyle(core, 0.40 * flicker);
      this.layers.bulletGlowGfx.fillCircle(b.x, b.y, r * 2.2);
      this.layers.bulletGfx.fillStyle(core, 1);
      this.layers.bulletGfx.fillCircle(b.x, b.y, r);
      this.layers.bulletGfx.fillStyle(0xffffff, 0.92);
      this.layers.bulletGfx.fillCircle(b.x, b.y, r * 0.42);
    });
  }

  private drawLaser(b: BulletPublicState, time: number, core: number, glow: number): void {
    const endX = b.endX ?? b.x;
    const endY = b.endY ?? b.y;
    const bendX = b.bendX;
    const bendY = b.bendY;
    const pulse = 0.8 + 0.2 * Math.sin(time * 0.05);
    const drawBeam = (width: number, color: number, alpha: number, layer: Phaser.GameObjects.Graphics) => {
      layer.lineStyle(width, color, alpha);
      if (bendX !== undefined && bendY !== undefined) {
        layer.lineBetween(b.x, b.y, bendX, bendY);
        layer.lineBetween(bendX, bendY, endX, endY);
      } else {
        layer.lineBetween(b.x, b.y, endX, endY);
      }
    };

    drawBeam(32, glow, 0.20 * pulse, this.layers.bulletGlowGfx);
    drawBeam(20, 0xff0030, 0.42 * pulse, this.layers.bulletGlowGfx);
    drawBeam(10, 0xff5a78, 0.88, this.layers.bulletGlowGfx);
    drawBeam(5, core, 1, this.layers.bulletGfx);
    drawBeam(2, 0xffffff, 1, this.layers.bulletGfx);

    if (bendX !== undefined && bendY !== undefined) {
      this.layers.bulletGlowGfx.fillStyle(0xff0030, 0.55 * pulse);
      this.layers.bulletGlowGfx.fillCircle(bendX, bendY, b.radius * 5);
      this.layers.bulletGfx.fillStyle(0xffffff, 0.95);
      this.layers.bulletGfx.fillCircle(bendX, bendY, b.radius * 0.75);
    }

    this.layers.bulletGlowGfx.fillStyle(0xff0030, 0.60 * pulse);
    this.layers.bulletGlowGfx.fillCircle(endX, endY, b.radius * 4.5);
    this.layers.bulletGfx.fillStyle(0xffffff, 0.95);
    this.layers.bulletGfx.fillCircle(endX, endY, b.radius * 0.85);
  }
}
