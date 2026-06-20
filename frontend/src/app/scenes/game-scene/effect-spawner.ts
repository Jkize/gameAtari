import Phaser from 'phaser';

export class EffectSpawner {
  constructor(private readonly scene: Phaser.Scene) {}

  spawnExplosion(x: number, y: number, large: boolean): void {
    const count = large ? 28 : 12;
    const speed = large ? { min: 60, max: 340 } : { min: 30, max: 150 };
    const life = large ? 750 : 380;
    const scale = large ? { start: 2.2, end: 0 } : { start: 0.9, end: 0 };
    const tints = large
      ? [0xff6600, 0xffcc00, 0xff2200, 0xffffff]
      : [0xffcc00, 0xffee88, 0xffffff];

    const em = this.scene.add.particles(x, y, 'particle', {
      speed,
      scale,
      alpha: { start: 1, end: 0 },
      lifespan: life,
      blendMode: 'ADD',
      tint: tints,
      emitting: false,
    });
    em.explode(count);
    this.scene.time.delayedCall(life + 200, () => { if (em?.scene) em.destroy(); });
  }

  spawnSpark(x: number, y: number): void {
    const em = this.scene.add.particles(x, y, 'particle', {
      speed: { min: 25, max: 110 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 260,
      blendMode: 'ADD',
      tint: [0xffee00, 0xffffff, 0xffaa00],
      emitting: false,
    });
    em.explode(8);
    this.scene.time.delayedCall(400, () => { if (em?.scene) em.destroy(); });
  }

  spawnGrenadeExplosion(x: number, y: number, explosionRadius = 120): void {
    const ring = this.scene.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    const flash = this.scene.add.graphics().setDepth(10).setBlendMode(Phaser.BlendModes.ADD);
    const state = { radius: 16, alpha: 0.9 };

    this.scene.tweens.add({
      targets: state,
      radius: explosionRadius,
      alpha: 0,
      duration: 360,
      ease: 'Quad.out',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(5, 0xffee66, state.alpha);
        ring.strokeCircle(x, y, state.radius);
        ring.lineStyle(2, 0xff6a00, state.alpha * 0.8);
        ring.strokeCircle(x, y, state.radius * 0.72);

        flash.clear();
        flash.fillStyle(0xffaa22, state.alpha * 0.16);
        flash.fillCircle(x, y, state.radius * 0.78);
      },
      onComplete: () => {
        ring.destroy();
        flash.destroy();
      },
    });

    const em = this.scene.add.particles(x, y, 'particle', {
      speed: { min: 70, max: 360 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 520,
      blendMode: 'ADD',
      tint: [0xffee66, 0xff9900, 0xff4422, 0xffffff],
      emitting: false,
    });
    em.explode(34);
    this.scene.cameras.main.shake(140, 0.0045);
    this.scene.time.delayedCall(760, () => { if (em?.scene) em.destroy(); });
  }

  spawnPowerPickupBurst(x: number, y: number): void {
    const em = this.scene.add.particles(x, y, 'particle', {
      speed: { min: 45, max: 180 },
      scale: { start: 1.0, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: 420,
      blendMode: 'ADD',
      tint: [0xffee00, 0x8fff5a, 0xff7a2f, 0xffffff],
      emitting: false,
    });
    em.explode(14);
    this.scene.time.delayedCall(620, () => { if (em?.scene) em.destroy(); });
  }
}
