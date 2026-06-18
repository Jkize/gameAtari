export type BulletKind = 'standard' | 'grenade' | 'laser';

export interface Bullet {
  id: string;
  ownerId: string;
  kind?: BulletKind;
  x: number;
  y: number;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  bendX?: number;
  bendY?: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  radius: number;
  lifeTime: number;
  maxDistance?: number;
  explosionRadius?: number;
  obstacleDamage?: number;
  pierceMetalRemaining?: number;
  piercedObstacleIds?: string[];
}
