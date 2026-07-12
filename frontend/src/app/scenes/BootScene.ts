import Phaser from 'phaser';
import { PHASER_GAME_ASSETS } from '../game/game-assets';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    PHASER_GAME_ASSETS.forEach((asset) => {
      if (asset.type === 'audio') this.load.audio(asset.key, asset.path);
      else if (asset.type === 'image') this.load.image(asset.key, asset.path);
      else this.load.svg(asset.key, asset.path, asset.textureSize);
    });
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const scenario = ACTIVE_BACKGROUND_SCENARIO;

    // ── Generate textures for particle effects ─────────────────────────────
    const pg = this.make.graphics({ x: 0, y: 0 } as any, false);
    pg.fillStyle(0xffffff, 1);
    pg.fillCircle(6, 6, 6);
    pg.generateTexture('particle', 12, 12);
    pg.destroy();

    // ── Background ─────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(Number.parseInt(scenario.pageBackground.slice(1), 16), 1);
    bg.fillRect(0, 0, W, H);

    // Subtle sand survey grid
    const grid = this.add.graphics();
    grid.lineStyle(1, scenario.majorLine, 0.25);
    const gs = 64;
    for (let x = 0; x <= W; x += gs) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += gs) grid.lineBetween(0, y, W, y);

    // ── Title box ──────────────────────────────────────────────────────────
    const bW = 480;
    const bH = 200;
    const bX = (W - bW) / 2;
    const bY = (H - bH) / 2;

    // Outer dim glow frame
    const frame = this.add.graphics().setAlpha(0);
    frame.lineStyle(1, scenario.innerBorder, 0.12);
    frame.strokeRect(bX - 16, bY - 16, bW + 32, bH + 32);
    frame.lineStyle(1, scenario.border, 0.08);
    frame.strokeRect(bX - 28, bY - 28, bW + 56, bH + 56);

    // Main box
    const box = this.add.graphics().setAlpha(0);
    box.fillStyle(scenario.boot.panel, 0.88);
    box.fillRect(bX, bY, bW, bH);
    box.lineStyle(1, scenario.innerBorder, 0.35);
    box.strokeRect(bX, bY, bW, bH);

    // Corner brackets
    const bracket = this.add.graphics().setAlpha(0);
    bracket.lineStyle(2, scenario.innerBorder, 0.8);
    const cL = 22;
    [
      [bX, bY, 1, 1],
      [bX + bW, bY, -1, 1],
      [bX, bY + bH, 1, -1],
      [bX + bW, bY + bH, -1, -1],
    ].forEach(([cx, cy, sx, sy]) => {
      bracket.lineBetween(cx, cy, cx + sx * cL, cy);
      bracket.lineBetween(cx, cy, cx, cy + sy * cL);
    });

    // ── Text elements ──────────────────────────────────────────────────────
    const mono = 'Share Tech Mono, Courier New, monospace';

    const preTitle = this.add
      .text(W / 2, bY + 30, '[ MULTIPLAYER COMBAT ]', {
        fontSize: '13px',
        fontFamily: mono,
        color: scenario.boot.preTitleText,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const title = this.add
      .text(W / 2, bY + 82, 'TANK ARENA', {
        fontSize: '56px',
        fontFamily: mono,
        color: scenario.boot.titleText,
        stroke: scenario.boot.titleStroke,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(0.6);

    const version = this.add
      .text(W / 2, bY + 142, 'v1.0  ·  ANGULAR 22  ·  PHASER 3', {
        fontSize: '11px',
        fontFamily: mono,
        color: scenario.boot.metaText,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const loader = this.add
      .text(W / 2, H * 0.78, '■ INITIALIZING SYSTEMS...', {
        fontSize: '13px',
        fontFamily: mono,
        color: scenario.boot.loaderText,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // ── Pulsing ring ───────────────────────────────────────────────────────
    const ringGfx = this.add.graphics().setAlpha(0);
    let ringR = 20;
    const tickRing = () => {
      ringR += 1.8;
      if (ringR > 180) ringR = 20;
      ringGfx.clear();
      const a = Math.max(0, 0.55 - ringR / 180);
      ringGfx.lineStyle(1.5, scenario.innerBorder, a);
      ringGfx.strokeCircle(W / 2, H / 2, ringR);
    };
    this.time.addEvent({ delay: 16, repeat: -1, callback: tickRing });

    // ── Animate in ─────────────────────────────────────────────────────────
    this.tweens.add({
      targets: [box, frame, bracket, ringGfx],
      alpha: 1,
      duration: 400,
      ease: 'Quad.out',
    });
    this.tweens.add({
      targets: title,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 600,
      delay: 150,
      ease: 'Back.out(1.4)',
    });
    this.tweens.add({
      targets: preTitle,
      alpha: 0.8,
      duration: 400,
      delay: 400,
      ease: 'Quad.out',
    });
    this.tweens.add({
      targets: version,
      alpha: 0.6,
      duration: 400,
      delay: 500,
      ease: 'Quad.out',
    });
    this.tweens.add({
      targets: loader,
      alpha: 1,
      duration: 300,
      delay: 700,
      ease: 'Quad.out',
    });

    // Loader text blink
    this.time.addEvent({
      delay: 500,
      startAt: 700,
      repeat: -1,
      callback: () => {
        loader.setAlpha(loader.alpha > 0.5 ? 0.15 : 1);
      },
    });

    // ── Transition to GameScene ────────────────────────────────────────────
    this.time.delayedCall(2200, () => {
      this.cameras.main.fadeOut(500, 3, 6, 15);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene');
      });
    });
  }
}
