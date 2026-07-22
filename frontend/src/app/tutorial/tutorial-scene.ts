import Phaser from 'phaser';
import { GAME_VIEW_HEIGHT, GAME_VIEW_WIDTH } from '../game/viewport.config';
import { AudioManager } from '../scenes/game-scene/audio-manager';
import { BulletRenderer } from '../scenes/game-scene/bullet-renderer';
import { EffectSpawner } from '../scenes/game-scene/effect-spawner';
import {
  clearDynamicLayers,
  createGameSceneLayers,
  GameSceneLayers,
} from '../scenes/game-scene/game-scene-layers';
import { PlayerRenderer } from '../scenes/game-scene/player-renderer';
import { TouchControlHighlight, TouchControls } from '../scenes/game-scene/controlls/touch-controls';
import { ensureShieldSvgTexture } from '../shared/rendering/shield-svg-textures';
import { ensureTankSvgTextures } from '../shared/rendering/tank-svg-textures';
import { BulletPublicState, EBulletKind, GameMap, PlayerPublicState } from '../types/game-state.types';

export interface TutorialSceneCallbacks {
  onStepChange(step: number): void;
  onComplete(): void;
}

const MAP_SIZE = 500;
const MAP_LEFT = (GAME_VIEW_WIDTH - MAP_SIZE) / 2;
const MAP_TOP = 88;
const TANK_RADIUS = 24;
const TANK_SPEED = 150;
const DASH_SPEED = 390;
// Same red used by the authoritative player color palette.
const TANK_COLOR = 0xff3b30;

interface TutorialBullet extends BulletPublicState {
  velocityX: number;
  velocityY: number;
}

export class TutorialScene extends Phaser.Scene {
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'SHIFT' | 'Q', Phaser.Input.Keyboard.Key>;
  private touchControls: TouchControls | null = null;
  private layers!: GameSceneLayers;
  private playerRenderer!: PlayerRenderer;
  private bulletRenderer!: BulletRenderer;
  private effectSpawner!: EffectSpawner;
  private audioManager!: AudioManager;
  private target!: Phaser.GameObjects.Arc;
  private readonly bullets: TutorialBullet[] = [];
  private readonly tutorialMap: GameMap = {
    name: 'Training Ground',
    width: GAME_VIEW_WIDTH,
    height: GAME_VIEW_HEIGHT,
    obstacles: [],
    powerUps: [],
  };
  private tankX = MAP_LEFT + 145;
  private tankY = MAP_TOP + 330;
  private bodyAngle = 0;
  private aimAngle = -0.45;
  private step = 0;
  private travelled = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private lastShotAt = -1000;
  private shieldUntil = 0;
  private dashUntil = 0;
  private completionScheduled = false;

  constructor(
    private readonly callbacks: TutorialSceneCallbacks,
    private readonly playerName: string,
  ) {
    super({ key: 'TutorialScene' });
  }

  preload(): void {
    const assets = [
      ['tutorial-bush', 'assets/obstacle/bush/bush_02_irregular_leafy.svg'],
      ['tutorial-flowers', 'assets/obstacle/decoration/decoration_03_pink_yellow_flowers.svg'],
      ['tutorial-rock', 'assets/obstacle/rock_block_1.svg'],
      ['hud-shot', 'assets/power/shot.svg'],
      ['hud-dash', 'assets/power/dash.svg'],
      ['hud-shield', 'assets/power/shield.svg'],
    ] as const;
    assets.forEach(([key, path]) => this.load.svg(key, path, { width: 64, height: 64 }));
    this.load.audio('weapon-standard-fire', [
      'assets/sounds/effects/weapon_standard_fire.ogg',
      'assets/sounds/effects/weapon_standard_fire.mp3',
    ]);
    this.load.audio('player-dash', [
      'assets/sounds/effects/dash.ogg',
      'assets/sounds/effects/dash.mp3',
    ]);
    this.load.audio('bullet-hit-spark', [
      'assets/sounds/effects/bullet_hit_spark.ogg',
      'assets/sounds/effects/bullet_hit_spark.mp3',
    ]);
  }

  create(): void {
    this.layers = createGameSceneLayers(this);
    this.drawArena();
    this.createParticleTexture();
    this.createTarget();
    this.createKeyboard();
    this.playerRenderer = new PlayerRenderer(this, this.layers);
    this.playerRenderer.recordPlayerState(this.playerState(0));
    this.bulletRenderer = new BulletRenderer(this.layers);
    this.effectSpawner = new EffectSpawner(this);
    this.audioManager = new AudioManager(this);

    // Start the async colorized SVG generation before the first interaction.
    ensureTankSvgTextures(this, TANK_COLOR);
    ensureShieldSvgTexture(this, TANK_COLOR);

    this.touchControls = TouchControls.isSupported(this.game) ? new TouchControls(this) : null;
    this.touchControls?.create();
    this.touchControls?.setTutorialHighlight(this.highlightForStep(0));
    this.touchControls?.update('playing');

    this.lastPointerX = this.input.activePointer.x;
    this.lastPointerY = this.input.activePointer.y;
    const cleanup = (): void => {
      this.touchControls?.destroy();
      this.audioManager.destroy();
      this.playerRenderer.reset();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.callbacks.onStepChange(0);
  }

  override update(time: number, delta: number): void {
    const seconds = Math.min(delta, 50) / 1000;
    const move = this.readMovement();
    const moving = move.x !== 0 || move.y !== 0;
    const dashRequested = Phaser.Input.Keyboard.JustDown(this.keys.SHIFT)
      || (this.touchControls?.consumeAction('dash') ?? false);

    if (moving) {
      const length = Math.hypot(move.x, move.y) || 1;
      const normalizedX = move.x / length;
      const normalizedY = move.y / length;
      if (dashRequested) {
        this.dashUntil = time + 180;
        this.audioManager.playDash(this.tankPoint(), this.tankPoint(), true);
        if (this.step === 3) this.advanceTo(4);
      }
      const speed = time < this.dashUntil ? DASH_SPEED : TANK_SPEED;
      const previousX = this.tankX;
      const previousY = this.tankY;
      this.tankX = Phaser.Math.Clamp(
        this.tankX + normalizedX * speed * seconds,
        MAP_LEFT + TANK_RADIUS,
        MAP_LEFT + MAP_SIZE - TANK_RADIUS,
      );
      this.tankY = Phaser.Math.Clamp(
        this.tankY + normalizedY * speed * seconds,
        MAP_TOP + TANK_RADIUS,
        MAP_TOP + MAP_SIZE - TANK_RADIUS,
      );
      this.bodyAngle = Math.atan2(normalizedY, normalizedX);
      this.travelled += Phaser.Math.Distance.Between(previousX, previousY, this.tankX, this.tankY);
      if (this.step === 0 && this.travelled >= 48) this.advanceTo(1);
    }

    this.updateAim();
    this.updateShield(time);
    this.handleShooting(time);
    this.updateBullets(seconds);
    clearDynamicLayers(this.layers);
    this.playerRenderer.draw([this.playerState(time)], this.tutorialMap, 'tutorial-player', time);
    this.bulletRenderer.draw(this.bullets, time);
    this.touchControls?.update('playing');
  }

  private drawArena(): void {
    const outside = this.add.graphics();
    outside.fillStyle(0x17110b, 0.78);
    outside.fillRect(0, 0, GAME_VIEW_WIDTH, GAME_VIEW_HEIGHT);

    const ground = this.add.graphics();
    ground.fillStyle(0xb98952, 1);
    ground.fillRoundedRect(MAP_LEFT, MAP_TOP, MAP_SIZE, MAP_SIZE, 12);
    ground.lineStyle(4, 0xf2cf8f, 0.82);
    ground.strokeRoundedRect(MAP_LEFT, MAP_TOP, MAP_SIZE, MAP_SIZE, 12);
    ground.lineStyle(1, 0x7d512f, 0.24);
    for (let offset = 50; offset < MAP_SIZE; offset += 50) {
      ground.lineBetween(MAP_LEFT + offset, MAP_TOP, MAP_LEFT + offset, MAP_TOP + MAP_SIZE);
      ground.lineBetween(MAP_LEFT, MAP_TOP + offset, MAP_LEFT + MAP_SIZE, MAP_TOP + offset);
    }

    this.add.image(MAP_LEFT + 55, MAP_TOP + 58, 'tutorial-bush').setDisplaySize(76, 65).setAlpha(0.88);
    this.add.image(MAP_LEFT + 442, MAP_TOP + 425, 'tutorial-bush').setDisplaySize(70, 58).setAlpha(0.84);
    this.add.image(MAP_LEFT + 440, MAP_TOP + 70, 'tutorial-rock').setDisplaySize(54, 54);
    this.add.image(MAP_LEFT + 74, MAP_TOP + 438, 'tutorial-flowers').setDisplaySize(58, 58);
  }

  private createParticleTexture(): void {
    const particle = this.make.graphics({ x: 0, y: 0 } as never, false);
    particle.fillStyle(0xffffff, 1);
    particle.fillCircle(6, 6, 6);
    particle.generateTexture('particle', 12, 12);
    particle.destroy();
  }

  private createTarget(): void {
    this.target = this.add.circle(MAP_LEFT + 365, MAP_TOP + 165, 25, 0x9c2f25, 0.82)
      .setStrokeStyle(4, 0xffd98a, 1)
      .setDepth(10);
    this.add.circle(this.target.x, this.target.y, 9, 0xffd98a, 1).setDepth(11);
  }

  private createKeyboard(): void {
    const keyboard = this.input.keyboard!;
    this.keys = {
      W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SHIFT: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      Q: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    };
  }

  private readMovement(): { x: number; y: number } {
    const touch = this.touchControls?.getMove();
    if (touch && (touch.x !== 0 || touch.y !== 0)) return touch;
    return {
      x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
      y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
    };
  }

  private updateAim(): void {
    const touchAim = this.touchControls?.getAimAngle();
    if (touchAim !== null && touchAim !== undefined) {
      this.aimAngle = touchAim;
      if (this.step === 1) this.advanceTo(2);
      return;
    }

    if (this.touchControls) return;
    const pointer = this.input.activePointer;
    this.aimAngle = Phaser.Math.Angle.Between(this.tankX, this.tankY, pointer.worldX, pointer.worldY);
    const pointerTravel = Phaser.Math.Distance.Between(
      this.lastPointerX,
      this.lastPointerY,
      pointer.x,
      pointer.y,
    );
    if (this.step === 1 && pointerTravel >= 28) this.advanceTo(2);
  }

  private updateShield(time: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.Q) || (this.touchControls?.consumeAction('shield') ?? false)) {
      this.shieldUntil = time + 2200;
      if (this.step === 4 && !this.completionScheduled) {
        this.completionScheduled = true;
        this.touchControls?.setTutorialHighlight(null);
        this.time.delayedCall(2000, () => this.callbacks.onComplete());
      }
    }
  }

  private handleShooting(time: number): void {
    const firing = this.touchControls?.isFiring() ?? this.input.activePointer.isDown;
    if (!firing || time - this.lastShotAt < 280) return;
    this.lastShotAt = time;
    this.spawnBullet();
    this.audioManager.playWeaponFire('standard', this.tankPoint(), this.tankPoint(), true);
    if (this.step === 2) {
      this.advanceTo(3);
    }
  }

  private spawnBullet(): void {
    const startX = this.tankX + Math.cos(this.aimAngle) * 38;
    const startY = this.tankY + Math.sin(this.aimAngle) * 38;
    this.bullets.push({
      id: `tutorial-bullet-${this.time.now}-${this.bullets.length}`,
      ownerId: 'tutorial-player',
      kind: EBulletKind.STANDARD,
      x: startX,
      y: startY,
      radius: 5,
      velocityX: Math.cos(this.aimAngle) * 620,
      velocityY: Math.sin(this.aimAngle) * 620,
    });
  }

  private updateBullets(seconds: number): void {
    for (let index = this.bullets.length - 1; index >= 0; index--) {
      const bullet = this.bullets[index];
      bullet.x += bullet.velocityX * seconds;
      bullet.y += bullet.velocityY * seconds;

      if (Phaser.Math.Distance.Between(bullet.x, bullet.y, this.target.x, this.target.y) <= 31) {
        this.effectSpawner.spawnSpark(bullet.x, bullet.y);
        this.audioManager.playBulletImpact('spark', bullet, this.tankPoint());
        this.tweens.add({
          targets: this.target,
          alpha: 0.35,
          yoyo: true,
          duration: 90,
        });
        this.bullets.splice(index, 1);
        continue;
      }

      const outside = bullet.x < MAP_LEFT
        || bullet.x > MAP_LEFT + MAP_SIZE
        || bullet.y < MAP_TOP
        || bullet.y > MAP_TOP + MAP_SIZE;
      if (outside) this.bullets.splice(index, 1);
    }
  }

  private playerState(time: number): PlayerPublicState {
    const shielding = time < this.shieldUntil;
    return {
      id: 'tutorial-player',
      username: this.playerName,
      x: this.tankX,
      y: this.tankY,
      radius: TANK_RADIUS,
      hp: 100,
      maxHp: 100,
      bodyAngle: this.bodyAngle,
      aimAngle: this.aimAngle,
      color: TANK_COLOR,
      dashCooldownMs: 0,
      weapon: { ammo: 10, magazineSize: 10, reloadMs: 0, fireCooldownMs: 0 },
      dashing: time < this.dashUntil,
      alive: true,
      shielding,
      shieldHp: shielding ? 100 : 0,
      shieldMaxHp: 100,
      shieldCooldownMs: 0,
      shieldRemainingMs: shielding ? Math.max(0, this.shieldUntil - time) : 0,
    };
  }

  private tankPoint(): { x: number; y: number } {
    return { x: this.tankX, y: this.tankY };
  }

  private advanceTo(step: number): void {
    this.step = step;
    this.touchControls?.setTutorialHighlight(this.highlightForStep(step));
    this.lastPointerX = this.input.activePointer.x;
    this.lastPointerY = this.input.activePointer.y;
    this.callbacks.onStepChange(step);
  }

  private highlightForStep(step: number): TouchControlHighlight {
    return (['move', 'aim', 'fire', 'move-dash', 'shield'] as const)[step] ?? null;
  }
}
