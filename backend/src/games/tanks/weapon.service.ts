import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Bullet } from './types/bullet.types';
import { Player } from './types/player.types';
import { PlayerWeapon, WeaponPublicState, WeaponStats } from './types/weapon.types';

const DEFAULT_WEAPON_STATS: WeaponStats = {
  magazineSize: 6,
  fireCooldownMs: 300,
  reloadDurationMs: 1400,
  maxActiveBullets: 5,
  bulletSpeed: 600,
  bulletDamage: 34,
  bulletRadius: 4,
  bulletLifetimeMs: 3000,
};

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

  tryShoot(player: Player, activeBullets: Bullet[], now: number): Bullet | null {
    const weapon = player.weapon;
    const stats = this.getStats(weapon, now);
    const state = weapon.state;

    this.finishReloadIfReady(weapon, stats, now);

    if (!player.input.shoot) return null;
    if (state.reloadsAt > now) return null;
    if (now - state.lastFiredAt < stats.fireCooldownMs) return null;

    const ownerBulletCount = activeBullets.filter(bullet => bullet.ownerId === player.id).length;
    if (ownerBulletCount >= stats.maxActiveBullets) return null;

    if (state.ammo <= 0) {
      this.startReload(weapon, stats, now);
      return null;
    }

    state.ammo -= 1;
    state.lastFiredAt = now;

    if (state.ammo === 0) {
      this.startReload(weapon, stats, now);
    }

    const angle = player.input.aimAngle;
    const offset = player.radius + stats.bulletRadius + 2;

    return {
      id: uuidv4(),
      ownerId: player.id,
      x: player.x + Math.cos(angle) * offset,
      y: player.y + Math.sin(angle) * offset,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: stats.bulletSpeed,
      damage: stats.bulletDamage,
      radius: stats.bulletRadius,
      lifeTime: stats.bulletLifetimeMs,
    };
  }

  getPublicState(weapon: PlayerWeapon, now: number): WeaponPublicState {
    const stats = this.getStats(weapon, now);
    this.finishReloadIfReady(weapon, stats, now);

    return {
      ammo: weapon.state.ammo,
      magazineSize: stats.magazineSize,
      reloadMs: Math.max(0, weapon.state.reloadsAt - now),
      fireCooldownMs: Math.max(0, stats.fireCooldownMs - (now - weapon.state.lastFiredAt)),
    };
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
