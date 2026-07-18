import { BulletImpactMaterial } from '../types/game-state.types';
import { ObstacleType } from '../types/map.types';

export const GAME_TICK_INTERVAL_MS = 1000 / 60;
export const PLAYER_BROADCAST_INTERVAL_MS = 1000 / 30;
export const WATCHER_BROADCAST_INTERVAL_MS = 1000 / 15;

export const OBSTACLE_IMPACT_MATERIAL: Partial<Record<ObstacleType, BulletImpactMaterial>> = {
  wood: 'wood',
  rock: 'rock',
  steel: 'steel',
  mirror: 'mirror',
};
