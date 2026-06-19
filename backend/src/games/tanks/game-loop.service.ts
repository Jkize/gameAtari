import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { GameService } from './game.service';
import { MapService } from './map.service';
import { CollisionService } from './collision.service';
import { WeaponService } from './weapons/weapon.service';
import { WeaponLaserService } from './weapons/weapon-laser.service';
import { WeaponGrenadeService } from './weapons/weapon-grenade.service';
import { BulletPublicState, GameState } from './types/game-state.types';
import { PlayerPublicState } from './types/player.types';
import { ActivePowerUp, ActivePowerUpPublicState } from './types/power-up.types';
import { PLAYER_ROOM, WATCHER_ROOM } from './socket-rooms';
import { applyObstacleDamage } from './obstacle.config';

const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;
const WATCHER_BROADCAST_RATE = 30;
const WATCHER_BROADCAST_INTERVAL = 1000 / WATCHER_BROADCAST_RATE;

@Injectable()
export class GameLoopService implements OnModuleDestroy {
  private server!: Server;
  private loopTimer: NodeJS.Timeout | null = null;
  private lastTickTime = 0;
  private lastWatcherBroadcastTime = 0;

  constructor(
    private readonly gameService: GameService,
    private readonly mapService: MapService,
    private readonly collisionService: CollisionService,
    private readonly weaponService: WeaponService,
    private readonly weaponLaserService: WeaponLaserService,
    private readonly weaponGrenadeService: WeaponGrenadeService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  start(): void {
    if (this.loopTimer) return;
    if (!this.gameService.map) {
      this.gameService.map = this.mapService.createMap();
    }
    this.gameService.status = 'playing';
    this.lastTickTime = Date.now();
    this.lastWatcherBroadcastTime = 0;
    this.loopTimer = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop(): void {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  buildState(): GameState {
    const { map, players, bullets, status } = this.gameService;
    const now = Date.now();

    const publicPlayers: PlayerPublicState[] = [...players.values()].map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      radius: p.radius,
      hp: p.hp,
      maxHp: p.maxHp,
      bodyAngle: p.bodyAngle,
      aimAngle: p.aimAngle,
      color: p.color,
      dashCooldownMs: Math.max(0, p.dashCooldown - (now - p.lastDashAt)),
      weapon: this.weaponService.getPublicState(p, now),
      activePowerUp: this.buildActivePowerUpState(p.activePowerUp, now),
      dashing: now < p.dashUntil,
      alive: p.alive,
    }));

    const publicBullets: BulletPublicState[] = bullets.map(b => ({
      id: b.id,
      ownerId: b.ownerId,
      kind: b.kind,
      x: b.x,
      y: b.y,
      endX: b.endX,
      endY: b.endY,
      bendX: b.bendX,
      bendY: b.bendY,
      radius: b.radius,
      explosionRadius: b.explosionRadius,
      pierceMetalRemaining: b.pierceMetalRemaining,
    }));

    return { status, map: map!, players: publicPlayers, bullets: publicBullets };
  }

  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    const { map } = this.gameService;
    if (!map) return;

    this.processPlayers(deltaTime, now);
    this.processBullets(deltaTime);
    this.checkWinCondition();
    this.broadcastState(now);
  }

  private processPlayers(deltaTime: number, now: number): void {
    const { players, bullets, map } = this.gameService;
    if (!map) return;

    for (const player of players.values()) {
      if (!player.alive) continue;

      const previousX = player.x;
      const previousY = player.y;
      const isFiringLaser = bullets.some(bullet => bullet.ownerId === player.id && bullet.kind === 'laser');

      if (isFiringLaser) {
        player.aimAngle = player.input.aimAngle;
      } else {
        this.gameService.movePlayer(player, deltaTime, now);
        this.collisionService.clampPlayerToBounds(player, map.width, map.height);
      }

      if (!isFiringLaser) {
        for (const obs of map.obstacles) {
          if (obs.type === 'bush' || obs.type === 'decoration') continue;
          this.collisionService.resolvePlayerVsObstacle(player, obs, previousX, previousY);
        }
      }

      for (let i = map.powerUps.length - 1; i >= 0; i--) {
        if (this.gameService.tryPickupPowerUp(player, map.powerUps[i], now)) {
          map.powerUps.splice(i, 1);
        }
      }

      this.gameService.tryShoot(player, now);
    }
  }

  private processBullets(deltaTime: number): void {
    const { players, bullets, map } = this.gameService;
    if (!map) return;

    const dead = new Set<string>();

    for (const bullet of bullets) {
      if (bullet.kind === 'laser') {
        if (!this.weaponLaserService.processBeam(bullet, deltaTime)) {
          dead.add(bullet.id);
        }
        continue;
      }

      const previousX = bullet.x;
      const previousY = bullet.y;

      bullet.x += bullet.dirX * bullet.speed * deltaTime;
      bullet.y += bullet.dirY * bullet.speed * deltaTime;
      bullet.lifeTime -= deltaTime * 1000;

      const reachedMaxDistance = bullet.maxDistance !== undefined &&
        bullet.startX !== undefined &&
        bullet.startY !== undefined &&
        (bullet.x - bullet.startX) ** 2 + (bullet.y - bullet.startY) ** 2 >= bullet.maxDistance ** 2;

      if (
        bullet.lifeTime <= 0 ||
        reachedMaxDistance ||
        this.collisionService.isBulletOutOfBounds(bullet, map.width, map.height)
      ) {
        if (bullet.kind === 'grenade') this.weaponGrenadeService.explode(bullet);
        dead.add(bullet.id);
        continue;
      }

      // Bullet vs obstacles
      let absorbed = false;
      for (let i = map.obstacles.length - 1; i >= 0; i--) {
        const obs = map.obstacles[i];
        if (obs.type === 'decoration') continue;
        if (obs.type === 'bush' && bullet.kind !== 'grenade') continue;
        if (!this.collisionService.bulletVsObstacleAlongPath(bullet, obs, previousX, previousY)) continue;

        if (obs.type === 'mirror') {
          this.collisionService.reflectBulletFromObstacle(bullet, obs, previousX, previousY);
          break;
        }

        if (bullet.kind === 'grenade') {
          this.weaponGrenadeService.explode(bullet);
          dead.add(bullet.id);
          absorbed = true;
          break;
        }

        dead.add(bullet.id);

        if (obs.destructible) {
          applyObstacleDamage(obs, bullet.damage);
          if (obs.hp <= 0) map.obstacles.splice(i, 1);
        }

        absorbed = true;
        break;
      }

      if (absorbed) continue;

      // Bullet vs players
      for (const player of players.values()) {
        if (!this.collisionService.bulletVsPlayer(bullet, player)) continue;
        if (bullet.kind === 'grenade') {
          this.weaponGrenadeService.explode(bullet);
        } else {
          this.gameService.damagePlayer(player, bullet.damage);
        }
        dead.add(bullet.id);
        break;
      }
    }

    this.gameService.bullets = bullets.filter(b => !dead.has(b.id));
  }

  private checkWinCondition(): void {
    const { players } = this.gameService;
    const alive = [...players.values()].filter(p => p.alive);

    if (players.size > 1 && alive.length <= 1) {
      this.gameService.status = 'finished';
      this.stop();
    }
  }

  private broadcastState(now: number): void {
    const state = this.buildState();
    this.server.to(PLAYER_ROOM).emit('gameState', state);

    if (now - this.lastWatcherBroadcastTime >= WATCHER_BROADCAST_INTERVAL) {
      this.lastWatcherBroadcastTime = now;
      this.server.to(WATCHER_ROOM).emit('gameState', state);
    }
  }

  private buildActivePowerUpState(
    activePowerUp: ActivePowerUp | undefined,
    now: number,
  ): ActivePowerUpPublicState | undefined {
    if (!activePowerUp) return undefined;

    const { expiresAt, chargeStartedAt } = activePowerUp;
    if (expiresAt !== undefined && expiresAt <= now) return undefined;

    return {
      type: activePowerUp.type,
      name: activePowerUp.name,
      remainingMs: expiresAt !== undefined ? expiresAt - now : undefined,
      shotsRemaining: activePowerUp.shotsRemaining,
      chargeMs: chargeStartedAt ? now - chargeStartedAt : undefined,
    };
  }
}
