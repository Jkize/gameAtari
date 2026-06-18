import { Injectable } from '@nestjs/common';
import { CollisionService } from '../collision.service';
import { GameService } from '../game.service';
import { LASER_CONFIG } from './weapon.config';
import { Bullet } from '../types/bullet.types';
import { Obstacle } from '../types/map.types';

interface LaserSegment {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  distance: number;
  endX: number;
  endY: number;
  reflection?: { dirX: number; dirY: number; mirrorId: string };
}

@Injectable()
export class WeaponLaserService {
  constructor(
    private readonly gameService: GameService,
    private readonly collisionService: CollisionService,
  ) {}

  processBeam(bullet: Bullet, deltaTime: number): boolean {
    const { players, map } = this.gameService;
    if (!map) return false;

    const owner = players.get(bullet.ownerId);
    if (!owner?.alive) return false;

    bullet.lifeTime -= deltaTime * 1000;
    if (bullet.lifeTime <= 0) return false;

    const angle = owner.input.aimAngle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const previousOwnerX = owner.x;
    const previousOwnerY = owner.y;

    owner.x -= dirX * owner.speed * LASER_CONFIG.recoilSpeedMultiplier * deltaTime;
    owner.y -= dirY * owner.speed * LASER_CONFIG.recoilSpeedMultiplier * deltaTime;
    this.collisionService.clampPlayerToBounds(owner, map.width, map.height);

    for (const obs of map.obstacles) {
      if (obs.type === 'bush') continue;
      this.collisionService.resolvePlayerVsObstacle(owner, obs, previousOwnerX, previousOwnerY);
    }

    const originOffset = owner.radius + bullet.radius + 2;
    bullet.x = owner.x + dirX * originOffset;
    bullet.y = owner.y + dirY * originOffset;
    bullet.startX = bullet.x;
    bullet.startY = bullet.y;
    bullet.dirX = dirX;
    bullet.dirY = dirY;

    const maxDistance = bullet.maxDistance ?? LASER_CONFIG.maxDistance;
    bullet.bendX = undefined;
    bullet.bendY = undefined;

    const firstSegment = this.processSegment(bullet, bullet.x, bullet.y, dirX, dirY, maxDistance);
    bullet.endX = firstSegment.endX;
    bullet.endY = firstSegment.endY;

    const segments = [firstSegment];
    if (firstSegment.reflection) {
      const remainingDistance = Math.max(0, maxDistance - firstSegment.distance);
      const reflectedSegment = this.processSegment(
        bullet,
        firstSegment.endX + firstSegment.reflection.dirX * (bullet.radius + 0.01),
        firstSegment.endY + firstSegment.reflection.dirY * (bullet.radius + 0.01),
        firstSegment.reflection.dirX,
        firstSegment.reflection.dirY,
        remainingDistance,
        firstSegment.reflection.mirrorId,
      );

      bullet.bendX = firstSegment.endX;
      bullet.bendY = firstSegment.endY;
      bullet.endX = reflectedSegment.endX;
      bullet.endY = reflectedSegment.endY;
      segments.push(reflectedSegment);
    }

    const damage = Math.max(1, Math.ceil(LASER_CONFIG.damagePerSecond * deltaTime));
    for (const player of players.values()) {
      if (!player.alive) continue;
      if (segments.some(segment => this.beamVsPlayer(
        segment.x,
        segment.y,
        segment.dirX,
        segment.dirY,
        segment.distance,
        bullet.radius,
        player,
      ))) {
        this.gameService.damagePlayer(player, damage);
      }
    }

    return true;
  }

  private processSegment(
    bullet: Bullet,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    maxDistance: number,
    ignoredObstacleId?: string,
  ): LaserSegment {
    const map = this.gameService.map!;
    let beamEndDistance = maxDistance;
    let reflection: LaserSegment['reflection'];

    const hits = map.obstacles
      .filter(obs => obs.id !== ignoredObstacleId)
      .map(obs => ({ obs, t: this.getObstacleHitT(x, y, dirX, dirY, bullet.radius, obs, maxDistance) }))
      .filter(hit => hit.t !== null)
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

    for (const hit of hits) {
      const obs = hit.obs;
      const hitDistance = (hit.t ?? 0) * maxDistance;

      if (hitDistance > beamEndDistance) break;

      if (obs.type === 'mirror') {
        beamEndDistance = hitDistance;
        reflection = {
          dirX: obs.width >= obs.height ? dirX : -dirX,
          dirY: obs.width >= obs.height ? -dirY : dirY,
          mirrorId: obs.id,
        };
        break;
      }

      if (obs.type === 'steel') {
        if ((bullet.pierceMetalRemaining ?? 0) <= 0) {
          beamEndDistance = hitDistance;
          break;
        }

        bullet.pierceMetalRemaining = (bullet.pierceMetalRemaining ?? 0) - 1;
        const currentIndex = map.obstacles.findIndex(current => current.id === obs.id);
        if (currentIndex !== -1) map.obstacles.splice(currentIndex, 1);
        continue;
      }

      const currentIndex = map.obstacles.findIndex(current => current.id === obs.id);
      if (currentIndex !== -1) map.obstacles.splice(currentIndex, 1);
    }

    return {
      x,
      y,
      dirX,
      dirY,
      distance: beamEndDistance,
      endX: x + dirX * beamEndDistance,
      endY: y + dirY * beamEndDistance,
      reflection,
    };
  }

  private getObstacleHitT(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    radius: number,
    obstacle: Obstacle,
    maxDistance: number,
  ): number | null {
    const left = obstacle.x - obstacle.width / 2 - radius;
    const right = obstacle.x + obstacle.width / 2 + radius;
    const top = obstacle.y - obstacle.height / 2 - radius;
    const bottom = obstacle.y + obstacle.height / 2 + radius;
    const dx = dirX * maxDistance;
    const dy = dirY * maxDistance;

    let tMin = 0;
    let tMax = 1;

    if (dx === 0) {
      if (x < left || x > right) return null;
    } else {
      const tx1 = (left - x) / dx;
      const tx2 = (right - x) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    if (dy === 0) {
      if (y < top || y > bottom) return null;
    } else {
      const ty1 = (top - y) / dy;
      const ty2 = (bottom - y) / dy;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    return tMin <= tMax ? Math.max(0, tMin) : null;
  }

  private beamVsPlayer(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    distance: number,
    radius: number,
    player: { x: number; y: number; radius: number },
  ): boolean {
    const toPlayerX = player.x - x;
    const toPlayerY = player.y - y;
    const projected = Math.max(0, Math.min(distance, toPlayerX * dirX + toPlayerY * dirY));
    const closestX = x + dirX * projected;
    const closestY = y + dirY * projected;
    const dx = player.x - closestX;
    const dy = player.y - closestY;
    const hitRadius = player.radius + radius;

    return dx * dx + dy * dy <= hitRadius * hitRadius;
  }
}
