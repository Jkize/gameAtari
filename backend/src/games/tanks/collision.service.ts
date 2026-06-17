import { Injectable } from '@nestjs/common';
import { Bullet } from './types/bullet.types';
import { Obstacle } from './types/map.types';
import { Player } from './types/player.types';

@Injectable()
export class CollisionService {
  private readonly EPSILON = 0.001;

  bulletVsObstacle(bullet: Bullet, obstacle: Obstacle): boolean {
    const bounds = this.getObstacleBounds(obstacle);
    const closestX = Math.max(bounds.left, Math.min(bullet.x, bounds.right));
    const closestY = Math.max(bounds.top, Math.min(bullet.y, bounds.bottom));
    const dx = bullet.x - closestX;
    const dy = bullet.y - closestY;
    return dx * dx + dy * dy <= bullet.radius * bullet.radius;
  }

  bulletVsObstacleAlongPath(
    bullet: Bullet,
    obstacle: Obstacle,
    previousX: number,
    previousY: number,
  ): boolean {
    if (this.bulletVsObstacle(bullet, obstacle)) return true;

    const bounds = this.getObstacleBounds(obstacle);
    const minX = bounds.left - bullet.radius;
    const maxX = bounds.right + bullet.radius;
    const minY = bounds.top - bullet.radius;
    const maxY = bounds.bottom + bullet.radius;
    const dx = bullet.x - previousX;
    const dy = bullet.y - previousY;

    let tMin = 0;
    let tMax = 1;

    if (dx === 0) {
      if (previousX < minX || previousX > maxX) return false;
    } else {
      const tx1 = (minX - previousX) / dx;
      const tx2 = (maxX - previousX) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    if (dy === 0) {
      if (previousY < minY || previousY > maxY) return false;
    } else {
      const ty1 = (minY - previousY) / dy;
      const ty2 = (maxY - previousY) / dy;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    return tMin <= tMax;
  }

  bulletVsPlayer(bullet: Bullet, player: Player): boolean {
    if (!player.alive || bullet.ownerId === player.id) return false;
    const dx = bullet.x - player.x;
    const dy = bullet.y - player.y;
    const minDist = bullet.radius + player.radius;
    return dx * dx + dy * dy <= minDist * minDist;
  }

  isBulletOutOfBounds(bullet: Bullet, mapWidth: number, mapHeight: number): boolean {
    return bullet.x < 0 || bullet.x > mapWidth || bullet.y < 0 || bullet.y > mapHeight;
  }

  clampPlayerToBounds(player: Player, mapWidth: number, mapHeight: number): void {
    player.x = Math.max(player.radius, Math.min(mapWidth - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(mapHeight - player.radius, player.y));
  }

  resolvePlayerVsObstacle(
    player: Player,
    obstacle: Obstacle,
    previousX = player.x,
    previousY = player.y,
  ): void {
    const r = player.radius;
    const { left, right, top, bottom } = this.getObstacleBounds(obstacle);

    const closestX = Math.max(left, Math.min(player.x, right));
    const closestY = Math.max(top, Math.min(player.y, bottom));
    const dx = player.x - closestX;
    const dy = player.y - closestY;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq > r * r) return;

    if (previousX + r <= left) {
      player.x = left - r - this.EPSILON;
      return;
    }
    if (previousX - r >= right) {
      player.x = right + r + this.EPSILON;
      return;
    }
    if (previousY + r <= top) {
      player.y = top - r - this.EPSILON;
      return;
    }
    if (previousY - r >= bottom) {
      player.y = bottom + r + this.EPSILON;
      return;
    }

    if (distanceSq > 0) {
      const distance = Math.sqrt(distanceSq);
      const push = r - distance + this.EPSILON;
      player.x += (dx / distance) * push;
      player.y += (dy / distance) * push;
      return;
    }

    const overlapLeft = player.x - left;
    const overlapRight = right - player.x;
    const overlapTop = player.y - top;
    const overlapBottom = bottom - player.y;
    const min = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (min === overlapLeft) player.x = left - r - this.EPSILON;
    else if (min === overlapRight) player.x = right + r + this.EPSILON;
    else if (min === overlapTop) player.y = top - r - this.EPSILON;
    else player.y = bottom + r + this.EPSILON;
  }

  reflectBulletFromObstacle(bullet: Bullet, obstacle: Obstacle, previousX: number, previousY: number): void {
    const { width: ow, height: oh } = obstacle;
    const { left, right, top, bottom } = this.getObstacleBounds(obstacle);
    const hitVerticalFace = previousX <= left - bullet.radius || previousX >= right + bullet.radius;

    if (hitVerticalFace) {
      bullet.dirX *= -1;
    } else if (previousY <= top - bullet.radius || previousY >= bottom + bullet.radius) {
      bullet.dirY *= -1;
    } else if (ow < oh) {
      bullet.dirX *= -1;
    } else {
      bullet.dirY *= -1;
    }

    const closestX = Math.max(left, Math.min(bullet.x, right));
    const closestY = Math.max(top, Math.min(bullet.y, bottom));
    const dx = bullet.x - closestX;
    const dy = bullet.y - closestY;

    if (hitVerticalFace || Math.abs(dx) >= Math.abs(dy)) {
      bullet.x =
        previousX < left
          ? left - bullet.radius - this.EPSILON
          : right + bullet.radius + this.EPSILON;
    } else {
      bullet.y =
        previousY < top
          ? top - bullet.radius - this.EPSILON
          : bottom + bullet.radius + this.EPSILON;
    }
  }

  private getObstacleBounds(obstacle: Obstacle): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    return {
      left: obstacle.x - obstacle.width / 2,
      right: obstacle.x + obstacle.width / 2,
      top: obstacle.y - obstacle.height / 2,
      bottom: obstacle.y + obstacle.height / 2,
    };
  }
}
