import Phaser from 'phaser';
import { GAME_VIEW_HEIGHT, HUD_HEIGHT } from '../../game/viewport.config';
import { GameState, PlayerPublicState, PowerUpType } from '../../types/game-state.types';
import { C, MONO } from './game-scene.constants';

type HudObject = Phaser.GameObjects.GameObject;

interface SlotState {
  keyLabel: string;
  name: string;
  iconKey?: string;
  fallbackIcon: string;
  color: number;
  cooldownMs: number;
  cooldownTotalMs: number;
  disabled: boolean;
  counter?: string;
}

const HUD_DEPTH = 1000;
const DASH_COOLDOWN_MS = 5000;
const FIRE_COOLDOWN_MS = 300;
const RELOAD_COOLDOWN_MS = 1400;
const DEFAULT_POWER_DURATION_MS = 15000;

const POWER_AURA_COLOR: Record<PowerUpType, number> = {
  triple_shot: 0x22e8ff,
  shotgun: 0xffc84a,
  grenade: 0xff8a1f,
  laser: 0x20f6ff,
};

export class GameHudRenderer {
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private readonly hudObjects = new Set<HudObject>();
  private readonly readyMap = new Map<string, boolean>();

  private frameGfx!: Phaser.GameObjects.Graphics;
  private topGfx!: Phaser.GameObjects.Graphics;
  private bottomGfx!: Phaser.GameObjects.Graphics;
  private cooldownGfx!: Phaser.GameObjects.Graphics;
  private ammoGfx!: Phaser.GameObjects.Graphics;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private bottomPanelImage!: Phaser.GameObjects.Image;

  private hpText!: Phaser.GameObjects.Text;
  private playersText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private centerBig!: Phaser.GameObjects.Text;
  private centerSub!: Phaser.GameObjects.Text;
  private centerHint!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;

  private readonly iconImages: Phaser.GameObjects.Image[] = [];
  private readonly keyTexts: Phaser.GameObjects.Text[] = [];
  private readonly nameTexts: Phaser.GameObjects.Text[] = [];
  private readonly centerTexts: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;

    this.uiCamera = this.scene.cameras.add(0, 0, W, H).setName('GameHudCamera');
    this.uiCamera.setScroll(0, 0);

    this.frameGfx = this.add(this.scene.add.graphics().setDepth(HUD_DEPTH).setScrollFactor(0));
    this.topGfx = this.add(this.scene.add.graphics().setDepth(HUD_DEPTH + 1).setScrollFactor(0));
    this.bottomPanelImage = this.add(this.scene.add.image(W / 2, H, 'hud-bottom-panel')
      .setOrigin(0.5, 1)
      .setDepth(HUD_DEPTH + 2)
      .setScrollFactor(0));
    this.bottomGfx = this.add(this.scene.add.graphics().setDepth(HUD_DEPTH + 3).setScrollFactor(0));
    this.cooldownGfx = this.add(this.scene.add.graphics().setDepth(HUD_DEPTH + 5).setScrollFactor(0));
    this.ammoGfx = this.add(this.scene.add.graphics().setDepth(HUD_DEPTH + 4).setScrollFactor(0));
    this.overlayGfx = this.add(this.scene.add.graphics().setDepth(HUD_DEPTH + 8).setScrollFactor(0));

    this.hpText = this.add(this.scene.add.text(42, 37, 'HP  ---', {
      fontSize: '13px',
      fontFamily: MONO,
      color: '#00ff66',
    }).setDepth(HUD_DEPTH + 3).setScrollFactor(0).setAlpha(0.82));

    this.playersText = this.add(this.scene.add.text(W - 46, 40, 'PLAYERS: -', {
      fontSize: '12px',
      fontFamily: MONO,
      color: '#ffd98a',
    }).setOrigin(1, 0).setDepth(HUD_DEPTH + 3).setScrollFactor(0).setAlpha(0.66));

    this.statusText = this.add(this.scene.add.text(W / 2, GAME_VIEW_HEIGHT - 16, '', {
      fontSize: '13px',
      fontFamily: MONO,
      color: '#ffee00',
    }).setOrigin(0.5, 1).setDepth(HUD_DEPTH + 3).setScrollFactor(0));

    this.centerBig = this.add(this.scene.add.text(W / 2, GAME_VIEW_HEIGHT / 2 - 30, '', {
      fontSize: '48px',
      fontFamily: MONO,
      color: '#dffcff',
      stroke: '#031018',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(HUD_DEPTH + 9).setScrollFactor(0).setAlpha(0));

    this.centerSub = this.add(this.scene.add.text(W / 2, GAME_VIEW_HEIGHT / 2 + 38, '', {
      fontSize: '20px',
      fontFamily: MONO,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(HUD_DEPTH + 9).setScrollFactor(0).setAlpha(0));

    this.centerHint = this.add(this.scene.add.text(W / 2, GAME_VIEW_HEIGHT / 2 + 74, '', {
      fontSize: '13px',
      fontFamily: MONO,
      color: '#79eaff',
    }).setOrigin(0.5).setDepth(HUD_DEPTH + 9).setScrollFactor(0).setAlpha(0));

    this.ammoText = this.add(this.scene.add.text(0, 0, '0/0', {
      fontSize: '20px',
      fontFamily: MONO,
      color: '#ffd98a',
    }).setOrigin(0.5).setDepth(HUD_DEPTH + 6).setScrollFactor(0));

    for (let i = 0; i < 3; i++) {
      this.iconImages.push(this.add(this.scene.add.image(0, 0, '__DEFAULT')
        .setVisible(false)
        .setDepth(HUD_DEPTH + 3)
        .setScrollFactor(0)));
      this.keyTexts.push(this.add(this.scene.add.text(0, 0, '', {
        fontSize: '15px',
        fontFamily: MONO,
        color: '#ffd98a',
      }).setOrigin(0.5).setDepth(HUD_DEPTH + 6).setScrollFactor(0)));
      this.nameTexts.push(this.add(this.scene.add.text(0, 0, '', {
        fontSize: '10px',
        fontFamily: MONO,
        color: '#bdefff',
      }).setOrigin(0.5).setDepth(HUD_DEPTH + 6).setScrollFactor(0)));
      this.centerTexts.push(this.add(this.scene.add.text(0, 0, '', {
        fontSize: '34px',
        fontFamily: MONO,
        color: '#dffcff',
        stroke: '#031018',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(HUD_DEPTH + 6).setScrollFactor(0)));
    }

    this.syncCameraIgnores();
  }

  showConnectingOverlay(): void {
    this.syncCameraIgnores();
    this.drawStaticFrame();
    this.drawTopPanels(undefined, false, 0);
    this.drawBottomHud(undefined, 0);
    this.overlayGfx.clear();
    this.overlayGfx.fillStyle(0x000000, 0.74);
    this.overlayGfx.fillRect(0, 0, this.scene.scale.width, GAME_VIEW_HEIGHT);
    this.centerBig.setText('CONNECTING...').setColor('#79eaff').setAlpha(1);
    this.centerSub.setAlpha(0);
    this.centerHint.setAlpha(0);
  }

  update(state: GameState, myPlayerId: string, time: number): void {
    const me = state.players.find(p => p.id === myPlayerId);

    this.syncCameraIgnores();
    this.drawStaticFrame();
    this.drawTopPanels(me, Boolean(myPlayerId), state.players.length);
    this.drawBottomHud(me, time);
    this.updateOverlay(state, myPlayerId, me, time);
  }

  private add<T extends HudObject>(object: T): T {
    this.hudObjects.add(object);
    return object;
  }

  private syncCameraIgnores(): void {
    const hudObjects = [...this.hudObjects];
    this.scene.cameras.main.ignore(hudObjects);
    this.uiCamera.ignore(this.scene.children.list.filter(obj => !this.hudObjects.has(obj)));
  }

  private drawStaticFrame(): void {
    const W = this.scene.scale.width;
    const hudY = GAME_VIEW_HEIGHT;

    this.frameGfx.clear();
    this.frameGfx.fillStyle(0x02080d, 0.96);
    this.frameGfx.fillRect(0, hudY, W, HUD_HEIGHT);
    this.frameGfx.lineStyle(2, 0x00dfff, 0.46);
    this.frameGfx.lineBetween(0, hudY, W, hudY);
    this.frameGfx.lineStyle(1, 0x7cf8ff, 0.12);
    this.frameGfx.lineBetween(0, hudY + 4, W, hudY + 4);
  }

  private drawTopPanels(player: PlayerPublicState | undefined, hasPlayerId: boolean, players: number): void {
    const W = this.scene.scale.width;
    const hp = player?.hp ?? 0;
    const maxHp = player?.maxHp || 100;
    const hpFrac = Phaser.Math.Clamp(hp / maxHp, 0, 1);

    this.topGfx.clear();
    this.drawAngledPanel(this.topGfx, 28, 28, 198, 48, 'left', 0.76);
    this.drawAngledPanel(this.topGfx, W - 174, 31, 140, 34, 'right', 0.52);

    this.topGfx.fillStyle(0x00130b, 1);
    this.topGfx.fillRect(42, 61, 144, 8);
    this.topGfx.fillStyle(player ? C.HP_HIGH : 0x183022, 1);
    this.topGfx.fillRect(42, 61, 144 * hpFrac, 8);
    this.topGfx.lineStyle(1, 0x00ff66, 0.30);
    this.topGfx.strokeRect(42, 61, 144, 8);

    this.hpText
      .setText(player ? `HP  ${hp}` : hasPlayerId ? 'HP  DEAD' : 'HP  ---')
      .setColor(player ? '#00ff66' : hasPlayerId ? '#ff3355' : '#46606b');
    this.playersText.setText(`PLAYERS: ${players || '-'}`);
  }

  private drawBottomHud(player: PlayerPublicState | undefined, time: number): void {
    const W = this.scene.scale.width;
    const panelW = W;
    const panelH = HUD_HEIGHT + Math.min(24, HUD_HEIGHT * 0.18);
    const panelX = (W - panelW) / 2;
    const slotSize = Phaser.Math.Clamp(HUD_HEIGHT * 0.72, 62, 76);
    const gap = Phaser.Math.Clamp(HUD_HEIGHT * 0.14, 12, 18);
    const slotsWidth = slotSize * 3 + gap * 2;
    const ammoWidth = Phaser.Math.Clamp(HUD_HEIGHT * 1.05, 88, 124);
    const contentWidth = slotsWidth + gap + ammoWidth;
    const startX = panelX + (panelW - contentWidth) / 2;
    const slotY = GAME_VIEW_HEIGHT + (HUD_HEIGHT - slotSize) / 2 + 4;
    const cy = slotY + slotSize / 2;

    this.bottomGfx.clear();
    this.cooldownGfx.clear();
    this.ammoGfx.clear();

    this.bottomPanelImage
      .setVisible(this.scene.textures.exists('hud-bottom-panel'))
      .setPosition(W / 2, GAME_VIEW_HEIGHT + HUD_HEIGHT)
      .setDisplaySize(panelW, panelH);

    const slots = this.getSlots(player);
    slots.forEach((slot, index) => {
      const x = startX + index * (slotSize + gap);
      this.drawSlot(slot, index, x, slotY, slotSize, time);
    });

    this.drawAmmo(player, startX + slotsWidth + gap, cy, ammoWidth);
  }

  private getSlots(player: PlayerPublicState | undefined): SlotState[] {
    const activePower = player?.activePowerUp;
    const powerType = activePower?.type;
    const weaponCooldown = Math.max(player?.weapon.reloadMs ?? 0, player?.weapon.fireCooldownMs ?? 0);
    const weaponCooldownTotal = (player?.weapon.reloadMs ?? 0) > 0 ? RELOAD_COOLDOWN_MS : FIRE_COOLDOWN_MS;
    const powerCooldown = activePower?.chargeMs ?? activePower?.remainingMs ?? 0;
    const powerColor = powerType ? POWER_AURA_COLOR[powerType] : 0x1d5260;

    return [
      {
        keyLabel: 'SHIFT',
        name: 'DASH',
        fallbackIcon: '>>',
        color: 0x00dfff,
        cooldownMs: player?.dashCooldownMs ?? 0,
        cooldownTotalMs: DASH_COOLDOWN_MS,
        disabled: !player,
      },
      {
        keyLabel: 'M1',
        name: activePower?.name.toUpperCase() ?? 'CANNON',
        iconKey: powerType ? `weapon-power_${powerType}` : undefined,
        fallbackIcon: powerType ? '' : 'C',
        color: powerColor,
        cooldownMs: weaponCooldown,
        cooldownTotalMs: weaponCooldownTotal,
        disabled: !player,
      },
      {
        keyLabel: 'E',
        name: activePower ? activePower.name.toUpperCase() : 'EMPTY',
        iconKey: powerType ? `weapon-power_${powerType}` : undefined,
        fallbackIcon: activePower ? '' : '-',
        color: powerColor,
        cooldownMs: powerCooldown,
        cooldownTotalMs: activePower?.type === 'laser' ? Math.max(powerCooldown, 1) : DEFAULT_POWER_DURATION_MS,
        disabled: !activePower,
        counter: activePower?.type === 'laser' ? `${activePower.shotsRemaining ?? 0}` : undefined,
      },
    ];
  }

  private drawSlot(slot: SlotState, index: number, x: number, y: number, size: number, time: number): void {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const ready = !slot.disabled && slot.cooldownMs <= 0;
    const iconExists = Boolean(slot.iconKey && this.scene.textures.exists(slot.iconKey));
    const pulse = ready ? 0.14 + Math.sin(time * 0.005) * 0.05 : 0.03;

    this.triggerReadyPulse(`slot-${index}`, ready, cx, cy, size, slot.color);

    const radius = Math.max(10, size * 0.18);
    this.bottomGfx.fillStyle(slot.disabled ? 0x061018 : 0x071522, slot.disabled ? 0.82 : 0.98);
    this.bottomGfx.fillRoundedRect(x, y, size, size, radius);
    this.bottomGfx.lineStyle(1, 0x8bf6ff, slot.disabled ? 0.18 : 0.32);
    this.bottomGfx.strokeRoundedRect(x, y, size, size, radius);
    this.bottomGfx.lineStyle(2, slot.color, slot.disabled ? 0.18 : 0.66);
    this.bottomGfx.strokeRoundedRect(x + 3, y + 3, size - 6, size - 6, Math.max(5, radius - 2));
    this.bottomGfx.fillStyle(slot.color, pulse);
    this.bottomGfx.fillCircle(cx, cy - 6, size * 0.36);
    const labelBandH = Math.max(22, size * 0.36);
    this.bottomGfx.fillStyle(0x000000, 0.44);
    this.bottomGfx.fillRoundedRect(x + 4, y + size - labelBandH - 3, size - 8, labelBandH, 5);

    const image = this.iconImages[index];
    image
      .setVisible(iconExists)
      .setPosition(cx, cy - 8)
      .setDisplaySize(size * 0.54, size * 0.54)
      .setAlpha(slot.disabled || slot.cooldownMs > 0 ? 0.42 : 0.92);
    if (slot.iconKey && iconExists) image.setTexture(slot.iconKey);

    const cooldownText = this.getCooldownText(slot.cooldownMs);
    const centerText = slot.counter ?? cooldownText ?? (iconExists ? '' : slot.fallbackIcon);

    this.centerTexts[index]
      .setText(centerText)
      .setFontSize(size < 68 ? 30 : 34)
      .setPosition(cx, cy - 6)
      .setColor(slot.disabled ? '#3b5660' : '#dffcff')
      .setAlpha(centerText ? 1 : 0);
    this.keyTexts[index]
      .setText(slot.keyLabel)
      .setFontSize(size < 68 ? 12 : 14)
      .setPosition(cx, y + size - labelBandH + 3)
      .setColor(slot.disabled ? '#52656b' : '#ffd98a');
    this.nameTexts[index]
      .setText(slot.name)
      .setFontSize(size < 68 ? 8 : 9)
      .setPosition(cx, y + size - 6)
      .setColor(slot.disabled ? '#41555d' : '#bdefff');

    if (slot.cooldownMs > 0 && slot.cooldownTotalMs > 0) {
      const progress = Phaser.Math.Clamp(slot.cooldownMs / slot.cooldownTotalMs, 0, 1);
      this.cooldownGfx.fillStyle(0x000000, 0.64);
      this.drawCooldownWedge(cx, cy - 6, size * 0.36, progress);
      this.cooldownGfx.lineStyle(3, slot.color, 0.78);
      this.cooldownGfx.beginPath();
      this.cooldownGfx.arc(cx, cy - 6, size * 0.36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - progress), false);
      this.cooldownGfx.strokePath();
    }
  }

  private drawAmmo(player: PlayerPublicState | undefined, x: number, cy: number, width: number): void {
    const ammo = player?.weapon.ammo ?? 0;
    const maxAmmo = Math.max(player?.weapon.magazineSize ?? 6, 1);
    const capsuleGap = Phaser.Math.Clamp(HUD_HEIGHT * 0.055, 4, 7);
    const capsuleW = Phaser.Math.Clamp(HUD_HEIGHT * 0.075, 6, 9);
    const capsuleH = Phaser.Math.Clamp(HUD_HEIGHT * 0.22, 16, 24);
    const totalW = maxAmmo * capsuleW + (maxAmmo - 1) * capsuleGap;
    const startX = x + (width - totalW) / 2;

    this.ammoGfx.fillStyle(0x02080d, 0.62);
    this.ammoGfx.fillRoundedRect(x, cy - HUD_HEIGHT * 0.32, width, HUD_HEIGHT * 0.64, 8);

    for (let i = 0; i < maxAmmo; i++) {
      const filled = i < ammo;
      const px = startX + i * (capsuleW + capsuleGap);
      this.ammoGfx.fillStyle(filled ? 0xffc23c : 0x07131b, filled ? 0.96 : 0.9);
      this.ammoGfx.fillRoundedRect(px, cy - capsuleH * 0.8, capsuleW, capsuleH, capsuleW / 2);
      this.ammoGfx.lineStyle(1, filled ? 0xffee9d : 0x80672f, filled ? 0.85 : 0.46);
      this.ammoGfx.strokeRoundedRect(px, cy - capsuleH * 0.8, capsuleW, capsuleH, capsuleW / 2);
    }

    this.ammoText
      .setText(`${ammo}/${maxAmmo}`)
      .setFontSize(HUD_HEIGHT <= 70 ? 14 : 20)
      .setPosition(x + width / 2, cy + HUD_HEIGHT * 0.28);
  }

  private drawAngledPanel(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    side: 'left' | 'right',
    alpha = 0.94,
  ): void {
    const cut = Math.min(24, w * 0.13, h * 0.55);
    const points = side === 'left'
      ? [
        new Phaser.Math.Vector2(x, y),
        new Phaser.Math.Vector2(x + w - cut, y),
        new Phaser.Math.Vector2(x + w, y + h / 2),
        new Phaser.Math.Vector2(x + w - cut, y + h),
        new Phaser.Math.Vector2(x, y + h),
      ]
      : [
        new Phaser.Math.Vector2(x + cut, y),
        new Phaser.Math.Vector2(x + w, y),
        new Phaser.Math.Vector2(x + w, y + h),
        new Phaser.Math.Vector2(x + cut, y + h),
        new Phaser.Math.Vector2(x, y + h / 2),
      ];

    gfx.fillStyle(0x02080d, alpha);
    gfx.fillPoints(points, true);
    gfx.lineStyle(2, 0x00dfff, alpha * 0.64);
    gfx.strokePoints(points, true);
    gfx.lineStyle(1, 0x7cf8ff, alpha * 0.14);
    gfx.strokeRect(x + 5, y + 5, w - 10, h - 10);
  }

  private drawConsolePanel(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    const mid = x + w / 2;
    const topY = y + 10;
    const barY = GAME_VIEW_HEIGHT;
    const baseY = y + h;
    const left = x + 52;
    const right = x + w - 52;
    const capPoints = [
      new Phaser.Math.Vector2(left - 30, barY),
      new Phaser.Math.Vector2(left, topY),
      new Phaser.Math.Vector2(right, topY),
      new Phaser.Math.Vector2(right + 30, barY),
    ];

    gfx.fillStyle(0x02080d, 0.94);
    gfx.fillRoundedRect(left - 16, barY, right - left + 32, baseY - barY - 4, 8);
    gfx.fillStyle(0x031018, 0.62);
    gfx.fillRoundedRect(left + 22, barY + 7, right - left - 44, baseY - barY - 14, 8);

    gfx.fillStyle(0x02080d, 0.86);
    gfx.fillPoints(capPoints, true);
    gfx.lineStyle(3, 0x00dfff, 0.82);
    gfx.strokePoints(capPoints, false);

    gfx.lineStyle(1, 0x00dfff, 0.26);
    gfx.lineBetween(left + 18, barY + 6, right - 18, barY + 6);
    gfx.lineStyle(1, 0xffb23e, 0.36);
    gfx.lineBetween(left + 42, topY + 5, right - 42, topY + 5);

    gfx.lineStyle(2, 0x00dfff, 0.9);
    gfx.strokeTriangle(mid - 9, topY - 12, mid + 9, topY - 12, mid, topY + 8);
  }

  private drawCooldownWedge(cx: number, cy: number, radius: number, progress: number): void {
    const points = [new Phaser.Math.Vector2(cx, cy)];
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * progress;
    const steps = Math.max(4, Math.ceil(44 * progress));

    for (let i = 0; i <= steps; i++) {
      const angle = start + (end - start) * (i / steps);
      points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
    }

    this.cooldownGfx.fillPoints(points, true);
  }

  private getCooldownText(ms: number): string | undefined {
    if (ms <= 0) return undefined;
    const seconds = ms / 1000;
    return seconds > 1 ? Math.ceil(seconds).toString() : seconds.toFixed(1);
  }

  private triggerReadyPulse(key: string, ready: boolean, cx: number, cy: number, size: number, color: number): void {
    const wasReady = this.readyMap.get(key) ?? ready;
    this.readyMap.set(key, ready);
    if (wasReady || !ready) return;

    const pulse = this.add(this.scene.add.circle(cx, cy, size * 0.4, color, 0.24)
      .setDepth(HUD_DEPTH + 7)
      .setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD));
    this.scene.cameras.main.ignore(pulse);
    this.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      scaleX: 1.7,
      scaleY: 1.7,
      duration: 260,
      ease: 'Quad.out',
      onComplete: () => {
        this.hudObjects.delete(pulse);
        pulse.destroy();
      },
    });
  }

  private updateOverlay(
    state: GameState,
    myPlayerId: string,
    me: PlayerPublicState | undefined,
    time: number,
  ): void {
    const W = this.scene.scale.width;

    if (state.status === 'waiting') {
      this.overlayGfx.clear();
      this.overlayGfx.fillStyle(0x000000, 0.54);
      this.overlayGfx.fillRect(0, 0, W, GAME_VIEW_HEIGHT);

      const blink = Math.sin(time * 0.0038) > 0;
      this.centerBig.setAlpha(1).setText('TANK ARENA').setColor('#dffcff');
      this.centerSub.setAlpha(1).setText(myPlayerId ? 'PRESS [ENTER] TO START' : 'WAITING FOR SERVER...')
        .setColor(blink ? '#ffffff' : '#79eaff');
      this.centerHint.setAlpha(0.72).setText('W A S D  -  MOUSE AIM  -  CLICK SHOOT');
      this.statusText.setText('');
      return;
    }

    if (state.status === 'playing') {
      this.overlayGfx.clear();
      this.centerBig.setAlpha(0);
      this.centerSub.setAlpha(0);
      this.centerHint.setAlpha(0);
      this.statusText.setText(me ? '' : 'YOU HAVE BEEN ELIMINATED');
      return;
    }

    this.overlayGfx.clear();
    this.overlayGfx.fillStyle(0x000000, 0.72);
    this.overlayGfx.fillRect(0, 0, W, GAME_VIEW_HEIGHT);

    const survivors = state.players.filter(p => p.alive);
    const isWinner = survivors.some(p => p.id === myPlayerId);
    this.centerBig.setAlpha(1).setText(isWinner ? 'VICTORY!' : 'GAME OVER')
      .setColor(isWinner ? '#00ff88' : '#ff4444');

    if (survivors.length === 1) {
      const winnerId = survivors[0].id;
      this.centerSub.setAlpha(1).setText(winnerId === myPlayerId ? 'YOU WIN' : `WINNER: ${winnerId.slice(0, 8)}`);
    } else {
      this.centerSub.setAlpha(1).setText('NO SURVIVORS');
    }

    this.centerHint.setAlpha(0.68).setText('PRESS [ENTER] TO PLAY AGAIN');
    this.statusText.setText('');
  }
}
