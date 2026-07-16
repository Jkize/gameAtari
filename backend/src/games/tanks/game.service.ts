import { Injectable } from '@nestjs/common';
import { Player, PlayerInput } from './types/player.types';
import { Bullet } from './types/bullet.types';
import { GameMap } from './types/map.types';
import { BulletImpactPublicState, GameStatus } from './types/game-state.types';
import { WeaponService } from './weapons/weapon.service';
import { PowerUpSpawn } from './types/power-up.types';
import { GameRuntimeContext } from './runtime/game-runtime-context.service';
import { PowerUpSpawnService } from './power-up-spawn.service';
import type { DangerZoneRuntimeState } from './danger-zone.service';
import { DamageSource } from './events/elimination-event.types';
import { EliminationService } from './events/elimination.service';

const PLAYER_SPEED   = 200;  // px/sec
const DASH_MULTIPLIER = 4;
const DASH_DURATION = 300; // ms
const DASH_COOLDOWN = 5000; // ms
export const DESTROYED_BODY_TTL_MS = 10000;
export const SHIELD_HP = 35;
export const SHIELD_DURATION_MS = 3500;
export const SHIELD_COOLDOWN_MS = 8000;
const PLAYER_RADIUS  = 28;
const PLAYER_HP      = 100;
export const PLAYER_COLORS = [
  0x00ff88, // neon green
  0xff3b30, // red
  0x3498db, // blue
  0xf1c40f, // yellow
  0x9b59b6, // purple
  0xe67e22, // orange
  0x1abc9c, // turquoise
  0xff66cc, // pink
  0xecf0f1, // off-white
  0x2ecc71, // light green
  0x00d9ff, // cyan
  0xff0066, // magenta
  0xc0392b, // dark red
  0x95a5a6, // grey
  0x8e44ad, // dark violet
];

@Injectable()
export class GameService {
  constructor(
    private readonly weaponService: WeaponService,
    private readonly runtime: GameRuntimeContext,
    private readonly powerUpSpawnService: PowerUpSpawnService,
    private readonly eliminations: EliminationService,
  ) {}

  get players(): Map<string, Player> { return this.runtime.current().players; }
  get bullets(): Bullet[] { return this.runtime.current().bullets; }
  set bullets(value: Bullet[]) { this.runtime.current().bullets = value; }
  get impactEvents(): BulletImpactPublicState[] { return this.runtime.current().impactEvents; }
  set impactEvents(value: BulletImpactPublicState[]) { this.runtime.current().impactEvents = value; }
  get map(): GameMap | null { return this.runtime.current().map; }
  set map(value: GameMap | null) { this.runtime.current().map = value; }
  get dangerZone(): DangerZoneRuntimeState | null { return this.runtime.current().dangerZone; }
  set dangerZone(value: DangerZoneRuntimeState | null) { this.runtime.current().dangerZone = value; }
  get status(): GameStatus { return this.runtime.current().status; }
  set status(value: GameStatus) { this.runtime.current().status = value; }
  private get usedColorIndices(): Set<number> { return this.runtime.current().usedColorIndices; }

  addPlayer(userId: string, username?: string): Player {
    const existing = this.players.get(userId);
    if (existing) return existing;

    const spawnPoints = this.map?.spawnPoints;
    if (!spawnPoints?.length) {
      throw new Error('Cannot add player without map spawn points');
    }
    const spawn = spawnPoints[this.players.size % spawnPoints.length];
    const colorIndex = this.pickColorIndex();

    const player: Player = {
      id: userId,
      username,
      x: spawn.x,
      y: spawn.y,
      radius: PLAYER_RADIUS,
      speed: PLAYER_SPEED,
      hp: PLAYER_HP,
      maxHp: PLAYER_HP,
      bodyAngle: -Math.PI / 2,
      aimAngle: 0,
      color: PLAYER_COLORS[colorIndex],
      input: { moveX: 0, moveY: 0, aimAngle: 0, shoot: false, dash: false, reload: false, shield: false },
      weapon: this.weaponService.createDefaultWeapon(),
      activePowerUp: undefined,
      lastDashAt: -DASH_COOLDOWN,
      dashUntil: 0,
      dashCooldown: DASH_COOLDOWN,
      shieldHp: 0,
      shieldUntil: 0,
      lastShieldAt: -SHIELD_COOLDOWN_MS,
      alive: true,
      destroyedAt: undefined,
    };

    this.players.set(userId, player);
    this.runtime.current().stats.set(userId, {
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
    });
    return player;
  }

  removePlayer(userId: string): void {
    const player = this.players.get(userId);
    if (player) {
      const idx = PLAYER_COLORS.indexOf(player.color);
      if (idx !== -1) this.usedColorIndices.delete(idx);
    }
    this.players.delete(userId);
    this.runtime.current().recentExternalDamage.delete(userId);
  }

  private pickColorIndex(): number {
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      if (!this.usedColorIndices.has(i)) {
        this.usedColorIndices.add(i);
        return i;
      }
    }
    return 0;
  }

  applyInput(userId: string, raw: Partial<PlayerInput>): void {
    const player = this.players.get(userId);
    if (!player || !player.alive) return;

    player.input.moveX    = this.clamp(Number(raw.moveX)    || 0, -1, 1);
    player.input.moveY    = this.clamp(Number(raw.moveY)    || 0, -1, 1);
    player.input.aimAngle = isFinite(Number(raw.aimAngle))  ? Number(raw.aimAngle) : player.aimAngle;
    player.input.shoot    = raw.shoot === true;
    player.input.dash     = raw.dash === true;
    player.input.reload   = raw.reload === true;
    player.input.shield   = raw.shield === true;

    const now = Date.now();
    if (player.input.dash) {
      this.tryDash(player, now);
      player.input.dash = false;
    }
    if (player.input.reload) {
      this.weaponService.tryManualReload(player, now);
      player.input.reload = false;
    }
    if (player.input.shield) {
      this.tryShield(player, now);
      player.input.shield = false;
    }
  }

  movePlayer(player: Player, deltaTime: number, now = Date.now()): void {
    let { moveX, moveY, aimAngle } = player.input;

    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
      player.bodyAngle = Math.atan2(moveY, moveX);
    }

    const speed = now < player.dashUntil ? player.speed * DASH_MULTIPLIER : player.speed;
    player.x += moveX * speed * deltaTime;
    player.y += moveY * speed * deltaTime;
    player.aimAngle = aimAngle;
  }

  tryShoot(player: Player, now: number): void {
    const bullets = this.weaponService.tryShoot(player, this.bullets, now);
    this.bullets.push(...bullets);
  }

  tryPickupPowerUp(player: Player, powerUp: PowerUpSpawn, now: number): boolean {
    if (!this.powerUpSpawnService.isPickupValid(player, powerUp)) return false;

    this.weaponService.applyPowerUp(player, powerUp.type, now);
    return true;
  }

  damagePlayer(
    player: Player,
    amount: number,
    source: DamageSource = { cause: 'projectile', weapon: 'standard' },
    now = Date.now(),
  ): void {
    if (!player.alive) return;

    if (player.shieldHp > 0 && now < player.shieldUntil) {
      const absorbed = Math.min(player.shieldHp, amount);
      player.shieldHp -= absorbed;
      amount -= absorbed;
    }

    if (amount <= 0) return;

    this.applyHpDamage(player, amount, now, source);
  }

  damagePlayerDirect(player: Player, amount: number, now = Date.now()): void {
    if (!player.alive || amount <= 0) return;
    this.applyHpDamage(player, amount, now, { cause: 'danger_zone' });
  }

  private applyHpDamage(player: Player, amount: number, now: number, source: DamageSource): void {
    const appliedDamage = Math.min(player.hp, amount);
    player.hp = Math.max(0, player.hp - amount);
    const victimStats = this.runtime.current().stats.get(player.id);
    if (victimStats) victimStats.damageTaken += appliedDamage;
    if (source.attackerId && source.attackerId !== player.id) {
      const attackerStats = this.runtime.current().stats.get(source.attackerId);
      if (attackerStats) attackerStats.damageDealt += appliedDamage;
    }
    this.eliminations.recordExternalDamage(player.id, source, now);
    if (player.hp === 0) {
      player.alive = false;
      player.destroyedAt = now;
      if (victimStats) victimStats.deaths += 1;
      const elimination = this.eliminations.recordElimination(player, source, now);
      if (elimination.creditedKillerId) {
        const attackerStats = this.runtime.current().stats.get(elimination.creditedKillerId);
        if (attackerStats) attackerStats.kills += 1;
      }
      this.runtime.current().eliminationOrder.push(player.id);
      player.input.shoot = false;
      player.input.dash = false;
      player.input.reload = false;
      player.input.shield = false;
    }
  }

  reset(): void {
    this.players.clear();
    this.bullets = [];
    this.impactEvents = [];
    this.runtime.current().eliminationEvents = [];
    this.runtime.current().recentExternalDamage.clear();
    this.map = null;
    this.status = 'waiting';
    this.usedColorIndices.clear();
    this.runtime.current().startedAt = null;
    this.runtime.current().endedAt = null;
    this.runtime.current().dangerZone = null;
    this.runtime.current().eliminationOrder = [];
    this.runtime.current().stats.clear();
    this.runtime.current().persisted = false;
  }

  private clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  private tryShield(player: Player, now: number): void {
    if (now < player.shieldUntil) return;
    if (now - player.lastShieldAt < SHIELD_COOLDOWN_MS) return;
    player.shieldUntil = now + SHIELD_DURATION_MS;
    player.lastShieldAt = player.shieldUntil; // cooldown starts when shield ends
    player.shieldHp = SHIELD_HP;
  }

  private tryDash(player: Player, now: number): void {
    const { moveX, moveY } = player.input;
    const isMoving = moveX * moveX + moveY * moveY > 0;
    if (!isMoving) return;
    if (now - player.lastDashAt < player.dashCooldown) return;

    player.lastDashAt = now;
    player.dashUntil = now + DASH_DURATION;
  }
}
