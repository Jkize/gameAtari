import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { GameService } from './game.service';
import { MapService } from './map.service';
import { CollisionService } from './collision.service';
import { BulletPublicState, GameState } from './types/game-state.types';
import { PlayerPublicState } from './types/player.types';

const TICK_RATE = 30;
const TICK_INTERVAL = 1000 / TICK_RATE;

@Injectable()
export class GameLoopService implements OnModuleDestroy {
  private server: Server;
  private loopTimer: NodeJS.Timeout | null = null;
  private lastTickTime = 0;

  constructor(
    private readonly gameService: GameService,
    private readonly mapService: MapService,
    private readonly collisionService: CollisionService,
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

  private tick(): void {
    const now = Date.now();
    const deltaTime = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    const { players, bullets, map } = this.gameService;
    if (!map) return;

    // --- Players ---
    for (const player of players.values()) {
      if (!player.alive) continue;

      const previousX = player.x;
      const previousY = player.y;

      this.gameService.movePlayer(player, deltaTime, now);
      this.collisionService.clampPlayerToBounds(player, map.width, map.height);

      for (const obs of map.obstacles) {
        if (obs.type === 'bush') continue;
        this.collisionService.resolvePlayerVsObstacle(player, obs, previousX, previousY);
      }

      this.gameService.tryShoot(player, now);
    }

    // --- Bullets ---
    const dead = new Set<string>();

    for (const bullet of bullets) {
      const previousX = bullet.x;
      const previousY = bullet.y;

      bullet.x += bullet.dirX * bullet.speed * deltaTime;
      bullet.y += bullet.dirY * bullet.speed * deltaTime;
      bullet.lifeTime -= deltaTime * 1000;

      if (
        bullet.lifeTime <= 0 ||
        this.collisionService.isBulletOutOfBounds(bullet, map.width, map.height)
      ) {
        dead.add(bullet.id);
        continue;
      }

      // Bullet vs obstacles
      let absorbed = false;
      for (let i = map.obstacles.length - 1; i >= 0; i--) {
        const obs = map.obstacles[i];
        if (!this.collisionService.bulletVsObstacleAlongPath(bullet, obs, previousX, previousY)) continue;

        if (obs.type === 'mirror') {
          this.collisionService.reflectBulletFromObstacle(bullet, obs, previousX, previousY);
          break;
        }

        dead.add(bullet.id);

        if (obs.destructible) {
          obs.hp -= bullet.damage;
          if (obs.hp <= 0) map.obstacles.splice(i, 1);
        }

        absorbed = true;
        break;
      }

      if (absorbed) continue;

      // Bullet vs players
      for (const player of players.values()) {
        if (!this.collisionService.bulletVsPlayer(bullet, player)) continue;
        this.gameService.damagePlayer(player, bullet.damage);
        dead.add(bullet.id);
        break;
      }
    }

    this.gameService.bullets = bullets.filter(b => !dead.has(b.id));

    // --- Win condition ---
    const alive = [...players.values()].filter(p => p.alive);
    if (players.size > 1 && alive.length <= 1) {
      this.gameService.status = 'finished';
      this.stop();
    }

    // --- Broadcast ---
    this.server.emit('gameState', this.buildState());
  }

  private buildState(): GameState {
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
      dashing: now < p.dashUntil,
      alive: p.alive,
    }));

    const publicBullets: BulletPublicState[] = bullets.map(b => ({
      id: b.id,
      ownerId: b.ownerId,
      x: b.x,
      y: b.y,
      radius: b.radius,
    }));

    return { status, map: map!, players: publicPlayers, bullets: publicBullets };
  }
}
