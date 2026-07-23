import Phaser from 'phaser';
import { DangerZonePublicState, GameMap } from '@game/contracts/game-state.types';

const WARNING_EDGE = 0xffd166;
const ACTIVE_EDGE = 0xff5a1f;
const FINAL_EDGE = 0xff1f0f;
const LAVA_FILL = 0x7a1708;
const LAVA_HOT = 0xff8a1f;
const PREHEAT_MS = 3000;

export class DangerZoneRenderer {
  constructor(private readonly gfx: Phaser.GameObjects.Graphics) {}

  draw(zone: DangerZonePublicState | undefined, map: GameMap, time: number): void {
    this.gfx.clear();
    if (!zone) return;

    const warmupAlpha = this.getWarmupAlpha(zone);
    if (warmupAlpha <= 0) return;
    const pulse = (Math.sin(time * 0.006) + 1) / 2;
    const isWarning = zone.phase === 'warning';
    const isPreheat = zone.phase === 'inactive';
    const isFinal = zone.phase === 'final' || zone.phase === 'sudden_death';
    const edgeColor = isWarning || isPreheat ? WARNING_EDGE : isFinal ? FINAL_EDGE : ACTIVE_EDGE;
    const outsideAlpha = (isWarning ? 0.055 + pulse * 0.025 : isFinal ? 0.16 + pulse * 0.035 : 0.11 + pulse * 0.025) * warmupAlpha;
    const glowAlpha = (isWarning ? 0.24 + pulse * 0.12 : isFinal ? 0.46 + pulse * 0.16 : 0.38 + pulse * 0.12) * warmupAlpha;
    const outerRadius = Math.hypot(map.width, map.height) + Math.max(map.width, map.height);
    const donutRadius = (outerRadius + zone.radius) / 2;
    const donutWidth = Math.max(1, outerRadius - zone.radius);

    if (zone.phase !== 'inactive') {
      this.gfx.lineStyle(donutWidth, LAVA_FILL, outsideAlpha);
      this.gfx.strokeCircle(zone.centerX, zone.centerY, donutRadius);
    }

    if (!isWarning && zone.phase !== 'inactive') {
      this.drawLavaBands(zone, outerRadius, time, isFinal);
    }

    this.gfx.lineStyle(16 + pulse * 5, edgeColor, glowAlpha * 0.36);
    this.gfx.strokeCircle(zone.centerX, zone.centerY, zone.radius);
    this.gfx.lineStyle(5, edgeColor, glowAlpha);
    this.gfx.strokeCircle(zone.centerX, zone.centerY, zone.radius);
    this.gfx.lineStyle(2, 0xfff2a8, (isWarning ? 0.50 + pulse * 0.25 : 0.36 + pulse * 0.20) * warmupAlpha);
    this.gfx.strokeCircle(zone.centerX, zone.centerY, zone.radius + Math.sin(time * 0.008) * 2);
  }

  private getWarmupAlpha(zone: DangerZonePublicState): number {
    if (zone.phase !== 'inactive') {
      const elapsedSinceWarning = Date.now() - zone.warningStartsAt;
      return Phaser.Math.Clamp(elapsedSinceWarning / 900, 0.2, 1);
    }

    const msUntilWarning = zone.warningStartsAt - Date.now();
    if (msUntilWarning > PREHEAT_MS) return 0;
    return Phaser.Math.Clamp(1 - msUntilWarning / PREHEAT_MS, 0, 0.32);
  }

  private drawLavaBands(
    zone: DangerZonePublicState,
    outerRadius: number,
    time: number,
    isFinal: boolean,
  ): void {
    const bandCount = isFinal ? 5 : 3;
    for (let i = 0; i < bandCount; i++) {
      const offset = ((time * (0.035 + i * 0.006)) + i * 90) % 220;
      const radius = zone.radius + 55 + offset;
      if (radius >= outerRadius) continue;
      const alpha = (isFinal ? 0.075 : 0.055) * (1 - Math.min(1, offset / 260));
      this.gfx.lineStyle(4 + i, LAVA_HOT, alpha);
      this.gfx.strokeCircle(zone.centerX, zone.centerY, radius);
    }
  }
}
