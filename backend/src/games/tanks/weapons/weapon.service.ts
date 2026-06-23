import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Bullet } from '../types/bullet.types';
import { Player } from '../types/player.types';
import { PlayerWeapon, WeaponPublicState, WeaponStats } from '../types/weapon.types';
import {
  DEFAULT_WEAPON_STATS,
  GRENADE_CONFIG,
  LASER_CONFIG,
  POWER_UP_DEFINITIONS,
  SHOTGUN_CONFIG,
  TRIPLE_SHOT_CONFIG,
} from './weapon.config';

@Injectable()
export class WeaponService {
  createDefaultWeapon(): PlayerWeapon {
    return {
      baseStats: { ...DEFAULT_WEAPON_STATS },
      state: {
        ammo: DEFAULT_WEAPON_STATS.magazineSize,
        lastFiredAt: 0,
        reloadsAt: 0,
      },
      modifiers: [],
    };
  }

  tryShoot(player: Player, activeBullets: Bullet[], now: number): Bullet[] {
    const weapon = player.weapon;
    this.clearExpiredPowerUp(player, now);

    if (player.activePowerUp?.type === 'laser') {
      return this.tryShootLaser(player, activeBullets, now);
    }

    const hasActiveLaserBeam = activeBullets.some(b => b.ownerId === player.id && b.kind === 'laser');
    if (hasActiveLaserBeam) return [];

    const stats = this.getPowerAdjustedStats(player, this.getStats(weapon, now));
    const state = weapon.state;

    this.finishReloadIfReady(weapon, stats, now);

    if (!player.input.shoot) return [];
    if (state.reloadsAt > now) return [];
    if (now - state.lastFiredAt < stats.fireCooldownMs) return [];

    const ownerBulletCount = activeBullets.filter(bullet => bullet.ownerId === player.id).length;
    if (ownerBulletCount >= stats.maxActiveBullets) return [];

    if (state.ammo <= 0) {
      this.startReload(weapon, stats, now);
      return [];
    }

    const bullets = this.createShotPattern(player, stats);
    if (ownerBulletCount + bullets.length > stats.maxActiveBullets) return [];

    state.ammo -= 1;
    state.lastFiredAt = now;

    if (state.ammo === 0) {
      this.startReload(weapon, stats, now);
    }

    return bullets;
  }

  applyPowerUp(player: Player, type: string, now: number): void {
    if (!this.isSupportedPowerUp(type)) return;

    const definition = POWER_UP_DEFINITIONS[type];
    player.activePowerUp = {
      type,
      name: definition.name,
      expiresAt: definition.durationMs ? now + definition.durationMs : undefined,
      shotsRemaining: type === 'laser' ? LASER_CONFIG.shots : undefined,
    };

    const stats = this.getPowerAdjustedStats(player, player.weapon.baseStats);
    player.weapon.state.reloadsAt = 0;
    player.weapon.state.ammo = stats.magazineSize;
  }

  getPublicState(player: Player, now: number): WeaponPublicState {
    this.clearExpiredPowerUp(player, now);

    const stats = this.getPowerAdjustedStats(player, this.getStats(player.weapon, now));
    this.finishReloadIfReady(player.weapon, stats, now);

    return {
      ammo: Math.min(player.weapon.state.ammo, stats.magazineSize),
      magazineSize: stats.magazineSize,
      reloadMs: Math.max(0, player.weapon.state.reloadsAt - now),
      fireCooldownMs: Math.max(0, stats.fireCooldownMs - (now - player.weapon.state.lastFiredAt)),
    };
  }

  private createShotPattern(player: Player, stats: WeaponStats): Bullet[] {
    switch (player.activePowerUp?.type) {
      case 'triple_shot':
        return TRIPLE_SHOT_CONFIG.spreadAngles.map(spread =>
          this.createBullet(player, stats, player.input.aimAngle + spread),
        );
      case 'shotgun':
        return SHOTGUN_CONFIG.spreadAngles.map(spread => this.createBullet(
          player,
          {
            ...stats,
            ...SHOTGUN_CONFIG.projectileStats,
          },
          player.input.aimAngle + spread,
          SHOTGUN_CONFIG.maxDistance,
        ));
      case 'grenade':
        return [this.createBullet(
          player,
          {
            ...stats,
            ...GRENADE_CONFIG.projectileStats,
          },
          player.input.aimAngle,
          GRENADE_CONFIG.maxDistance,
          'grenade',
        )];
      default:
        return [this.createBullet(player, stats, player.input.aimAngle)];
    }
  }

  private getPowerAdjustedStats(player: Player, stats: WeaponStats): WeaponStats {
    switch (player.activePowerUp?.type) {
      case 'triple_shot':
        return {
          ...stats,
          ...TRIPLE_SHOT_CONFIG.stats,
        };
      case 'shotgun':
        return {
          ...stats,
          ...SHOTGUN_CONFIG.stats,
        };
      case 'grenade':
        return {
          ...stats,
          ...GRENADE_CONFIG.stats,
        };
      case 'laser':
        return {
          ...stats,
          ...LASER_CONFIG.stats,
        };
      default:
        return stats;
    }
  }

  private tryShootLaser(player: Player, activeBullets: Bullet[], now: number): Bullet[] {
    const powerUp = player.activePowerUp;
    if (!powerUp || powerUp.type !== 'laser') return [];

    const stats = this.getPowerAdjustedStats(player, this.getStats(player.weapon, now));
    const state = player.weapon.state;
    const shotsRemaining = powerUp.shotsRemaining ?? 0;

    const wasHoldingTrigger = state.triggerHeld === true;
    state.triggerHeld = player.input.shoot;

    if (!player.input.shoot) return [];
    if (wasHoldingTrigger) return [];

    if (shotsRemaining <= 0) {
      player.activePowerUp = undefined;
      return [];
    }

    if (now - state.lastFiredAt < stats.fireCooldownMs) return [];

    const ownerBulletCount = activeBullets.filter(bullet => bullet.ownerId === player.id).length;
    if (ownerBulletCount >= stats.maxActiveBullets) return [];

    const bullet = this.createBullet(
      player,
      {
        ...stats,
        ...LASER_CONFIG.projectileStats,
      },
      player.input.aimAngle,
      LASER_CONFIG.maxDistance,
      'laser',
    );

    bullet.endX = bullet.x + bullet.dirX * LASER_CONFIG.maxDistance;
    bullet.endY = bullet.y + bullet.dirY * LASER_CONFIG.maxDistance;
    bullet.pierceMetalRemaining = LASER_CONFIG.metalPierces;
    bullet.obstacleDamage = LASER_CONFIG.damagePerSecond;
    bullet.piercedObstacleIds = [];

    powerUp.shotsRemaining = shotsRemaining - 1;
    state.lastFiredAt = now;
    state.ammo = powerUp.shotsRemaining;

    if (powerUp.shotsRemaining <= 0) {
      player.activePowerUp = undefined;
      state.ammo = player.weapon.baseStats.magazineSize;
    }

    return [bullet];
  }

  private createBullet(
    player: Player,
    stats: WeaponStats,
    angle: number,
    maxDistance?: number,
    kind?: Bullet['kind'],
  ): Bullet {
    const offset = player.radius + stats.bulletRadius + 2;
    const x = player.x + Math.cos(angle) * offset;
    const y = player.y + Math.sin(angle) * offset;

    return {
      id: uuidv4(),
      ownerId: player.id,
      kind,
      x,
      y,
      startX: x,
      startY: y,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: stats.bulletSpeed,
      damage: stats.bulletDamage,
      radius: stats.bulletRadius,
      lifeTime: stats.bulletLifetimeMs,
      maxDistance,
      explosionRadius: kind === 'grenade' ? GRENADE_CONFIG.explosionRadius : undefined,
      obstacleDamage: kind === 'grenade' ? GRENADE_CONFIG.obstacleDamage : undefined,
    };
  }

  private clearExpiredPowerUp(player: Player, now: number): void {
    if (player.activePowerUp?.expiresAt && player.activePowerUp.expiresAt <= now) {
      player.activePowerUp = undefined;
    }
  }

  private isSupportedPowerUp(type: string): type is keyof typeof POWER_UP_DEFINITIONS {
    return type in POWER_UP_DEFINITIONS;
  }

  private getStats(weapon: PlayerWeapon, now: number): WeaponStats {
    const stats = { ...weapon.baseStats };

    weapon.modifiers = weapon.modifiers.filter(modifier => !modifier.expiresAt || modifier.expiresAt > now);
    for (const modifier of weapon.modifiers) {
      const current = stats[modifier.stat];
      if (modifier.operation === 'add') stats[modifier.stat] = current + modifier.value;
      if (modifier.operation === 'multiply') stats[modifier.stat] = current * modifier.value;
      if (modifier.operation === 'set') stats[modifier.stat] = modifier.value;
    }

    stats.magazineSize = Math.max(1, Math.round(stats.magazineSize));
    stats.fireCooldownMs = Math.max(0, Math.round(stats.fireCooldownMs));
    stats.reloadDurationMs = Math.max(0, Math.round(stats.reloadDurationMs));
    stats.maxActiveBullets = Math.max(1, Math.round(stats.maxActiveBullets));
    stats.bulletSpeed = Math.max(1, stats.bulletSpeed);
    stats.bulletDamage = Math.max(1, stats.bulletDamage);
    stats.bulletRadius = Math.max(1, stats.bulletRadius);
    stats.bulletLifetimeMs = Math.max(1, stats.bulletLifetimeMs);

    return stats;
  }

  tryManualReload(player: Player, now: number): void {
    if (player.activePowerUp?.type === 'laser') return;
    const weapon = player.weapon;
    const stats = this.getPowerAdjustedStats(player, this.getStats(weapon, now));
    if (weapon.state.reloadsAt > now) return;
    if (weapon.state.ammo >= stats.magazineSize) return;
    this.startReload(weapon, stats, now);
  }

  private finishReloadIfReady(weapon: PlayerWeapon, stats: WeaponStats, now: number): void {
    if (weapon.state.reloadsAt === 0 || weapon.state.reloadsAt > now) return;

    weapon.state.reloadsAt = 0;
    weapon.state.ammo = stats.magazineSize;
  }

  private startReload(weapon: PlayerWeapon, stats: WeaponStats, now: number): void {
    if (weapon.state.reloadsAt > now) return;
    weapon.state.reloadsAt = now + stats.reloadDurationMs;
  }
}
