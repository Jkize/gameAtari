import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '../../common/socket-events';
import { DevelopmentSettingsService } from '../../config/development-settings.service';
import { CollisionService } from './collision.service';
import { GameService } from './game.service';
import { MapService } from './maps/map.service';
import { applyObstacleDamage, isSoftCoverObstacle } from './obstacle.utils';
import { GameSessionsService } from './runtime/game-sessions.service';
import { BulletImpactMaterial, BulletImpactPublicState, BulletPublicState, GameState, InitialGameState } from './types/game-state.types';
import { ObstacleType } from './types/map.types';
import { ActivePowerUp, ActivePowerUpPublicState } from './types/power-up.types';
import { PlayerPublicState } from './types/player.types';
import { WeaponGrenadeService } from './weapons/weapon-grenade.service';
import { WeaponLaserService } from './weapons/weapon-laser.service';
import { WeaponService } from './weapons/weapon.service';
import { canBulletHitPlayer } from './bullet-hit-policy';
import { PowerUpSpawnService } from './power-up-spawn.service';
import { DangerZoneService } from './danger-zone.service';
import { GameEventPublisherService } from './events/game-event-publisher.service';
import { WatcherPresenceService } from './events/watcher-presence.service';
import {
  GAME_TICK_INTERVAL_MS,
  OBSTACLE_IMPACT_MATERIAL,
  PLAYER_BROADCAST_INTERVAL_MS,
  WATCHER_BROADCAST_INTERVAL_MS,
} from './config/game-loop.config';
import { DESTROYED_BODY_TTL_MS, SHIELD_COOLDOWN_MS, SHIELD_HP } from './config/player.config';
import { FIRST_POWER_UP_SPAWN_DELAY_MS, POWER_UP_SPAWN_INTERVAL_MS } from './config/power-up.config';

interface LoopRuntime {
  timer: NodeJS.Timeout;
  lastTickTime: number;
  lastPlayerBroadcastTime: number;
  lastWatcherBroadcastTime: number;
  pendingWatcherImpactEvents: BulletImpactPublicState[];
  lastNetLogTime: number;
  avgTickMs: number;
  delayedTicks: number;
  nextPowerUpSpawnAt?: number;
}

export interface TickMetrics {
  targetMs: number;
  averageMs: number;
  delayedTicks: number;
}

@Injectable()
export class GameLoopService implements OnModuleDestroy {
  private server!: Server;
  private readonly loops = new Map<string, LoopRuntime>();
  private finishedHandler?: (roomId: string) => Promise<void> | void;

  constructor(
    private readonly sessions: GameSessionsService,
    private readonly gameService: GameService,
    private readonly mapService: MapService,
    private readonly collisionService: CollisionService,
    private readonly weaponService: WeaponService,
    private readonly weaponLaserService: WeaponLaserService,
    private readonly weaponGrenadeService: WeaponGrenadeService,
    private readonly powerUpSpawnService: PowerUpSpawnService,
    private readonly dangerZoneService: DangerZoneService,
    private readonly developmentSettings: DevelopmentSettingsService,
    private readonly eventPublisher: GameEventPublisherService,
    private readonly watcherPresence: WatcherPresenceService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  onFinished(handler: (roomId: string) => Promise<void> | void): void {
    this.finishedHandler = handler;
  }

  prepare(
    roomId: string,
    players: Array<{ userId: string; username: string }>,
    rewardsEligible = true,
  ): void {
    const state = this.sessions.create(roomId);
    state.rewardsEligible = rewardsEligible;
    this.sessions.run(roomId, () => {
      const preparedMap = this.gameService.map;
      this.gameService.reset();
      this.gameService.map = preparedMap ?? this.mapService.createMap(players.length);
      for (const player of players) this.gameService.addPlayer(player.userId, player.username);
    });
  }

  start(roomId: string): void {
    if (this.loops.has(roomId)) return;
    this.sessions.run(roomId, () => {
      if (!this.gameService.map) this.gameService.map = this.mapService.createMap(this.gameService.players.size);
      this.gameService.status = 'playing';
      const state = this.sessions.require(roomId);
      const startedAt = Date.now();
      state.startedAt = new Date(startedAt);
      this.gameService.dangerZone = this.dangerZoneService.createRuntimeState(
        this.gameService.map,
        this.gameService.players.size,
        startedAt,
        this.developmentSettings.dangerZoneOverride(),
      );
      if (this.developmentSettings.shouldClearInitialPowerUpsOnStart()) {
        this.gameService.map.powerUps = [];
      }
    });
    const powerUps = this.developmentSettings.powerUps() ?? {
      firstSpawnDelayMs: FIRST_POWER_UP_SPAWN_DELAY_MS,
      spawnIntervalMs: POWER_UP_SPAWN_INTERVAL_MS,
    };
    const runtime: LoopRuntime = {
      timer: setInterval(() => this.tick(roomId), GAME_TICK_INTERVAL_MS),
      lastTickTime: Date.now(),
      lastPlayerBroadcastTime: 0,
      lastWatcherBroadcastTime: 0,
      pendingWatcherImpactEvents: [],
      lastNetLogTime: 0,
      avgTickMs: 0,
      delayedTicks: 0,
      nextPowerUpSpawnAt: Date.now() + powerUps.firstSpawnDelayMs,
    };
    this.loops.set(roomId, runtime);
  }

  stop(roomId: string): void {
    const runtime = this.loops.get(roomId);
    if (!runtime) return;
    clearInterval(runtime.timer);
    this.loops.delete(roomId);
  }

  remove(roomId: string): void {
    this.stop(roomId);
    this.sessions.remove(roomId);
  }

  hasSession(roomId: string): boolean {
    return Boolean(this.sessions.get(roomId));
  }

  isPlayerAlive(roomId: string, userId: string): boolean {
    return this.sessions.get(roomId)?.players.get(userId)?.alive ?? false;
  }

  addPlayer(roomId: string, userId: string, username: string): void {
    this.sessions.run(roomId, () => this.gameService.addPlayer(userId, username));
  }

  removePlayer(roomId: string, userId: string): void {
    this.sessions.run(roomId, () => this.gameService.removePlayer(userId));
  }

  applyInput(roomId: string, userId: string, input: Parameters<GameService['applyInput']>[1]): void {
    this.sessions.run(roomId, () => this.gameService.applyInput(userId, input));
  }

  buildState(roomId: string): GameState {
    return this.sessions.run(roomId, () => this.buildCurrentState());
  }

  buildInitialState(roomId: string): InitialGameState {
    return this.sessions.run(roomId, () => ({
      map: this.gameService.map!,
      state: this.buildCurrentState(),
    }));
  }

  onModuleDestroy(): void {
    for (const roomId of this.loops.keys()) this.stop(roomId);
  }

  getTickMetrics(): TickMetrics {
    const runtimes = [...this.loops.values()];
    if (runtimes.length === 0) {
      return {
        targetMs: parseFloat(GAME_TICK_INTERVAL_MS.toFixed(2)),
        averageMs: parseFloat(GAME_TICK_INTERVAL_MS.toFixed(2)),
        delayedTicks: 0,
      };
    }
    const avgMs = runtimes.reduce(
      (sum, r) => sum + (r.avgTickMs || GAME_TICK_INTERVAL_MS),
      0,
    ) / runtimes.length;
    const delayed = runtimes.reduce((sum, r) => sum + r.delayedTicks, 0);
    return {
      targetMs: parseFloat(GAME_TICK_INTERVAL_MS.toFixed(2)),
      averageMs: parseFloat(avgMs.toFixed(2)),
      delayedTicks: delayed,
    };
  }

  private tick(roomId: string): void {
    const runtime = this.loops.get(roomId);
    if (!runtime || !this.sessions.get(roomId)) return;
    this.sessions.run(roomId, () => {
      const now = Date.now();
      const deltaMs = now - runtime.lastTickTime;
      const deltaTime = Math.min(0.1, deltaMs / 1000);
      runtime.lastTickTime = now;
      runtime.avgTickMs = runtime.avgTickMs === 0 ? deltaMs : runtime.avgTickMs * 0.9 + deltaMs * 0.1;
      if (deltaMs > GAME_TICK_INTERVAL_MS + 3) runtime.delayedTicks++;
      if (!this.gameService.map) return;

      const impactStartIndex = this.gameService.impactEvents.length;
      if (this.gameService.status === 'playing') {
        this.processPowerUpSpawns(roomId, runtime, now);
        this.processPlayers(roomId, deltaTime, now);
        this.processDangerZone(deltaTime, now);
        this.processBullets(roomId, deltaTime);
        this.processHealthRegeneration(deltaTime, now);
        this.publishPendingEliminations(roomId);
        this.checkWinCondition(roomId);
      }
      runtime.pendingWatcherImpactEvents.push(...this.gameService.impactEvents.slice(impactStartIndex));
      this.broadcastState(roomId, runtime, now);
      if (this.gameService.status === 'finished' && !this.hasVisibleDestroyedBodies(now)) {
        this.stop(roomId);
      }
    });
  }

  private buildCurrentState(): GameState {
    const { map, players, bullets, status, impactEvents, dangerZone } = this.gameService;
    const now = Date.now();
    const publicPlayers: PlayerPublicState[] = [...players.values()]
      .filter(player => player.alive || this.isDestroyedBodyVisible(player.destroyedAt, now))
      .map(player => ({
        id: player.id,
        username: player.username,
        x: player.x,
        y: player.y,
        radius: player.radius,
        hp: player.hp,
        maxHp: player.maxHp,
        bodyAngle: player.bodyAngle,
        aimAngle: player.aimAngle,
        color: player.color,
        dashCooldownMs: Math.max(0, player.dashCooldown - (now - player.lastDashAt)),
        weapon: this.weaponService.getPublicState(player, now),
        activePowerUp: this.buildActivePowerUpState(player.activePowerUp, now),
        dashing: now < player.dashUntil,
        alive: player.alive,
        destroyedBodyAlpha: player.alive ? undefined : this.getDestroyedBodyAlpha(player.destroyedAt, now),
        shielding: player.shieldHp > 0 && now < player.shieldUntil,
        shieldHp: player.shieldHp > 0 && now < player.shieldUntil ? Math.max(0, player.shieldHp) : 0,
        shieldMaxHp: SHIELD_HP,
        shieldCooldownMs: Math.max(0, SHIELD_COOLDOWN_MS - (now - player.lastShieldAt)),
        shieldRemainingMs: player.shieldHp > 0 && now < player.shieldUntil
          ? Math.max(0, player.shieldUntil - now)
          : 0,
      }));
    const publicBullets: BulletPublicState[] = bullets.map(bullet => ({
      id: bullet.id,
      ownerId: bullet.ownerId,
      kind: bullet.kind,
      x: bullet.x,
      y: bullet.y,
      endX: bullet.endX,
      endY: bullet.endY,
      bendX: bullet.bendX,
      bendY: bullet.bendY,
      radius: bullet.radius,
      explosionRadius: bullet.explosionRadius,
      pierceMetalRemaining: bullet.pierceMetalRemaining,
      reflectCount: bullet.reflectCount,
      reflectX: bullet.reflectX,
      reflectY: bullet.reflectY,
    }));
    return {
      status,
      players: publicPlayers,
      bullets: publicBullets,
      powerUps: [...(map?.powerUps ?? [])],
      impactEvents: [...impactEvents],
      dangerZone: dangerZone ? this.dangerZoneService.buildPublicState(dangerZone, now) : undefined,
    };
  }

  private processPowerUpSpawns(roomId: string, runtime: LoopRuntime, now: number): void {
    if (runtime.nextPowerUpSpawnAt === undefined) return;
    if (now < runtime.nextPowerUpSpawnAt) return;

    const powerUps = this.developmentSettings.powerUps() ?? {
      firstSpawnDelayMs: FIRST_POWER_UP_SPAWN_DELAY_MS,
      spawnIntervalMs: POWER_UP_SPAWN_INTERVAL_MS,
    };
    runtime.nextPowerUpSpawnAt = now + powerUps.spawnIntervalMs;
    const { map, players } = this.gameService;
    if (!map) return;

    const powerUp = this.powerUpSpawnService.trySpawn(map, players.values(), now);
    if (!powerUp) return;

    map.powerUps.push(powerUp);
    this.server.to(`game:${roomId}:players`).emit(SOCKET_EVENTS.POWER_UP.SPAWNED, powerUp);
    this.server.to(`game:${roomId}:watchers`).emit(SOCKET_EVENTS.POWER_UP.SPAWNED, powerUp);
  }

  private processPlayers(roomId: string, deltaTime: number, now: number): void {
    const { players, bullets, map } = this.gameService;
    if (!map) return;
    for (const player of players.values()) {
      if (!player.alive) continue;
      const previousX = player.x;
      const previousY = player.y;
      const firingLaser = bullets.some(bullet => bullet.ownerId === player.id && bullet.kind === 'laser');
      if (!firingLaser) {
        this.gameService.movePlayer(player, deltaTime, now);
        this.collisionService.clampPlayerToBounds(player, map.width, map.height);
        for (const obstacle of map.obstacles) {
          if (!isSoftCoverObstacle(obstacle)) {
            this.collisionService.resolvePlayerVsObstacle(player, obstacle, previousX, previousY);
          }
        }
      }
      for (let index = map.powerUps.length - 1; index >= 0; index--) {
        const powerUp = map.powerUps[index];
        if (this.gameService.tryPickupPowerUp(player, powerUp, now)) {
          map.powerUps.splice(index, 1);
          this.server.to(`game:${roomId}:players`).emit(SOCKET_EVENTS.POWER_UP.COLLECTED, {
            powerUpId: powerUp.id,
            playerId: player.id,
          });
          this.server.to(`game:${roomId}:watchers`).emit(SOCKET_EVENTS.POWER_UP.COLLECTED, {
            powerUpId: powerUp.id,
            playerId: player.id,
          });
        }
      }
      this.gameService.tryShoot(player, now);
    }
  }

  private processDangerZone(deltaTime: number, now: number): void {
    const zone = this.gameService.dangerZone;
    if (!zone) return;
    const phase = this.dangerZoneService.phaseAt(zone, now);
    if (phase === 'inactive' || phase === 'warning') return;

    const damage = zone.damagePerSecond * deltaTime;
    if (damage <= 0) return;

    for (const player of this.gameService.players.values()) {
      if (!player.alive) continue;
      if (!this.dangerZoneService.isOutside(zone, player.x, player.y, now)) {
        zone.damageCarryByPlayerId[player.id] = 0;
        continue;
      }

      const carried = (zone.damageCarryByPlayerId[player.id] ?? 0) + damage;
      const wholeDamage = Math.floor(carried);
      zone.damageCarryByPlayerId[player.id] = carried - wholeDamage;
      if (wholeDamage > 0) this.gameService.damagePlayerDirect(player, wholeDamage, now);
    }
  }

  private processHealthRegeneration(deltaTime: number, now: number): void {
    const zone = this.gameService.dangerZone;
    const zoneIsDamaging = zone
      ? !['inactive', 'warning'].includes(this.dangerZoneService.phaseAt(zone, now))
      : false;

    for (const player of this.gameService.players.values()) {
      const outsideDangerZone = zone && zoneIsDamaging
        ? this.dangerZoneService.isOutside(zone, player.x, player.y, now)
        : false;
      if (outsideDangerZone) {
        this.gameService.resetHealthRegeneration(player);
        continue;
      }
      this.gameService.regeneratePlayerHealth(player, deltaTime, now);
    }
  }

  private processBullets(roomId: string, deltaTime: number): void {
    const { players, bullets, map } = this.gameService;
    if (!map) return;
    const dead = new Set<string>();
    for (const bullet of bullets) {
      if (bullet.kind === 'laser') {
        const result = this.weaponLaserService.processBeam(bullet, deltaTime);
        this.emitObstacleChanges(roomId, result.obstacleChanges);
        if (!result.alive) dead.add(bullet.id);
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
        if (bullet.kind === 'grenade') this.handleGrenadeExplosion(roomId, bullet);
        else this.recordBulletImpact(bullet, 'spark');
        dead.add(bullet.id);
        continue;
      }

      let absorbed = false;
      for (let index = map.obstacles.length - 1; index >= 0; index--) {
        const obstacle = map.obstacles[index];
        if (isSoftCoverObstacle(obstacle)) continue;
        if (!this.collisionService.bulletVsObstacleAlongPath(bullet, obstacle, previousX, previousY)) continue;
        if (obstacle.type === 'mirror') {
          this.collisionService.reflectBulletFromObstacle(bullet, obstacle, previousX, previousY);
          bullet.reflectCount = (bullet.reflectCount ?? 0) + 1;
          bullet.reflectX = bullet.x;
          bullet.reflectY = bullet.y;
          break;
        }
        if (bullet.kind === 'grenade') this.handleGrenadeExplosion(roomId, bullet);
        else {
          this.recordBulletImpact(bullet, this.getObstacleImpactMaterial(obstacle.type));
          if (obstacle.destructible) {
            applyObstacleDamage(obstacle, bullet.damage);
            if (obstacle.hp <= 0) {
              map.obstacles.splice(index, 1);
              this.emitObstacleDestroyed(roomId, obstacle.id);
            } else {
              this.emitObstacleDamaged(roomId, obstacle);
            }
          }
        }
        dead.add(bullet.id);
        absorbed = true;
        break;
      }
      if (absorbed) continue;
      for (const player of players.values()) {
        if (!canBulletHitPlayer(bullet, player)) continue;
        if (!this.collisionService.bulletVsPlayer(bullet, player)) continue;
        if (bullet.kind === 'grenade') this.handleGrenadeExplosion(roomId, bullet);
        else {
          const now = Date.now();
          const hitShield = player.shieldHp > 0 && now < player.shieldUntil;
          this.gameService.damagePlayer(player, bullet.damage, {
            attackerId: bullet.ownerId,
            attackerName: bullet.ownerName,
            cause: (bullet.reflectCount ?? 0) > 0 ? 'reflected_projectile' : 'projectile',
            weapon: bullet.weapon ?? 'standard',
          }, now);
          this.recordBulletImpact(bullet, hitShield ? 'shield' : 'spark');
        }
        dead.add(bullet.id);
        break;
      }
    }
    this.gameService.bullets = bullets.filter(bullet => !dead.has(bullet.id));
  }

  private checkWinCondition(roomId: string): void {
    const alive = [...this.gameService.players.values()].filter(player => player.alive);
    const initialPlayerCount = this.sessions.require(roomId).stats.size;
    if (initialPlayerCount > 1 && alive.length <= 1) {
      this.gameService.status = 'finished';
      this.sessions.require(roomId).endedAt = new Date();
      void this.finishedHandler?.(roomId);
    }
  }

  private publishPendingEliminations(roomId: string): void {
    const events = this.sessions.require(roomId).eliminationEvents.splice(0);
    this.eventPublisher.publishEliminations(roomId, events);
    if (events.length > 0) this.watcherPresence.refresh(roomId);
  }

  private broadcastState(roomId: string, runtime: LoopRuntime, now: number): void {
    const shouldBroadcastPlayers = now - runtime.lastPlayerBroadcastTime >= PLAYER_BROADCAST_INTERVAL_MS;
    const shouldBroadcastWatchers = now - runtime.lastWatcherBroadcastTime >= WATCHER_BROADCAST_INTERVAL_MS;

    if (shouldBroadcastPlayers) {
      runtime.lastPlayerBroadcastTime = now;
      const state = this.buildCurrentState();
      this.server.to(`game:${roomId}:players`).emit(SOCKET_EVENTS.GAME.STATE, state);
      this.logNetworkSnapshot(roomId, 'players', state, PLAYER_BROADCAST_INTERVAL_MS, now, runtime);
      this.gameService.impactEvents = [];
    }

    if (shouldBroadcastWatchers) {
      runtime.lastWatcherBroadcastTime = now;
      const state = {
        ...this.buildCurrentState(),
        impactEvents: [...runtime.pendingWatcherImpactEvents],
      };
      this.server.to(`game:${roomId}:watchers`).emit(SOCKET_EVENTS.GAME.STATE, state);
      this.logNetworkSnapshot(roomId, 'watchers', state, WATCHER_BROADCAST_INTERVAL_MS, now, runtime);
      runtime.pendingWatcherImpactEvents = [];
    }
  }

  private emitObstacleDamaged(roomId: string, obstacle: { id: string; hp: number; healthRatio: number }): void {
    const payload = { id: obstacle.id, hp: obstacle.hp, healthRatio: obstacle.healthRatio };
    this.server.to(`game:${roomId}:players`).emit(SOCKET_EVENTS.OBSTACLE.DAMAGED, payload);
    this.server.to(`game:${roomId}:watchers`).emit(SOCKET_EVENTS.OBSTACLE.DAMAGED, payload);
  }

  private handleGrenadeExplosion(roomId: string, bullet: Parameters<WeaponGrenadeService['explode']>[0]): void {
    this.emitObstacleChanges(roomId, this.weaponGrenadeService.explode(bullet));
  }

  private emitObstacleChanges(
    roomId: string,
    changes: Array<{ id: string; hp: number; healthRatio: number; destroyed: boolean }>,
  ): void {
    for (const change of changes) {
      if (change.destroyed) this.emitObstacleDestroyed(roomId, change.id);
      else this.emitObstacleDamaged(roomId, change);
    }
  }

  private emitObstacleDestroyed(roomId: string, obstacleId: string): void {
    const payload = { id: obstacleId };
    this.server.to(`game:${roomId}:players`).emit(SOCKET_EVENTS.OBSTACLE.DESTROYED, payload);
    this.server.to(`game:${roomId}:watchers`).emit(SOCKET_EVENTS.OBSTACLE.DESTROYED, payload);
  }

  private logNetworkSnapshot(
    roomId: string,
    audience: 'players' | 'watchers',
    payload: GameState,
    intervalMs: number,
    now: number,
    runtime: LoopRuntime,
  ): void {
    if (!this.developmentSettings.networkLogsEnabled() || now - runtime.lastNetLogTime < 1000) return;
    runtime.lastNetLogTime = now;
    const socketRoom = `game:${roomId}:${audience}`;
    const recipientCount = this.server.sockets.adapter.rooms.get(socketRoom)?.size ?? 0;
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const snapshotsPerSecond = 1000 / intervalMs;
    const mbPerSecond = (bytes * snapshotsPerSecond * recipientCount) / 1024 / 1024;
    console.log(
      `[net] room=${roomId} audience=${audience} gameState=${(bytes / 1024).toFixed(2)}KB hz=${snapshotsPerSecond.toFixed(1)} recipients=${recipientCount} estOut=${mbPerSecond.toFixed(2)}MB/s`,
    );
  }

  private recordBulletImpact(bullet: { id: string; x: number; y: number }, material: BulletImpactMaterial): void {
    this.gameService.impactEvents.push({
      id: `${bullet.id}:${this.gameService.impactEvents.length}`,
      bulletId: bullet.id,
      material,
      x: bullet.x,
      y: bullet.y,
    });
  }

  private getObstacleImpactMaterial(type: ObstacleType): BulletImpactMaterial {
    return OBSTACLE_IMPACT_MATERIAL[type] ?? 'spark';
  }

  private isDestroyedBodyVisible(destroyedAt: number | undefined, now: number): boolean {
    return destroyedAt !== undefined && now - destroyedAt < DESTROYED_BODY_TTL_MS;
  }

  private hasVisibleDestroyedBodies(now: number): boolean {
    return [...this.gameService.players.values()].some(player =>
      this.isDestroyedBodyVisible(player.destroyedAt, now),
    );
  }

  private getDestroyedBodyAlpha(destroyedAt: number | undefined, now: number): number {
    if (destroyedAt === undefined) return 0;
    return Math.max(0, DESTROYED_BODY_TTL_MS - (now - destroyedAt)) / DESTROYED_BODY_TTL_MS;
  }

  private buildActivePowerUpState(
    activePowerUp: ActivePowerUp | undefined,
    now: number,
  ): ActivePowerUpPublicState | undefined {
    if (!activePowerUp || (activePowerUp.expiresAt !== undefined && activePowerUp.expiresAt <= now)) {
      return undefined;
    }
    return {
      type: activePowerUp.type,
      name: activePowerUp.name,
      remainingMs: activePowerUp.expiresAt !== undefined ? activePowerUp.expiresAt - now : undefined,
      shotsRemaining: activePowerUp.shotsRemaining,
      chargeMs: activePowerUp.chargeStartedAt ? now - activePowerUp.chargeStartedAt : undefined,
    };
  }
}
