import Phaser from 'phaser';
import { MONO } from '@game/config/game-scene.constants';
import type { PlayerPublicState } from '@game/contracts/game-state.types';
import { t } from '@core/i18n/translate-bridge';

export function countAlivePlayers(players: readonly Pick<PlayerPublicState, 'alive'>[]): number {
  return players.filter(player => player.alive).length;
}

export function shouldShowViewerIndicator(viewerCount: number): boolean {
  return viewerCount > 0;
}

export class MatchStatusPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly panelImage: Phaser.GameObjects.Image;
  private readonly aliveText: Phaser.GameObjects.Text;
  private readonly rttText: Phaser.GameObjects.Text;
  private readonly viewerIcon: Phaser.GameObjects.Image;
  private readonly viewerText: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene, depth: number) {
    const W = scene.scale.width;
    this.container = scene.add.container(W, 0).setDepth(depth).setScrollFactor(0);
    this.panelImage = scene.add.image(0, 0, 'hud-players-panel')
      .setOrigin(1, 0)
      .setAlpha(0.8);
    this.aliveText = scene.add.text(-10, 21, 'ALIVE: -', {
      fontSize: '12px',
      fontFamily: MONO,
      color: '#ffd98a',
    }).setOrigin(1, 0.5).setAlpha(0.72).setResolution(this.textResolution());
    this.viewerIcon = scene.add.image(-122, 21, 'hud-viewer-eye')
      .setDisplaySize(21, 14)
      .setVisible(false);
    this.viewerText = scene.add.text(-108, 21, '', {
      fontSize: '12px',
      fontFamily: MONO,
      color: '#79eaff',
    }).setOrigin(0, 0.5).setVisible(false).setResolution(this.textResolution());
    this.rttText = scene.add.text(-145, 21, '', {
      fontSize: '13px',
      fontFamily: MONO,
      color: '#00ff66',
      stroke: '#00130b',
      strokeThickness: 3,
    }).setOrigin(1, 0.5).setAlpha(0.96).setResolution(this.textResolution());
    this.container.add([
      this.panelImage,
      this.aliveText,
      this.viewerIcon,
      this.viewerText,
      this.rttText,
    ]);
  }

  gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  update(alivePlayers: number, viewerCount: number, rttMs: number | null): void {
    this.panelImage
      .setVisible(this.scene.textures.exists('hud-players-panel'))
      .setDisplaySize(220, 42);
    this.aliveText
      .setText(t('hud.alive', { count: alivePlayers }))
      .setColor(alivePlayers <= 1 ? '#00ff88' : alivePlayers === 2 ? '#ff6b4a' : '#ffd98a');

    const hasViewers = shouldShowViewerIndicator(viewerCount);
    this.viewerIcon.setVisible(hasViewers && this.scene.textures.exists('hud-viewer-eye'));
    this.viewerText.setVisible(hasViewers).setText(`${viewerCount}`);
    this.rttText
      .setVisible(rttMs !== null)
      .setX(hasViewers ? -145 : -100)
      .setText(rttMs === null ? '' : `${Math.round(rttMs)} ms`);
  }

  private textResolution(): number {
    return Math.min(globalThis.devicePixelRatio || 1, 2);
  }
}
