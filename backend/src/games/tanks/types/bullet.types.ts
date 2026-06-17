export interface Bullet {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  radius: number;
  lifeTime: number;
}
