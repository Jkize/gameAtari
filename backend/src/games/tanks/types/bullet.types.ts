import type { AttackWeapon } from '../events/elimination-event.types';

export type BulletKind = 'standard' | 'grenade' | 'laser';

export interface Bullet {
  id: string;
  ownerId: string;
  ownerName?: string;
  weapon?: AttackWeapon;
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
  reflectCount?: number;
  reflectX?: number;
  reflectY?: number;
}
