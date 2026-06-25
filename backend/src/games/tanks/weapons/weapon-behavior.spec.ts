import { CollisionService } from '../collision.service';
import { GameService } from '../game.service';
import { GameRuntimeContext } from '../runtime/game-runtime-context.service';
import { GameSessionsService } from '../runtime/game-sessions.service';
import { Obstacle } from '../types/map.types';
import { WeaponGrenadeService } from './weapon-grenade.service';
import { WeaponLaserService } from './weapon-laser.service';
import { WeaponService } from './weapon.service';

describe('weapon behavior', () => {
  let sessions: GameSessionsService;
  let game: GameService;
  let weapons: WeaponService;
  let laser: WeaponLaserService;
  let grenade: WeaponGrenadeService;

  beforeEach(() => {
    const context = new GameRuntimeContext();
    sessions = new GameSessionsService(context);
    sessions.create('test-room');
    weapons = new WeaponService();
    game = new GameService(weapons, context);
    const collision = new CollisionService();
    laser = new WeaponLaserService(game, collision);
    grenade = new WeaponGrenadeService(game);
  });

  it.each([
    ['triple_shot', 3, undefined],
    ['shotgun', 5, undefined],
    ['grenade', 1, 'grenade'],
    ['laser', 1, 'laser'],
  ] as const)('creates the expected %s projectile pattern', (powerUp, count, kind) => {
    sessions.run('test-room', () => {
      game.map = { width: 1600, height: 1200, obstacles: [], powerUps: [] };
      const player = game.addPlayer('owner');
      player.input.shoot = true;
      player.input.aimAngle = 0;
      weapons.applyPowerUp(player, powerUp, 10_000);

      const projectiles = weapons.tryShoot(player, [], 11_000);

      expect(projectiles).toHaveLength(count);
      expect(projectiles.every(projectile => projectile.kind === kind)).toBe(true);
    });
  });

  it('does not damage the laser owner before reflection', () => {
    sessions.run('test-room', () => {
      game.map = { width: 1600, height: 1200, obstacles: [], powerUps: [] };
      const owner = game.addPlayer('owner');
      owner.x = 100;
      owner.y = 100;
      owner.input.aimAngle = 0;
      owner.input.shoot = true;
      weapons.applyPowerUp(owner, 'laser', 10_000);
      const [beam] = weapons.tryShoot(owner, [], 20_000);

      laser.processBeam(beam, 1 / 60);

      expect(owner.hp).toBe(owner.maxHp);
    });
  });

  it('allows a reflected laser segment to damage its owner', () => {
    sessions.run('test-room', () => {
      const mirror: Obstacle = {
        id: 'mirror',
        type: 'mirror',
        x: 200,
        y: 100,
        width: 18,
        height: 130,
        hp: 9999,
        maxHp: 9999,
        healthRatio: 1,
        destructible: false,
      };
      game.map = { width: 1600, height: 1200, obstacles: [mirror], powerUps: [] };
      const owner = game.addPlayer('owner');
      owner.x = 100;
      owner.y = 100;
      owner.input.aimAngle = 0;
      owner.input.shoot = true;
      weapons.applyPowerUp(owner, 'laser', 10_000);
      const [beam] = weapons.tryShoot(owner, [], 20_000);

      laser.processBeam(beam, 1 / 60);

      expect(owner.hp).toBeLessThan(owner.maxHp);
      expect(beam.bendX).toBeDefined();
    });
  });

  it('applies grenade splash damage to enemies and its owner inside the blast radius', () => {
    sessions.run('test-room', () => {
      game.map = { width: 1600, height: 1200, obstacles: [], powerUps: [] };
      const owner = game.addPlayer('owner');
      const enemy = game.addPlayer('enemy');
      owner.x = 100;
      owner.y = 100;
      enemy.x = 130;
      enemy.y = 100;

      grenade.explode({
        id: 'grenade',
        ownerId: owner.id,
        kind: 'grenade',
        x: 100,
        y: 100,
        dirX: 1,
        dirY: 0,
        speed: 0,
        damage: 42,
        radius: 8,
        lifeTime: 0,
        explosionRadius: 100,
      });

      expect(owner.hp).toBeLessThan(owner.maxHp);
      expect(enemy.hp).toBeLessThan(enemy.maxHp);
    });
  });
});
