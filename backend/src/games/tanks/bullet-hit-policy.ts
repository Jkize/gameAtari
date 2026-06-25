import { Bullet } from './types/bullet.types';
import { Player } from './types/player.types';

export function canBulletHitPlayer(bullet: Bullet, player: Player): boolean {
  return player.id !== bullet.ownerId || (bullet.reflectCount ?? 0) > 0;
}
