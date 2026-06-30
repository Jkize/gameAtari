import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GameMap, Obstacle } from './types/map.types';
import { Player } from './types/player.types';
import { PowerUpSpawn, PowerUpType } from './types/power-up.types';

export const FIRST_POWER_UP_SPAWN_DELAY_MS = 12_000;
export const POWER_UP_SPAWN_INTERVAL_MS = 15_000;
export const MAX_SPAWN_ATTEMPTS = 30;
export const MIN_DISTANCE_FROM_PLAYER = 180;
export const MIN_DISTANCE_FROM_OTHER_POWERUP = 250;
export const MIN_DISTANCE_FROM_SPAWN_POINT = 180;
export const POWER_UP_PICKUP_RADIUS = 45;

const POWER_UP_RADIUS = 18;

const POWER_UP_ASSET_ID: Record<PowerUpType, string> = {
  triple_shot: 'power_triple_shot',
  shotgun: 'power_shotgun',
  grenade: 'power_grenade',
  laser: 'power_laser',
};

const POWER_UP_WEIGHTS: Array<{ type: PowerUpType; weight: number }> = [
  { type: 'triple_shot', weight: 35 },
  { type: 'shotgun', weight: 30 },
  { type: 'grenade', weight: 25 },
  { type: 'laser', weight: 10 },
];

@Injectable()
export class PowerUpSpawnService {
  maxActiveForPlayerCount(playerCount: number): number {
    if (playerCount <= 4) return 3;
    if (playerCount <= 8) return 4;
    return 5;
  }

  trySpawn(map: GameMap, players: Iterable<Player>, now: number): PowerUpSpawn | null {
    const playersInMatch = [...players];
    if (map.powerUps.length >= this.maxActiveForPlayerCount(playersInMatch.length)) return null;

    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      const candidate = {
        x: POWER_UP_RADIUS + Math.random() * (map.width - POWER_UP_RADIUS * 2),
        y: POWER_UP_RADIUS + Math.random() * (map.height - POWER_UP_RADIUS * 2),
      };
      if (!this.isValidSpawn(candidate.x, candidate.y, map, playersInMatch)) continue;
      return this.createPowerUp(candidate.x, candidate.y, now);
    }

    return null;
  }

  isPickupValid(player: Player, powerUp: PowerUpSpawn): boolean {
    const dx = player.x - powerUp.x;
    const dy = player.y - powerUp.y;
    return dx * dx + dy * dy <= POWER_UP_PICKUP_RADIUS * POWER_UP_PICKUP_RADIUS;
  }

  private isValidSpawn(x: number, y: number, map: GameMap, players: Player[]): boolean {
    if (
      x < POWER_UP_RADIUS ||
      y < POWER_UP_RADIUS ||
      x > map.width - POWER_UP_RADIUS ||
      y > map.height - POWER_UP_RADIUS
    ) {
      return false;
    }

    if (players.some(player => this.distanceSq(x, y, player.x, player.y) < MIN_DISTANCE_FROM_PLAYER ** 2)) {
      return false;
    }

    if (map.powerUps.some(powerUp =>
      this.distanceSq(x, y, powerUp.x, powerUp.y) < MIN_DISTANCE_FROM_OTHER_POWERUP ** 2,
    )) {
      return false;
    }

    if (map.spawnPoints?.some(spawn =>
      this.distanceSq(x, y, spawn.x, spawn.y) < MIN_DISTANCE_FROM_SPAWN_POINT ** 2,
    )) {
      return false;
    }

    return !map.obstacles.some(obstacle => this.overlapsBlockingObstacle(x, y, obstacle));
  }

  private overlapsBlockingObstacle(x: number, y: number, obstacle: Obstacle): boolean {
    if (obstacle.type === 'bush' || obstacle.type === 'decoration') return false;

    const left = obstacle.x - obstacle.width / 2;
    const right = obstacle.x + obstacle.width / 2;
    const top = obstacle.y - obstacle.height / 2;
    const bottom = obstacle.y + obstacle.height / 2;
    const closestX = Math.max(left, Math.min(x, right));
    const closestY = Math.max(top, Math.min(y, bottom));
    return this.distanceSq(x, y, closestX, closestY) <= POWER_UP_RADIUS * POWER_UP_RADIUS;
  }

  private createPowerUp(x: number, y: number, now: number): PowerUpSpawn {
    const type = this.pickWeightedType();
    return {
      id: uuidv4(),
      type,
      assetId: POWER_UP_ASSET_ID[type],
      x,
      y,
      radius: POWER_UP_RADIUS,
      createdAt: now,
    };
  }

  private pickWeightedType(): PowerUpType {
    const totalWeight = POWER_UP_WEIGHTS.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const item of POWER_UP_WEIGHTS) {
      roll -= item.weight;
      if (roll <= 0) return item.type;
    }
    return POWER_UP_WEIGHTS[POWER_UP_WEIGHTS.length - 1].type;
  }

  private distanceSq(ax: number, ay: number, bx: number, by: number): number {
    return (ax - bx) ** 2 + (ay - by) ** 2;
  }
}
