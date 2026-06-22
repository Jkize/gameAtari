import { Injectable } from '@nestjs/common';
import { GameService } from '../game.service';
import { Bullet } from '../types/bullet.types';
import { applyObstacleDamage, isSoftCoverObstacle } from '../obstacle.config';

@Injectable()
export class WeaponGrenadeService {
  constructor(private readonly gameService: GameService) {}

  explode(bullet: Bullet): void {
    const { players, map } = this.gameService;
    if (!map) return;

    const radius = bullet.explosionRadius ?? 120;
    const radiusSq = radius * radius;

    for (const player of players.values()) {
      if (!player.alive) continue;
      const dx = player.x - bullet.x;
      const dy = player.y - bullet.y;
      const centerDistance = Math.sqrt(dx * dx + dy * dy);
      const edgeDistance = Math.max(0, centerDistance - player.radius);
      if (edgeDistance > radius) continue;

      const falloff = 1 - edgeDistance / radius;
      this.gameService.damagePlayer(player, Math.ceil(bullet.damage * (0.45 + falloff * 0.55)));
    }

    for (let i = map.obstacles.length - 1; i >= 0; i--) {
      const obs = map.obstacles[i];
      if (isSoftCoverObstacle(obs)) continue;
      if (!obs.destructible) continue;

      const closestX = Math.max(obs.x - obs.width / 2, Math.min(bullet.x, obs.x + obs.width / 2));
      const closestY = Math.max(obs.y - obs.height / 2, Math.min(bullet.y, obs.y + obs.height / 2));
      const dx = bullet.x - closestX;
      const dy = bullet.y - closestY;
      if (dx * dx + dy * dy > radiusSq) continue;

      applyObstacleDamage(obs, bullet.obstacleDamage ?? bullet.damage);
      if (obs.hp <= 0) map.obstacles.splice(i, 1);
    }
  }
}
