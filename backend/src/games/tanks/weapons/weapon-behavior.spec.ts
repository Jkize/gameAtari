import { CollisionService } from '../collision.service';
import { GameService } from '../game.service';
import { PowerUpSpawnService } from '../power-up-spawn.service';
import { GameRuntimeContext } from '../runtime/game-runtime-context.service';
import { GameSessionsService } from '../runtime/game-sessions.service';
import { GameMap, Obstacle } from '../types/map.types';
import { WeaponGrenadeService } from './weapon-grenade.service';
import { WeaponLaserService } from './weapon-laser.service';
import { WeaponService } from './weapon.service';
import { EliminationService } from '../events/elimination.service';

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
    game = new GameService(
      weapons,
      context,
      new PowerUpSpawnService(),
      new EliminationService(context),
    );
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
      game.map = createTestMap();
      const player = game.addPlayer('owner');
      player.input.shoot = true;
      player.input.aimAngle = 0;
      weapons.applyPowerUp(player, powerUp, 10_000);

      const projectiles = weapons.tryShoot(player, [], 11_000);

      expect(projectiles).toHaveLength(count);
      expect(projectiles.every(projectile => projectile.kind === kind)).toBe(true);
      expect(projectiles.every(projectile => projectile.weapon === powerUp)).toBe(true);
    });
  });

  it('does not damage the laser owner before reflection', () => {
    sessions.run('test-room', () => {
      game.map = createTestMap();
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
      game.map = createTestMap([mirror]);
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
      game.map = createTestMap();
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

  it('applies direct danger-zone damage without consuming shield or crediting kills', () => {
    sessions.run('test-room', () => {
      game.map = createTestMap();
      const victim = game.addPlayer('victim');
      victim.hp = 5;
      victim.shieldHp = 35;
      victim.shieldUntil = Date.now() + 10_000;

      game.damagePlayerDirect(victim, 5);

      expect(victim.alive).toBe(false);
      expect(victim.hp).toBe(0);
      expect(victim.shieldHp).toBe(35);
      expect(sessions.require('test-room').stats.get('victim')).toMatchObject({
        deaths: 1,
        damageTaken: 5,
      });
      expect(sessions.require('test-room').stats.get('victim')?.kills).toBe(0);
      expect(sessions.require('test-room').eliminationEvents[0]).toMatchObject({
        victimId: 'victim',
        creditedKillerId: null,
        cause: 'danger_zone',
        attribution: 'environment',
      });
    });
  });

  it('credits recent external damage when a player eliminates themselves within five seconds', () => {
    sessions.run('test-room', () => {
      game.map = createTestMap();
      const attacker = game.addPlayer('attacker', 'Attacker');
      const victim = game.addPlayer('victim', 'Victim');
      victim.hp = 20;

      game.damagePlayer(victim, 10, {
        attackerId: attacker.id,
        cause: 'projectile',
        weapon: 'standard',
      }, 1_000);
      game.damagePlayer(victim, 10, {
        attackerId: victim.id,
        cause: 'reflected_projectile',
        weapon: 'laser',
      }, 5_500);

      expect(sessions.require('test-room').stats.get(attacker.id)?.kills).toBe(1);
      expect(sessions.require('test-room').eliminationEvents[0]).toMatchObject({
        victimId: victim.id,
        creditedKillerId: attacker.id,
        lethalSourcePlayerId: victim.id,
        attribution: 'recent_damage',
        selfInflicted: true,
        cause: 'reflected_projectile',
        weapon: 'laser',
      });
    });
  });

  it('treats self damage as a suicide after the attribution window expires', () => {
    sessions.run('test-room', () => {
      game.map = createTestMap();
      const attacker = game.addPlayer('attacker');
      const victim = game.addPlayer('victim');
      victim.hp = 20;

      game.damagePlayer(victim, 10, {
        attackerId: attacker.id,
        cause: 'projectile',
        weapon: 'standard',
      }, 1_000);
      game.damagePlayer(victim, 10, {
        attackerId: victim.id,
        cause: 'projectile',
        weapon: 'grenade',
      }, 6_001);

      expect(sessions.require('test-room').stats.get(attacker.id)?.kills).toBe(0);
      expect(sessions.require('test-room').eliminationEvents[0]).toMatchObject({
        creditedKillerId: null,
        attribution: 'self',
        selfInflicted: true,
      });
    });
  });

  it('uses player ids when elimination participants do not have usernames', () => {
    sessions.run('test-room', () => {
      game.map = createTestMap();
      const attacker = game.addPlayer('dev-attacker', '   ');
      const victim = game.addPlayer('dev-victim');
      victim.hp = 1;

      game.damagePlayer(victim, 1, {
        attackerId: attacker.id,
        attackerName: attacker.username,
        cause: 'projectile',
        weapon: 'standard',
      }, 1_000);

      expect(sessions.require('test-room').eliminationEvents[0]).toMatchObject({
        victimName: 'dev-victim',
        creditedKillerName: 'dev-attacker',
      });
    });
  });

  function createTestMap(obstacles: Obstacle[] = []): GameMap {
    return {
      width: 1600,
      height: 1200,
      spawnPoints: [
        { x: 100, y: 100 },
        { x: 130, y: 100 },
      ],
      obstacles,
      powerUps: [],
    };
  }
});
