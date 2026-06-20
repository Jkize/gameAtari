import Phaser from 'phaser';
import { GameMap, PlayerPublicState } from '../../types/game-state.types';
import {
  BODY_TURN_STEP,
  C,
  colorToCss,
  HIT_REVEAL_BLINK_MS,
  MONO,
  PLAYER_LABEL_OFFSET,
  REVEALED_TANK_DEPTH,
  TANK_TURRET_SCALE,
} from './game-scene.constants';
import { GameSceneLayers } from './game-scene-layers';
import {
  ensureTankSvgTextures,
  TANK_BODY_ROTATION_OFFSET,
  TANK_TURRET_ORIGIN_X,
  TANK_TURRET_ORIGIN_Y,
  TANK_TURRET_ROTATION_OFFSET,
} from '../../rendering/tank-svg-textures';
import { ensureWeaponOverlayTexture } from '../../rendering/weapon-svg-textures';

interface TankSprites {
  body: Phaser.GameObjects.Image;
  turret: Phaser.GameObjects.Image;
  weapon?: Phaser.GameObjects.Image;
}

export class PlayerRenderer {
  readonly playerMaxHp: Map<string, number> = new Map();
  private playerNameTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private playerTankSprites: Map<string, TankSprites> = new Map();
  private playerRevealUntil: Map<string, number> = new Map();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layers: GameSceneLayers,
  ) {}

  reset(): void {
    this.playerNameTexts.forEach(txt => txt.destroy());
    this.playerNameTexts.clear();

    this.playerTankSprites.forEach(tank => {
      tank.body.destroy();
      tank.turret.destroy();
      tank.weapon?.destroy();
    });
    this.playerTankSprites.clear();

    this.playerMaxHp.clear();
    this.playerRevealUntil.clear();
  }

  remove(id: string): void {
    this.playerMaxHp.delete(id);
    this.playerRevealUntil.delete(id);
    const txt = this.playerNameTexts.get(id);
    if (txt) {
      txt.destroy();
      this.playerNameTexts.delete(id);
    }
    const tank = this.playerTankSprites.get(id);
    if (tank) {
      tank.body.destroy();
      tank.turret.destroy();
      tank.weapon?.destroy();
      this.playerTankSprites.delete(id);
    }
  }

  recordPlayerState(player: PlayerPublicState, revealUntil?: number): void {
    this.playerMaxHp.set(player.id, player.maxHp || player.hp);
    if (revealUntil !== undefined) this.playerRevealUntil.set(player.id, revealUntil);

    if (!this.playerNameTexts.has(player.id)) {
      const txt = this.scene.add.text(player.x, player.y, player.id.slice(0, 8), {
        fontSize: '11px', fontFamily: MONO,
        color: colorToCss(player.color),
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(10);
      this.playerNameTexts.set(player.id, txt);
    }
  }

  draw(players: PlayerPublicState[], map: GameMap, myPlayerId: string, time: number): void {
    players.forEach(p => {
      const isLocal = p.id === myPlayerId;
      const hiddenByBush = this.isPlayerInBush(p, map);
      const revealAlpha = hiddenByBush ? this.getHitRevealAlpha(p.id, time) : undefined;
      const isRevealed = revealAlpha !== undefined;
      this.drawTank(p, map, isLocal, time);
      if (!hiddenByBush || isRevealed) {
        this.drawHpBar(p);
      }

      const txt = this.playerNameTexts.get(p.id);
      if (txt) {
        const nameLabel = p.id.slice(0, 8);
        const label = isLocal ? nameLabel : `${nameLabel}\n${p.hp}hp`;
        txt.setText(label);
        txt.setPosition(p.x, p.y - p.radius * PLAYER_LABEL_OFFSET);
        txt.setVisible(p.alive && (!hiddenByBush || isRevealed));
        txt.setAlpha(revealAlpha ?? 1);
      }
    });
  }

  private getHitRevealAlpha(playerId: string, time: number): number | undefined {
    const revealUntil = this.playerRevealUntil.get(playerId);
    if (revealUntil === undefined) return undefined;

    if (time >= revealUntil) {
      this.playerRevealUntil.delete(playerId);
      return undefined;
    }

    return Math.floor(time / HIT_REVEAL_BLINK_MS) % 2 === 0 ? 1 : 0.34;
  }

  private isPlayerInBush(p: PlayerPublicState, map: GameMap): boolean {
    if (!p.alive) return false;

    return map.obstacles.some(obs => {
      if (obs.type !== 'bush') return false;

      const halfW = obs.width / 2;
      const halfH = obs.height / 2;
      const closestX = Phaser.Math.Clamp(p.x, obs.x - halfW, obs.x + halfW);
      const closestY = Phaser.Math.Clamp(p.y, obs.y - halfH, obs.y + halfH);
      return Phaser.Math.Distance.Between(p.x, p.y, closestX, closestY) <= p.radius * 0.75;
    });
  }

  private drawTank(p: PlayerPublicState, map: GameMap, isLocal: boolean, time: number): void {
    const { x, y, radius: r, bodyAngle, aimAngle: a, color } = p;
    const textureKeys = ensureTankSvgTextures(this.scene, color);
    if (!textureKeys) return;

    let sprites = this.playerTankSprites.get(p.id);
    if (!sprites) {
      sprites = {
        body: this.scene.add.image(x, y, textureKeys.body)
          .setOrigin(0.5)
          .setDepth(5),
        turret: this.scene.add.image(x, y, textureKeys.turret)
          .setOrigin(TANK_TURRET_ORIGIN_X, TANK_TURRET_ORIGIN_Y)
          .setDepth(7),
        weapon: this.scene.add.image(x, y, textureKeys.turret)
          .setOrigin(TANK_TURRET_ORIGIN_X, TANK_TURRET_ORIGIN_Y)
          .setDepth(8)
          .setVisible(false),
      };
      this.playerTankSprites.set(p.id, sprites);
    }

    const bodyScale = (r * 2.7) / sprites.body.width;
    const turretScale = (r * TANK_TURRET_SCALE) / sprites.turret.width;
    const hpFrac = Phaser.Math.Clamp(p.hp / (p.maxHp || 1), 0, 1);
    const revealAlpha = this.isPlayerInBush(p, map) ? this.getHitRevealAlpha(p.id, time) : undefined;
    const bodyDepth = revealAlpha !== undefined ? REVEALED_TANK_DEPTH : 5;
    const turretDepth = revealAlpha !== undefined ? REVEALED_TANK_DEPTH + 0.2 : 7;
    const weaponDepth = revealAlpha !== undefined ? REVEALED_TANK_DEPTH + 0.4 : 8;
    const activeBodyTexture = hpFrac <= 0.35
      ? textureKeys.criticalBody
      : hpFrac <= 0.7
        ? textureKeys.hurtBody
        : textureKeys.body;
    const activeTurretTexture = hpFrac <= 0.35
      ? textureKeys.criticalTurret
      : hpFrac <= 0.7
        ? textureKeys.hurtTurret
        : textureKeys.turret;

    if (!p.alive) {
      this.layers.mainGfx.fillStyle(0x000000, 0.42);
      this.layers.mainGfx.fillEllipse(x + 4, y + 6, r * 2.35, r * 1.9);

      sprites.body
        .setVisible(true)
        .setTexture(textureKeys.destroyedBody)
        .setPosition(x, y)
        .setDepth(bodyDepth)
        .setScale(bodyScale)
        .setRotation(bodyAngle + TANK_BODY_ROTATION_OFFSET)
        .setAlpha((revealAlpha ?? 1) * 0.78)
        .setTint(0x777777);
      sprites.turret
        .setVisible(true)
        .setTexture(textureKeys.destroyedTurret)
        .setPosition(x, y)
        .setDepth(turretDepth)
        .setScale(turretScale)
        .setRotation(a + TANK_TURRET_ROTATION_OFFSET)
        .setAlpha((revealAlpha ?? 1) * 0.72)
        .setTint(0x777777);
      sprites.weapon?.setVisible(false);

      return;
    }

    const pulse = isLocal ? (0.85 + 0.15 * Math.sin(time * 0.004)) : 1;

    this.layers.glowGfx.fillStyle(color, 0.055 * pulse);
    this.layers.glowGfx.fillCircle(x, y, r * 1.75);
    this.layers.glowGfx.fillStyle(color, 0.035 * pulse);
    this.layers.glowGfx.fillCircle(x, y, r * 1.05);

    if (p.dashing) {
      this.layers.glowGfx.fillStyle(color, 0.13);
      this.layers.glowGfx.fillCircle(x, y, r * 2.05);
      this.layers.glowGfx.lineStyle(4, color, 0.55);
      this.layers.glowGfx.strokeCircle(x, y, r * 1.45);
      this.layers.glowGfx.lineStyle(2, color, 0.35);
      this.layers.glowGfx.strokeCircle(x, y, r * 1.9);
    }

    this.layers.mainGfx.fillStyle(0x000000, 0.30);
    this.layers.mainGfx.fillEllipse(x + 4, y + 5, r * 2.2, r * 1.8);

    sprites.body
      .setVisible(true)
      .setTexture(activeBodyTexture)
      .setPosition(x, y)
      .setDepth(bodyDepth)
      .setScale(bodyScale)
      .setAlpha(revealAlpha ?? 1)
      .clearTint();
    sprites.body.setRotation(
      Phaser.Math.Angle.RotateTo(
        sprites.body.rotation,
        bodyAngle + TANK_BODY_ROTATION_OFFSET,
        BODY_TURN_STEP,
      ),
    );
    sprites.turret
      .setVisible(true)
      .setTexture(activeTurretTexture)
      .setPosition(x, y)
      .setDepth(turretDepth)
      .setScale(turretScale)
      .setRotation(a + TANK_TURRET_ROTATION_OFFSET)
      .setAlpha(revealAlpha ?? 1)
      .clearTint();

    const powerType = p.activePowerUp?.type;
    if (powerType) {
      const weaponTexture = ensureWeaponOverlayTexture(this.scene, powerType, color);
      if (weaponTexture) {
        sprites.weapon
          ?.setVisible(true)
          .setTexture(weaponTexture)
          .setPosition(x, y)
          .setDepth(weaponDepth)
          .setScale(turretScale)
          .setRotation(a + TANK_TURRET_ROTATION_OFFSET)
          .setAlpha(revealAlpha ?? 1)
          .clearTint();
      } else {
        sprites.weapon?.setVisible(false);
      }
    } else {
      sprites.weapon?.setVisible(false);
    }
  }

  private drawHpBar(p: PlayerPublicState): void {
    if (!p.alive) return;
    const maxHp = p.maxHp || this.playerMaxHp.get(p.id) || p.hp;
    const frac = Math.max(0, p.hp / (maxHp || 1));
    const r = p.radius;
    const bW = r * 2.6;
    const bH = 5;
    const bx = p.x - bW / 2;
    const by = p.y - r * 1.5;

    this.layers.playerUiGfx.fillStyle(0x0a0a0a, 0.85);
    this.layers.playerUiGfx.fillRect(bx - 1, by - 1, bW + 2, bH + 2);

    const col = frac > 0.5 ? C.HP_HIGH : frac > 0.25 ? C.HP_MED : C.HP_LOW;
    this.layers.playerUiGfx.fillStyle(col, 1);
    this.layers.playerUiGfx.fillRect(bx, by, bW * frac, bH);

    if (frac <= 0.25) {
      this.layers.glowGfx.fillStyle(C.HP_LOW, 0.22);
      this.layers.glowGfx.fillRect(bx - 2, by - 2, bW + 4, bH + 4);
    }
  }
}
