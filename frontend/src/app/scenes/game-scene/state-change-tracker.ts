import Phaser from 'phaser';
import { BulletPublicState, GameState } from '../../types/game-state.types';
import { HIT_REVEAL_MS } from './game-scene.constants';
import { EffectSpawner } from './effect-spawner';
import { ObstacleRenderer } from './obstacle-renderer';
import { PlayerRenderer } from './player-renderer';
import { PowerUpRenderer } from './power-up-renderer';

type LastBulletPos = {
  x: number;
  y: number;
  kind?: string;
  explosionRadius?: number;
};

export class StateChangeTracker {
  private playerLastHp: Map<string, number> = new Map();
  private playerLastPos: Map<string, { x: number; y: number }> = new Map();
  private bulletLastPos: Map<string, LastBulletPos> = new Map();
  private prevPlayerIds: Set<string> = new Set();
  private prevBulletIds: Set<string> = new Set();
  private prevObsIds: Set<string> = new Set();
  private prevPowerUpIds: Set<string> = new Set();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectSpawner,
    private readonly obstacleRenderer: ObstacleRenderer,
    private readonly powerUpRenderer: PowerUpRenderer,
    private readonly playerRenderer: PlayerRenderer,
  ) {}

  reset(): void {
    this.playerLastHp.clear();
    this.playerLastPos.clear();
    this.bulletLastPos.clear();
    this.prevPlayerIds.clear();
    this.prevBulletIds.clear();
    this.prevObsIds.clear();
    this.prevPowerUpIds.clear();
  }

  removeDisconnectedPlayer(playerId: string): void {
    const pos = this.playerLastPos.get(playerId);
    if (pos) this.effects.spawnExplosion(pos.x, pos.y, true);
    this.playerLastHp.delete(playerId);
    this.playerLastPos.delete(playerId);
    this.playerRenderer.remove(playerId);
  }

  check(state: GameState, myPlayerId: string): void {
    const curPlayers = new Set(state.players.map(p => p.id));
    const curBullets = new Set(state.bullets.map(b => b.id));
    const curObs = new Set(state.map.obstacles.map(o => o.id));
    const curPowerUps = new Set(state.map.powerUps.map(p => p.id));

    this.prevPlayerIds.forEach(id => {
      if (!curPlayers.has(id)) {
        const pos = this.playerLastPos.get(id);
        if (pos) this.effects.spawnExplosion(pos.x, pos.y, true);
        this.playerLastHp.delete(id);
        this.playerLastPos.delete(id);
        this.playerRenderer.remove(id);
      }
    });

    this.prevBulletIds.forEach(id => {
      if (!curBullets.has(id)) {
        const pos = this.bulletLastPos.get(id);
        if (pos) {
          if (pos.kind === 'grenade') {
            this.effects.spawnGrenadeExplosion(pos.x, pos.y, pos.explosionRadius);
          } else if (pos.kind !== 'laser') {
            this.effects.spawnSpark(pos.x, pos.y);
          }
        }
        this.bulletLastPos.delete(id);
      }
    });

    this.prevObsIds.forEach(id => {
      if (!curObs.has(id)) {
        this.obstacleRenderer.remove(id);
      }
    });

    this.prevPowerUpIds.forEach(id => {
      if (!curPowerUps.has(id)) {
        const gfx = this.powerUpRenderer.get(id);
        if (gfx) {
          this.effects.spawnPowerPickupBurst(gfx.x, gfx.y);
          this.powerUpRenderer.remove(id);
        }
      }
    });

    state.map.obstacles.forEach(obs => this.obstacleRenderer.ensure(obs));
    state.map.powerUps.forEach(powerUp => this.powerUpRenderer.ensure(powerUp));

    state.players.forEach(p => {
      let revealUntil: number | undefined;
      const prev = this.playerLastHp.get(p.id);
      if (prev !== undefined && p.hp < prev) {
        revealUntil = this.scene.time.now + HIT_REVEAL_MS;
        if (p.id === myPlayerId) {
          this.scene.cameras.main.shake(220, 0.009);
        }
      }
      this.playerRenderer.recordPlayerState(p, revealUntil);
      this.playerLastHp.set(p.id, p.hp);
      this.playerLastPos.set(p.id, { x: p.x, y: p.y });
    });

    state.bullets.forEach(b => this.recordBullet(b));

    this.prevPlayerIds = curPlayers;
    this.prevBulletIds = curBullets;
    this.prevObsIds = curObs;
    this.prevPowerUpIds = curPowerUps;
  }

  private recordBullet(b: BulletPublicState): void {
    this.bulletLastPos.set(b.id, {
      x: b.x,
      y: b.y,
      kind: b.kind,
      explosionRadius: b.explosionRadius,
    });
  }
}
