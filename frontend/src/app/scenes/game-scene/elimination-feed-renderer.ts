import Phaser from 'phaser';
import { C, MONO } from './game-scene.constants';
import type { PlayerEliminatedEvent } from './match-notification.types';
import { buildEliminationMessage } from './elimination-message';

interface FeedEntry {
  event: PlayerEliminatedEvent;
  container: Phaser.GameObjects.Container;
  expiresAt: number;
}

const MAX_ENTRIES = 4;
const ENTRY_TTL_MS = 5_000;
const ENTRY_HEIGHT = 40;
const ENTRY_WIDTH = 390;
const ENTRY_BOX_HEIGHT = 36;

export class EliminationFeedRenderer {
  private readonly container: Phaser.GameObjects.Container;
  private readonly entries: FeedEntry[] = [];

  constructor(private readonly scene: Phaser.Scene, depth: number) {
    this.container = scene.add.container(scene.scale.width - 14, 54)
      .setDepth(depth)
      .setScrollFactor(0);
  }

  gameObject(): Phaser.GameObjects.Container {
    return this.container;
  }

  push(event: PlayerEliminatedEvent, localPlayerId: string): void {
    if (this.entries.some(entry => entry.event.id === event.id)) return;
    while (this.entries.length >= MAX_ENTRIES) this.remove(this.entries[0]);

    const entryContainer = this.scene.add.container(0, this.entries.length * ENTRY_HEIGHT);
    const background = this.scene.add.graphics();
    background.fillStyle(C.PANEL, 0.86);
    background.fillRoundedRect(-ENTRY_WIDTH, 0, ENTRY_WIDTH, ENTRY_BOX_HEIGHT, 6);
    background.lineStyle(1, 0x79eaff, 0.18);
    background.strokeRoundedRect(-ENTRY_WIDTH, 0, ENTRY_WIDTH, ENTRY_BOX_HEIGHT, 6);

    const iconKey = this.iconKey(event);
    const hasIcon = Boolean(iconKey && this.scene.textures.exists(iconKey));
    const resolvedIconKey = hasIcon ? iconKey! : 'hud-shot';
    this.useLinearFiltering(resolvedIconKey);
    const icon = this.scene.add.image(-372, 18, resolvedIconKey)
      .setDisplaySize(26, 26)
      .setVisible(hasIcon || this.scene.textures.exists('hud-shot'));
    const text = this.scene.add.text(-350, 18, buildEliminationMessage(event), {
      fontSize: '14px',
      fontFamily: MONO,
      color: this.color(event, localPlayerId),
      stroke: '#120a03',
      strokeThickness: 1,
    }).setOrigin(0, 0.5).setResolution(this.textResolution());

    entryContainer.add([background, icon, text]);
    this.container.add(entryContainer);
    this.entries.push({ event, container: entryContainer, expiresAt: this.scene.time.now + ENTRY_TTL_MS });
  }

  update(time: number): void {
    for (const entry of [...this.entries]) {
      const remaining = entry.expiresAt - time;
      if (remaining <= 0) {
        this.remove(entry);
        continue;
      }
      entry.container.setAlpha(Phaser.Math.Clamp(remaining / 500, 0, 1));
    }
    this.entries.forEach((entry, index) => {
      entry.container.y = Phaser.Math.Linear(entry.container.y, index * ENTRY_HEIGHT, 0.18);
    });
  }

  reset(): void {
    for (const entry of [...this.entries]) this.remove(entry);
  }

  private remove(entry: FeedEntry): void {
    const index = this.entries.indexOf(entry);
    if (index >= 0) this.entries.splice(index, 1);
    entry.container.destroy(true);
  }

  private iconKey(event: PlayerEliminatedEvent): string | undefined {
    if (event.cause === 'danger_zone') return undefined;
    if (event.weapon && event.weapon !== 'standard') return `weapon-power_${event.weapon}`;
    return 'hud-shot';
  }

  private useLinearFiltering(textureKey: string): void {
    if (!this.scene.textures.exists(textureKey)) return;
    this.scene.textures.get(textureKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private textResolution(): number {
    return Math.min(globalThis.devicePixelRatio || 1, 2);
  }

  private color(event: PlayerEliminatedEvent, localPlayerId: string): string {
    if (event.victimId === localPlayerId) return '#ff6680';
    if (event.creditedKillerId === localPlayerId) return '#79eaff';
    return '#f2cf8f';
  }
}
