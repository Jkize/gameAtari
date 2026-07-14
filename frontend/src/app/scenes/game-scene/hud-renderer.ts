import Phaser from 'phaser';
import { GameState, PlayerPublicState } from '../../types/game-state.types';
import { C, colorToCss, MONO, POWER_UP_COLOR } from './game-scene.constants';

export class HudRenderer {
  private hudPanelGfx!: Phaser.GameObjects.Graphics;
  private hudHpBarGfx!: Phaser.GameObjects.Graphics;
  private hudHpText!: Phaser.GameObjects.Text;
  private hudDashText!: Phaser.GameObjects.Text;
  private hudAmmoText!: Phaser.GameObjects.Text;
  private hudPowerText!: Phaser.GameObjects.Text;
  private hudPlayerCountText!: Phaser.GameObjects.Text;
  private hudTitleText!: Phaser.GameObjects.Text;
  private hudStatusText!: Phaser.GameObjects.Text;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private centerBig!: Phaser.GameObjects.Text;
  private centerSub!: Phaser.GameObjects.Text;
  private centerHint!: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;

    this.hudPanelGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudHpBarGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(101);

    this.hudTitleText = this.scene.add.text(W / 2, 14, 'TANK ARENA', {
      fontSize: '14px', fontFamily: MONO, color: '#f2cf8f',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101).setAlpha(0.55);

    this.hudHpText = this.scene.add.text(20, 18, 'HP ---', {
      fontSize: '13px', fontFamily: MONO, color: '#00ff88',
    }).setScrollFactor(0).setDepth(101);

    this.hudDashText = this.scene.add.text(20, 58, 'DASH ---', {
      fontSize: '11px', fontFamily: MONO, color: '#00ddff',
    }).setScrollFactor(0).setDepth(101);

    this.hudAmmoText = this.scene.add.text(20, 74, 'AMMO ---', {
      fontSize: '11px', fontFamily: MONO, color: '#f2cf8f',
    }).setScrollFactor(0).setDepth(101);

    this.hudPowerText = this.scene.add.text(20, 90, 'POWER ---', {
      fontSize: '11px', fontFamily: MONO, color: '#ffee00',
    }).setScrollFactor(0).setDepth(101);

    this.hudPlayerCountText = this.scene.add.text(W - 16, 18, 'PLAYERS: -', {
      fontSize: '12px', fontFamily: MONO, color: '#8c714a',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(101);

    this.hudStatusText = this.scene.add.text(W / 2, H - 20, '', {
      fontSize: '12px', fontFamily: MONO, color: '#ffee00',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(101).setAlpha(0.8);

    this.overlayGfx = this.scene.add.graphics().setScrollFactor(0).setDepth(108);

    this.centerBig = this.scene.add.text(W / 2, H / 2 - 28, '', {
      fontSize: '48px', fontFamily: MONO, color: '#f2cf8f',
      stroke: '#4a2c17', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(109).setAlpha(0);

    this.centerSub = this.scene.add.text(W / 2, H / 2 + 36, '', {
      fontSize: '20px', fontFamily: MONO, color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(109).setAlpha(0);

    this.centerHint = this.scene.add.text(W / 2, H / 2 + 70, '', {
      fontSize: '13px', fontFamily: MONO, color: '#8c714a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(109).setAlpha(0);
  }

  showConnectingOverlay(): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    this.overlayGfx.clear();
    this.overlayGfx.fillStyle(0x000000, 0.7);
    this.overlayGfx.fillRect(0, 0, W, H);
    this.centerBig.setText('CONNECTING...').setColor('#b89562').setAlpha(1);
    this.centerSub.setAlpha(0);
    this.centerHint.setAlpha(0);
  }

  update(state: GameState, myPlayerId: string, time: number): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;

    this.hudPanelGfx.clear();
    this.hudPanelGfx.fillStyle(C.PANEL, 0.84);
    this.hudPanelGfx.fillRect(10, 10, 220, 116);
    this.hudPanelGfx.lineStyle(1, C.TEXT_WARM, 0.20);
    this.hudPanelGfx.strokeRect(10, 10, 220, 116);
    this.hudPanelGfx.fillStyle(C.PANEL, 0.84);
    this.hudPanelGfx.fillRect(W - 170, 10, 158, 40);
    this.hudPanelGfx.lineStyle(1, C.TEXT_MUTED, 0.34);
    this.hudPanelGfx.strokeRect(W - 170, 10, 158, 40);

    this.hudHpBarGfx.clear();
    const me = state.players.find(p => p.id === myPlayerId);
    if (me) {
      this.updateLocalPlayerHud(me);
    } else if (myPlayerId) {
      this.hudHpText.setText('HP  DEAD').setColor('#ff2244');
      this.hudDashText.setText('DASH ---').setColor('#334455');
      this.hudAmmoText.setText('AMMO ---').setColor('#8c714a');
      this.hudPowerText.setText('POWER ---').setColor('#8c714a');
    } else {
      this.hudHpText.setText('CONNECTING...').setColor('#334455');
      this.hudDashText.setText('DASH ---').setColor('#334455');
      this.hudAmmoText.setText('AMMO ---').setColor('#8c714a');
      this.hudPowerText.setText('POWER ---').setColor('#8c714a');
    }

    this.hudPlayerCountText.setText(`PLAYERS: ${state.players.length}`);
    this.updateOverlay(state, myPlayerId, me, time, W, H);
  }

  private updateLocalPlayerHud(me: PlayerPublicState): void {
    const maxHp = me.maxHp || me.hp;
    const frac = Math.max(0, me.hp / (maxHp || 1));
    const bx = 20;
    const by = 43;
    const bW2 = 162;
    const bH = 10;

    this.hudHpBarGfx.fillStyle(0x0d1f0d, 1);
    this.hudHpBarGfx.fillRect(bx, by, bW2, bH);

    const col = frac > 0.5 ? C.HP_HIGH : frac > 0.25 ? C.HP_MED : C.HP_LOW;
    this.hudHpBarGfx.fillStyle(col, 1);
    this.hudHpBarGfx.fillRect(bx, by, bW2 * frac, bH);

    this.hudHpBarGfx.lineStyle(1, 0x223322, 0.7);
    this.hudHpBarGfx.strokeRect(bx, by, bW2, bH);

    const hpLabel = frac <= 0 ? 'DEAD' : `${me.hp}`;
    this.hudHpText.setText(`HP  ${hpLabel}`)
      .setColor(frac > 0.5 ? '#00ff88' : frac > 0.25 ? '#ffcc00' : '#ff2244');

    const dashSeconds = me.dashCooldownMs / 1000;
    const dashLabel = me.dashing
      ? 'DASH ACTIVE'
      : me.dashCooldownMs <= 0
        ? 'DASH READY'
        : `DASH ${dashSeconds.toFixed(1)}s`;
    this.hudDashText.setText(dashLabel)
      .setColor(me.dashCooldownMs <= 0 || me.dashing ? '#00ddff' : '#557766');

    const reloadSeconds = me.weapon.reloadMs / 1000;
    const ammoLabel = me.weapon.reloadMs > 0
      ? `RELOAD ${reloadSeconds.toFixed(1)}s`
      : `AMMO ${me.weapon.ammo}/${me.weapon.magazineSize}`;
    this.hudAmmoText.setText(ammoLabel)
      .setColor(me.weapon.reloadMs > 0 ? '#ffcc00' : '#f2cf8f');

    const powerLabel = this.getPowerHudLabel(me);
    this.hudPowerText.setText(powerLabel)
      .setColor(me.activePowerUp ? colorToCss(POWER_UP_COLOR[me.activePowerUp.type]) : '#8c714a');
  }

  private updateOverlay(
    state: GameState,
    myPlayerId: string,
    me: PlayerPublicState | undefined,
    time: number,
    W: number,
    H: number,
  ): void {
    if (state.status === 'waiting') {
      this.overlayGfx.clear();
      this.overlayGfx.fillStyle(0x000000, 0.55);
      this.overlayGfx.fillRect(0, 0, W, H);

      const blink = Math.sin(time * 0.0038) > 0;
      this.centerBig.setAlpha(1).setColor('#f2cf8f').setText('TANK ARENA');
      this.centerSub.setAlpha(1).setText(
        myPlayerId ? 'PRESS [ENTER] TO START' : 'WAITING FOR SERVER...',
      ).setColor(blink ? '#ffffff' : '#8c714a');
      this.centerHint.setAlpha(0.7).setText('W A S D  -  MOUSE AIM  -  CLICK SHOOT');
      this.hudStatusText.setText('');
    } else if (state.status === 'playing') {
      this.overlayGfx.clear();
      this.centerBig.setAlpha(0);
      this.centerSub.setAlpha(0);
      this.centerHint.setAlpha(0);
      this.hudStatusText.setText(me ? '' : 'YOU HAVE BEEN ELIMINATED');
    } else if (state.status === 'finished') {
      this.overlayGfx.clear();
      this.overlayGfx.fillStyle(0x000000, 0.72);
      this.overlayGfx.fillRect(0, 0, W, H);

      const survivors = state.players.filter(p => p.alive);
      const isWinner = survivors.some(p => p.id === myPlayerId);
      const label = isWinner ? 'VICTORY!' : 'GAME OVER';
      const labelColor = isWinner ? '#00ff88' : '#ff4444';

      this.centerBig.setAlpha(1).setColor(labelColor).setText(label);
      if (survivors.length === 1) {
        const winner = survivors[0];
        const winnerName = winner.username ?? winner.id.slice(0, 8);
        const tag = winner.id === myPlayerId ? 'YOU WIN' : `WINNER: ${winnerName}`;
        this.centerSub.setAlpha(1).setText(tag);
      } else {
        this.centerSub.setAlpha(1).setText('NO SURVIVORS');
      }
      this.centerHint.setAlpha(0.6).setText('PRESS [ENTER] TO PLAY AGAIN');
      this.hudStatusText.setText('');
    }
  }

  private getPowerHudLabel(player: PlayerPublicState): string {
    const power = player.activePowerUp;
    if (!power) return 'POWER ---';

    if (power.type === 'laser') {
      const shots = power.shotsRemaining ?? 0;
      if (power.chargeMs !== undefined) {
        return `LASER CHARGE ${(power.chargeMs / 1000).toFixed(1)}s`;
      }
      return `LASER READY ${shots} SHOTS`;
    }

    return power.remainingMs !== undefined
      ? `${power.name} ${(power.remainingMs / 1000).toFixed(0)}s`
      : power.name;
  }
}
