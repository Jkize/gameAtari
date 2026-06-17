import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.image('obstacle-bush_01', 'assets/obstacle/bush_01.png');
    this.load.image('obstacle-wood_barricade_01', 'assets/obstacle/wood_barricade_01.png');
    this.load.image('obstacle-rock_block_01', 'assets/obstacle/rock_block_01.png');
    this.load.image('obstacle-steel_block_01', 'assets/obstacle/steel_block_01.png');
    this.load.image('obstacle-mirror_panel_01', 'assets/obstacle/mirror_panel_01.png');
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Generate textures for particle effects ─────────────────────────────
    const pg = this.make.graphics({ x: 0, y: 0 } as any, false);
    pg.fillStyle(0xffffff, 1);
    pg.fillCircle(6, 6, 6);
    pg.generateTexture('particle', 12, 12);
    pg.destroy();

    // ── Background ─────────────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x03060f, 1);
    bg.fillRect(0, 0, W, H);

    // Subtle grid
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x0a1530, 0.5);
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
    frame.lineStyle(1, 0x00ff88, 0.08);
    frame.strokeRect(bX - 16, bY - 16, bW + 32, bH + 32);
    frame.lineStyle(1, 0x00ff88, 0.04);
    frame.strokeRect(bX - 28, bY - 28, bW + 56, bH + 56);

    // Main box
    const box = this.add.graphics().setAlpha(0);
    box.fillStyle(0x000810, 0.85);
    box.fillRect(bX, bY, bW, bH);
    box.lineStyle(1, 0x00ff88, 0.3);
    box.strokeRect(bX, bY, bW, bH);

    // Corner brackets
    const bracket = this.add.graphics().setAlpha(0);
    bracket.lineStyle(2, 0x00ff88, 0.8);
    const cL = 22;
    [
      [bX, bY, 1, 1], [bX + bW, bY, -1, 1],
      [bX, bY + bH, 1, -1], [bX + bW, bY + bH, -1, -1],
    ].forEach(([cx, cy, sx, sy]) => {
      bracket.lineBetween(cx, cy, cx + sx * cL, cy);
      bracket.lineBetween(cx, cy, cx, cy + sy * cL);
    });

    // ── Text elements ──────────────────────────────────────────────────────
    const mono = 'Share Tech Mono, Courier New, monospace';

    const preTitle = this.add.text(W / 2, bY + 30, '[ MULTIPLAYER COMBAT ]', {
      fontSize: '13px', fontFamily: mono, color: '#336655',
    }).setOrigin(0.5).setAlpha(0);

    const title = this.add.text(W / 2, bY + 82, 'TANK ARENA', {
      fontSize: '56px', fontFamily: mono, color: '#00ff88',
      stroke: '#002211', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0.6);

    const version = this.add.text(W / 2, bY + 142, 'v1.0  ·  ANGULAR 22  ·  PHASER 3', {
      fontSize: '11px', fontFamily: mono, color: '#225533',
    }).setOrigin(0.5).setAlpha(0);

    const loader = this.add.text(W / 2, H * 0.78, '■ INITIALIZING SYSTEMS...', {
      fontSize: '13px', fontFamily: mono, color: '#1a4433',
    }).setOrigin(0.5).setAlpha(0);

    // ── Pulsing ring ───────────────────────────────────────────────────────
    const ringGfx = this.add.graphics().setAlpha(0);
    let ringR = 20;
    const tickRing = () => {
      ringR += 1.8;
      if (ringR > 180) ringR = 20;
      ringGfx.clear();
      const a = Math.max(0, 0.55 - ringR / 180);
      ringGfx.lineStyle(1.5, 0x00ff88, a);
      ringGfx.strokeCircle(W / 2, H / 2, ringR);
    };
    this.time.addEvent({ delay: 16, repeat: -1, callback: tickRing });

    // ── Animate in ─────────────────────────────────────────────────────────
    this.tweens.add({
      targets: [box, frame, bracket, ringGfx],
      alpha: 1, duration: 400, ease: 'Quad.out',
    });
    this.tweens.add({
      targets: title, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 600, delay: 150, ease: 'Back.out(1.4)',
    });
    this.tweens.add({
      targets: preTitle, alpha: 0.8,
      duration: 400, delay: 400, ease: 'Quad.out',
    });
    this.tweens.add({
      targets: version, alpha: 0.6,
      duration: 400, delay: 500, ease: 'Quad.out',
    });
    this.tweens.add({
      targets: loader, alpha: 1,
      duration: 300, delay: 700, ease: 'Quad.out',
    });

    // Loader text blink
    this.time.addEvent({
      delay: 500, startAt: 700, repeat: -1,
      callback: () => { loader.setAlpha(loader.alpha > 0.5 ? 0.15 : 1); },
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
