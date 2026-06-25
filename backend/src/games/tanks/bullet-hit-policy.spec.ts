import { canBulletHitPlayer } from './bullet-hit-policy';
import { Bullet } from './types/bullet.types';
import { Player } from './types/player.types';

describe('canBulletHitPlayer', () => {
  const owner = { id: 'owner' } as Player;
  const opponent = { id: 'opponent' } as Player;
  const bullet = { ownerId: 'owner' } as Bullet;

  it('ignores the owner before a reflection', () => {
    expect(canBulletHitPlayer(bullet, owner)).toBe(false);
  });

  it('allows a reflected bullet to damage its owner', () => {
    expect(canBulletHitPlayer({ ...bullet, reflectCount: 1 }, owner)).toBe(true);
  });

  it('allows bullets to damage other players normally', () => {
    expect(canBulletHitPlayer(bullet, opponent)).toBe(true);
  });
});
