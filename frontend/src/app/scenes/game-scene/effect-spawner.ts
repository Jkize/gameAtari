import Phaser from 'phaser';
import { MONO } from './game-scene.constants';

/**
 * Spawns short-lived, purely cosmetic effects (particles, tweened text and
 * graphics) into the game scene.
 *
 * All effects are fire-and-forget: they destroy their own game objects when
 * the animation finishes, so callers never need to track or clean them up.
 * Coordinates are world coordinates. Effects are visual feedback only and
 * never influence gameplay — the server remains authoritative.
 *
 * Triggered mainly by {@link StateChangeTracker} when it detects changes
 * between authoritative snapshots (hits, deaths, pickups, explosions).
 */
export class EffectSpawner {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Floating combat text ("-10") that pops in above a tank, drifts upward
   * and fades out. Used for both hull and shield damage.
   *
   * @param x World x of the damaged tank (a small random horizontal jitter
   *   is added so rapid consecutive hits don't overlap).
   * @param y World y for the text baseline, typically just above the tank.
   * @param amount Damage taken; rendered with a leading minus sign.
   * @param color CSS color of the number. Defaults to hull-damage red;
   *   shield damage passes cyan-blue.
   * @param stroke CSS color of the outline that keeps the text readable on
   *   any background.
   */
  spawnDamageNumber(
    x: number,
    y: number,
    amount: number,
    color = '#ff6a4a',
    stroke = '#1a0a06',
  ): void {
    const jitterX = Phaser.Math.Between(-10, 10);
    const text = this.scene.add.text(x + jitterX, y, `-${amount}`, {
      fontSize: '20px',
      fontFamily: MONO,
      color,
      stroke,
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(12).setScale(0.5);

    this.scene.tweens.add({
      targets: text,
      scale: 1,
      duration: 140,
      ease: 'Back.out',
    });
    this.scene.tweens.add({
      targets: text,
      y: y - 48,
      alpha: 0,
      duration: 1100,
      ease: 'Quad.out',
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Floating health recovery text ("+1") above a tank. It mirrors damage
   * text movement while using green feedback and no impact effects.
   */
  spawnRecoveryNumber(x: number, y: number, amount: number): void {
    const jitterX = Phaser.Math.Between(-10, 10);
    const text = this.scene.add.text(x + jitterX, y, `+${amount}`, {
      fontSize: '20px',
      fontFamily: MONO,
      color: '#55e878',
      stroke: '#06270f',
      strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(12).setScale(0.5);

    this.scene.tweens.add({
      targets: text,
      scale: 1,
      duration: 140,
      ease: 'Back.out',
    });
    this.scene.tweens.add({
      targets: text,
      y: y - 48,
      alpha: 0,
      duration: 1100,
      ease: 'Quad.out',
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Radial particle burst for a destroyed tank or a generic blast.
   *
   * @param large `true` for tank deaths/disconnects (bigger, hotter, longer
   *   burst); `false` for minor blasts.
   */
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

  /**
   * Debris burst in the color of whatever was hit: tank paint chips, wood
   * splinters, rock fragments. Rendered with normal (non-additive) blending
   * so the particles keep the material's true color instead of glowing.
   *
   * @param baseColor Base tint as a hex number (e.g. a tank's `color`);
   *   darker and lighter shades are derived from it for variety.
   * @param originRadius When > 0, particles spawn at random points within
   *   this radius around (x, y) and fly outward. Used for tank hits so the
   *   debris appears around the hull rather than hidden underneath it.
   */
  spawnHitDebris(x: number, y: number, baseColor: number, originRadius = 0): void {
    const base = Phaser.Display.Color.IntegerToColor(baseColor);
    const tints = [
      baseColor,
      base.clone().darken(25).color,
      base.clone().lighten(20).color,
    ];
    const count = originRadius > 0 ? 14 : 10;
    const em = this.scene.add.particles(x, y, 'particle', {
      speed: { min: 40, max: 190 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 340,
      tint: tints,
      emitting: false,
      ...(originRadius > 0 ? {
        emitZone: {
          type: 'random' as const,
          source: {
            getRandomPoint: (point: Phaser.Types.Math.Vector2Like): void => {
              const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
              const distance = originRadius * Phaser.Math.FloatBetween(0.3, 1);
              point.x = Math.cos(angle) * distance;
              point.y = Math.sin(angle) * distance;
            },
          },
        },
        // The emit zone runs before velocity is computed, so the particle's
        // local position is its ring point; aiming the angle along it makes
        // every particle fly outward instead of in a random direction.
        angle: {
          onEmit: (particle?: Phaser.GameObjects.Particles.Particle) => particle
            ? Phaser.Math.RadToDeg(Math.atan2(particle.y, particle.x)) + Phaser.Math.Between(-14, 14)
            : 0,
        },
      } : {}),
    }).setDepth(11);
    em.explode(count);
    this.scene.time.delayedCall(540, () => { if (em?.scene) em.destroy(); });
  }

  /**
   * Small spark burst where a bullet hit something (tank, obstacle, shield
   * or end of flight). The default impact effect for non-grenade bullets.
   */
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

  /**
   * Grenade detonation: an expanding shockwave ring, a particle burst,
   * shrapnel-colored debris scattered across the blast area and a brief
   * camera shake.
   *
   * @param explosionRadius Final ring radius in world pixels; should match
   *   the server's blast radius so the visual matches the actual damage area.
   */
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
    this.spawnHitDebris(x, y, 0x776a58, explosionRadius * 0.35);
    this.scene.cameras.main.shake(140, 0.0045);
    this.scene.time.delayedCall(760, () => { if (em?.scene) em.destroy(); });
  }

  /**
   * Celebratory multi-color burst where a power-up was collected, spawned
   * when a power-up disappears from the authoritative snapshot.
   */
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
