import { Obstacle } from './types/map.types';

export function getObstacleHealthRatio(obstacle: Pick<Obstacle, 'hp' | 'maxHp'>): number {
  if (obstacle.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, obstacle.hp / obstacle.maxHp));
}

export function isSoftCoverObstacle(obstacle: Pick<Obstacle, 'type'>): boolean {
  return obstacle.type === 'bush' || obstacle.type === 'decoration';
}

export function applyObstacleDamage(obstacle: Obstacle, damage: number): void {
  obstacle.hp = Math.max(0, obstacle.hp - damage);
  obstacle.healthRatio = getObstacleHealthRatio(obstacle);
}
