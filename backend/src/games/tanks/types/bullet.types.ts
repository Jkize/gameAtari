export type BulletKind = 'standard' | 'grenade';

export interface Bullet {
  id: string;
  ownerId: string;
  kind?: BulletKind;
  x: number;
  y: number;
  startX?: number;
  startY?: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  radius: number;
  lifeTime: number;
  maxDistance?: number;
  explosionRadius?: number;
  obstacleDamage?: number;
}
