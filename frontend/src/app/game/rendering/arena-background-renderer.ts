import Phaser from 'phaser';
import { ACTIVE_BACKGROUND_SCENARIO } from '@game/rendering/background-scenarios';
import { C, seededRandom } from '@game/config/game-scene.constants';

export class ArenaBackgroundRenderer {
  constructor(private readonly bgGfx: Phaser.GameObjects.Graphics) {}

  draw(mapW: number, mapH: number): void {
    const W = mapW;
    const H = mapH;
    const ts = 80;
    const rng = seededRandom(0xdeadbeef);
    const scenario = ACTIVE_BACKGROUND_SCENARIO;

    this.bgGfx.clear();
    this.bgGfx.fillStyle(scenario.base, 1);
    this.bgGfx.fillRect(0, 0, W, H);

    const noiseCount = Math.floor(W * H / 36000);
    for (let i = 0; i < noiseCount; i++) {
      const color = scenario.baseNoise[Math.floor(rng() * scenario.baseNoise.length)] ?? scenario.base;
      this.bgGfx.fillStyle(color, 0.08 + rng() * 0.08);
      this.bgGfx.fillEllipse(rng() * W, rng() * H, 100 + rng() * 220, 28 + rng() * 70);
    }

    this.bgGfx.lineStyle(1, scenario.minorLine, 0.20);
    for (let x = 0; x <= W; x += ts) this.bgGfx.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += ts) this.bgGfx.lineBetween(0, y, W, y);

    this.bgGfx.lineStyle(1, scenario.majorLine, 0.24);
    for (let x = 0; x <= W; x += ts * 4) this.bgGfx.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += ts * 4) this.bgGfx.lineBetween(0, y, W, y);

    const patch = scenario.patch;
    const patchCount = 18 + Math.floor(W * H / 65000);
    for (let i = 0; i < patchCount; i++) {
      const cx = 70 + rng() * (W - 140);
      const cy = 70 + rng() * (H - 140);
      const pr = patch.radiusMin + rng() * (patch.radiusMax - patch.radiusMin);
      this.bgGfx.fillStyle(patch.color, patch.alphaMin + rng() * (patch.alphaMax - patch.alphaMin));
      this.bgGfx.fillEllipse(
        cx,
        cy,
        pr * patch.widthScale,
        pr * (patch.heightScaleMin + rng() * (patch.heightScaleMax - patch.heightScaleMin)),
      );

      patch.layers.forEach(layer => {
        this.bgGfx.fillStyle(layer.color, layer.alphaMin + rng() * (layer.alphaMax - layer.alphaMin));
        this.bgGfx.fillEllipse(
          cx + layer.offsetX + (rng() - 0.5) * 18,
          cy + layer.offsetY + (rng() - 0.5) * 12,
          pr * layer.widthScale,
          pr * layer.heightScale,
        );
      });
    }

    const borderPoints: [number, number][] = [
      [0, 0], [W, 0], [0, H], [W, H],
      [W / 2, 0], [W / 2, H], [0, H / 2], [W, H / 2],
      [W / 4, 0], [W * 3 / 4, 0], [W / 4, H], [W * 3 / 4, H],
      [0, H / 3], [0, H * 2 / 3], [W, H / 3], [W, H * 2 / 3],
    ];
    for (const [bpx, bpy] of borderPoints) {
      const cx = Math.max(55, Math.min(W - 55, bpx));
      const cy = Math.max(55, Math.min(H - 55, bpy));
      for (let j = 0; j < 4; j++) {
        const ox = cx + (rng() - 0.5) * 80;
        const oy = cy + (rng() - 0.5) * 80;
        const r2 = 16 + rng() * 30;
        this.bgGfx.fillStyle(scenario.scrubDark, 0.42);
        this.bgGfx.fillEllipse(ox, oy, r2 * 1.9, r2 * (0.35 + rng() * 0.45));
        this.bgGfx.fillStyle(scenario.scrubMid, 0.28);
        this.bgGfx.fillEllipse(ox, oy - r2 * 0.10, r2 * 1.2, r2 * 0.42);
        this.bgGfx.fillStyle(scenario.scrubLight, 0.16);
        this.bgGfx.fillEllipse(ox - r2 * 0.12, oy - r2 * 0.16, r2 * 0.7, r2 * 0.24);
      }
    }

    const crackCount = Math.floor(W / 70);
    for (let i = 0; i < crackCount; i++) {
      const cx = rng() * W;
      const cy = rng() * H;
      const ex = cx + (rng() - 0.5) * 60;
      const ey = cy + (rng() - 0.5) * 60;
      this.bgGfx.lineStyle(1, scenario.crack, 0.32);
      this.bgGfx.lineBetween(cx, cy, ex, ey);
      const mx2 = (cx + ex) / 2;
      const my2 = (cy + ey) / 2;
      this.bgGfx.lineBetween(mx2, my2, mx2 + (rng() - 0.5) * 22, my2 + (rng() - 0.5) * 22);
    }

    this.bgGfx.lineStyle(3, C.BORDER, 0.45);
    this.bgGfx.strokeRect(0, 0, W, H);
    this.bgGfx.lineStyle(1, scenario.innerBorder, 0.22);
    this.bgGfx.strokeRect(4, 4, W - 8, H - 8);
  }
}
