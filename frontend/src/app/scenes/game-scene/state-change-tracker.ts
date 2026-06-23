import Phaser from 'phaser';
import { BulletImpactPublicState, BulletPublicState, GameState } from '../../types/game-state.types';
import { HIT_REVEAL_MS } from './game-scene.constants';
import { EffectSpawner } from './effect-spawner';
import { ObstacleRenderer } from './obstacle-renderer';
import { PlayerRenderer } from './player-renderer';
import { PowerUpRenderer } from './power-up-renderer';
import { AudioManager, SoundPoint, WeaponFireSound } from './audio-manager';

type LastBulletPos = {
  x: number;
  y: number;
  kind?: string;
  explosionRadius?: number;
  laserReflected?: boolean;
  reflectCount?: number;
};

type NewBulletGroup = {
  count: number;
  x: number;
  y: number;
};

export class StateChangeTracker {
  private playerLastHp: Map<string, number> = new Map();
  private playerLastPos: Map<string, { x: number; y: number }> = new Map();
  private playerLastReloadMs: Map<string, number> = new Map();
  private playerLastDashing: Map<string, boolean> = new Map();
  private bulletLastPos: Map<string, LastBulletPos> = new Map();
  private prevPlayerIds: Set<string> = new Set();
  private prevBulletIds: Set<string> = new Set();
  private prevObsIds: Set<string> = new Set();
  private prevPowerUpIds: Set<string> = new Set();
  private playedImpactEventIds: Set<string> = new Set();
  private hasStateSnapshot = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectSpawner,
    private readonly obstacleRenderer: ObstacleRenderer,
    private readonly powerUpRenderer: PowerUpRenderer,
    private readonly playerRenderer: PlayerRenderer,
    private readonly audioManager: AudioManager,
  ) {}

  reset(): void {
    this.playerLastHp.clear();
    this.playerLastPos.clear();
    this.playerLastReloadMs.clear();
    this.playerLastDashing.clear();
    this.bulletLastPos.clear();
    this.prevPlayerIds.clear();
    this.prevBulletIds.clear();
    this.prevObsIds.clear();
    this.prevPowerUpIds.clear();
    this.playedImpactEventIds.clear();
    this.hasStateSnapshot = false;
  }

  removeDisconnectedPlayer(playerId: string): void {
    const pos = this.playerLastPos.get(playerId);
    if (pos) this.effects.spawnExplosion(pos.x, pos.y, true);
    this.playerLastHp.delete(playerId);
    this.playerLastPos.delete(playerId);
    this.playerRenderer.remove(playerId);
  }

  check(state: GameState, myPlayerId: string): void {
    const curPlayers = new Set(state.players.map(p => p.id));
    const curBullets = new Set(state.bullets.map(b => b.id));
    const curObs = new Set(state.map.obstacles.map(o => o.id));
    const curPowerUps = new Set(state.map.powerUps.map(p => p.id));

    const localPlayer = state.players.find(player => player.id === myPlayerId);

    if (this.hasStateSnapshot && localPlayer) {
      this.playNewBulletSounds(state.bullets, localPlayer, myPlayerId);
      this.playBulletReflectionSounds(state.bullets, localPlayer);
      this.playLaserReflectionSounds(state.bullets, localPlayer);
      this.playBulletImpactEvents(state.impactEvents ?? [], localPlayer);
      this.playReloadSounds(state, myPlayerId);
    }

    const handledImpactBulletIds = new Set((state.impactEvents ?? []).map(event => event.bulletId));

    this.prevPlayerIds.forEach(id => {
      if (!curPlayers.has(id)) {
        const pos = this.playerLastPos.get(id);
        const lastHp = this.playerLastHp.get(id);
        if (pos && (lastHp === undefined || lastHp > 0)) this.effects.spawnExplosion(pos.x, pos.y, true);
        this.playerLastHp.delete(id);
        this.playerLastPos.delete(id);
        this.playerLastReloadMs.delete(id);
        this.playerLastDashing.delete(id);
        this.playerRenderer.remove(id);
      }
    });

    this.prevBulletIds.forEach(id => {
      if (!curBullets.has(id)) {
        const pos = this.bulletLastPos.get(id);
        if (pos) {
          if (pos.kind === 'grenade') {
            this.effects.spawnGrenadeExplosion(pos.x, pos.y, pos.explosionRadius);
            if (localPlayer) this.audioManager.playGrenadeExplosion(pos, localPlayer);
          } else if (pos.kind !== 'laser' && !handledImpactBulletIds.has(id)) {
            this.effects.spawnSpark(pos.x, pos.y);
            if (localPlayer) {
              this.audioManager.playBulletImpact(
                'spark',
                pos,
                localPlayer,
              );
            }
          }
        }
        this.bulletLastPos.delete(id);
      }
    });

    this.prevObsIds.forEach(id => {
      if (!curObs.has(id)) {
        this.obstacleRenderer.remove(id);
      }
    });

    this.prevPowerUpIds.forEach(id => {
      if (!curPowerUps.has(id)) {
        const gfx = this.powerUpRenderer.get(id);
        if (gfx) {
          this.effects.spawnPowerPickupBurst(gfx.x, gfx.y);
          if (localPlayer) this.audioManager.playPowerUpPickup(gfx, localPlayer);
          this.powerUpRenderer.remove(id);
        }
      }
    });

    state.map.obstacles.forEach(obs => this.obstacleRenderer.ensure(obs));
    state.map.powerUps.forEach(powerUp => this.powerUpRenderer.ensure(powerUp));

    state.players.forEach(p => {
      let revealUntil: number | undefined;
      const prev = this.playerLastHp.get(p.id);
      if (prev !== undefined && p.hp < prev) {
        revealUntil = this.scene.time.now + HIT_REVEAL_MS;
        if (p.id === myPlayerId) {
          this.scene.cameras.main.shake(220, 0.009);
        }
      }
      if (prev !== undefined && prev > 0 && p.hp <= 0) {
        this.effects.spawnExplosion(p.x, p.y, true);
      }
      if (localPlayer && p.dashing && !this.playerLastDashing.get(p.id)) {
        this.audioManager.playDash(p, localPlayer, p.id === myPlayerId);
      }
      this.playerRenderer.recordPlayerState(p, revealUntil);
      this.playerLastHp.set(p.id, p.hp);
      this.playerLastPos.set(p.id, { x: p.x, y: p.y });
      this.playerLastReloadMs.set(p.id, p.weapon.reloadMs);
      this.playerLastDashing.set(p.id, p.dashing);
    });

    state.bullets.forEach(b => this.recordBullet(b));

    this.prevPlayerIds = curPlayers;
    this.prevBulletIds = curBullets;
    this.prevObsIds = curObs;
    this.prevPowerUpIds = curPowerUps;
    this.hasStateSnapshot = true;
  }

  private playBulletImpactEvents(events: BulletImpactPublicState[], listener: SoundPoint): void {
    events.forEach(event => {
      if (this.playedImpactEventIds.has(event.id)) return;
      this.playedImpactEventIds.add(event.id);
      this.effects.spawnSpark(event.x, event.y);
      this.audioManager.playBulletImpact(event.material, event, listener);
    });
  }

  private playNewBulletSounds(
    bullets: BulletPublicState[],
    listener: SoundPoint,
    myPlayerId: string,
  ): void {
    const newStandardBulletsByOwner = new Map<string, NewBulletGroup>();

    bullets.forEach(bullet => {
      if (this.prevBulletIds.has(bullet.id)) return;
      if (bullet.kind === 'laser') {
        this.audioManager.playLaserFire(bullet, listener, bullet.ownerId === myPlayerId);
        return;
      }
      if (bullet.kind === 'grenade') {
        this.audioManager.playGrenadeLaunch(bullet, listener, bullet.ownerId === myPlayerId);
        return;
      }

      const group = newStandardBulletsByOwner.get(bullet.ownerId) ?? { count: 0, x: 0, y: 0 };
      group.count += 1;
      group.x += bullet.x;
      group.y += bullet.y;
      newStandardBulletsByOwner.set(
        bullet.ownerId,
        group,
      );
    });

    newStandardBulletsByOwner.forEach((group, ownerId) => {
      const sound = this.getFireSoundForBulletCount(group.count);
      if (!sound) return;

      this.audioManager.playWeaponFire(
        sound,
        {
          x: group.x / group.count,
          y: group.y / group.count,
        },
        listener,
        ownerId === myPlayerId,
      );
    });
  }

  private playLaserReflectionSounds(bullets: BulletPublicState[], listener: SoundPoint): void {
    bullets.forEach(bullet => {
      if (bullet.kind !== 'laser') return;
      if (bullet.bendX === undefined || bullet.bendY === undefined) return;

      const previous = this.bulletLastPos.get(bullet.id);
      if (previous?.laserReflected) return;

      this.audioManager.playLaserReflect(
        { x: bullet.bendX, y: bullet.bendY },
        listener,
      );
    });
  }

  private playBulletReflectionSounds(bullets: BulletPublicState[], listener: SoundPoint): void {
    bullets.forEach(bullet => {
      const reflectCount = bullet.reflectCount ?? 0;
      if (reflectCount <= 0) return;

      const previous = this.bulletLastPos.get(bullet.id);
      if ((previous?.reflectCount ?? 0) >= reflectCount) return;

      this.audioManager.playBulletImpact(
        'mirror',
        {
          x: bullet.reflectX ?? bullet.x,
          y: bullet.reflectY ?? bullet.y,
        },
        listener,
      );
    });
  }

  private playReloadSounds(state: GameState, myPlayerId: string): void {
    const localPlayer = state.players.find(player => player.id === myPlayerId);
    if (!localPlayer) return;

    const previousReloadMs = this.playerLastReloadMs.get(localPlayer.id) ?? 0;
    const currentReloadMs = localPlayer.weapon.reloadMs;

    if (previousReloadMs <= 0 && currentReloadMs > 0) {
      this.audioManager.playReloadStart();
    }

    if (previousReloadMs > 0 && currentReloadMs <= 0) {
      this.audioManager.playReloadComplete();
    }
  }

  private getFireSoundForBulletCount(count: number): WeaponFireSound | undefined {
    if (count >= 5) return 'shotgun';
    if (count >= 3) return 'triple_shot';
    if (count >= 1) return 'standard';
    return undefined;
  }

  private recordBullet(b: BulletPublicState): void {
    this.bulletLastPos.set(b.id, {
      x: b.x,
      y: b.y,
      kind: b.kind,
      explosionRadius: b.explosionRadius,
      laserReflected: b.bendX !== undefined && b.bendY !== undefined,
      reflectCount: b.reflectCount,
    });
  }
}
