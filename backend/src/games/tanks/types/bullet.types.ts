import type { AttackWeapon } from '../events/elimination-event.types';

export enum EBulletKind {
  STANDARD = 'standard',
  TRIPLE_SHOT = 'triple_shot',
  SHOTGUN = 'shotgun',
  GRENADE = 'grenade',
  LASER = 'laser',
}

export interface Bullet {
  id: string;
  ownerId: string;
  ownerName?: string;
  weapon?: AttackWeapon;
  kind: EBulletKind;
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
