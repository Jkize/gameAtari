import Phaser from 'phaser';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';

const OBSTACLE_SVG_TEXTURE_SIZE = { width: 64, height: 64 } as const;
const WEAPON_SVG_TEXTURE_SIZE = { width: 96, height: 96 } as const;
const HUD_ICON_SVG_TEXTURE_SIZE = { width: 96, height: 96 } as const;
// Matches hud-bottom-panel.svg and the final HUD display rect ratio:
// 1280 x (50 * 100 / 70) => 17.92:1.
const HUD_BOTTOM_PANEL_TEXTURE_SIZE = { width: 1792, height: 100 } as const;

const SOUND_ASSETS = [
  ['weapon-standard-fire', 'assets/sounds/weapon_standard_fire.ogg'],
  ['weapon-triple-shot-fire', 'assets/sounds/weapon_triple_shot_fire.ogg'],
  ['weapon-shotgun-fire', 'assets/sounds/weapon_shotgun_fire.ogg'],
  ['weapon-grenade-launch', 'assets/sounds/weapon_grenade_launch.ogg'],
  ['weapon-grenade-explode', 'assets/sounds/weapon_grenade_explode.ogg'],
  ['weapon-laser-fire', 'assets/sounds/weapon_laser_fire.ogg'],
  ['weapon-laser-reflect-mirror', 'assets/sounds/weapon_laser_reflect_mirror.ogg'],
  ['bullet-hit-spark', 'assets/sounds/bullet_hit_spark.ogg'],
  ['bullet-hit-wood', 'assets/sounds/bullet_hit_wood.ogg'],
  ['bullet-hit-rock', 'assets/sounds/bullet_hit_rock.ogg'],
  ['bullet-hit-steel', 'assets/sounds/bullet_hit_steel.ogg'],
  ['bullet-mirror-ricochet', 'assets/sounds/bullet_mirror_ricochet.ogg'],
  ['weapon-reload-start', 'assets/sounds/weapon_reload_start.ogg'],
  ['weapon-reload-complete', 'assets/sounds/weapon_reload_complete.ogg'],
  ['powerup-pickup-weapon', 'assets/sounds/powerup_pickup_weapon.ogg'],
  ['player-dash', 'assets/sounds/dash.ogg'],
] as const;

const OBSTACLE_SVG_ASSETS = [
  ['obstacle-bush_01_rounded_dense', 'assets/obstacle/bush/bush_01_rounded_dense.svg'],
  ['obstacle-bush_02_irregular_leafy', 'assets/obstacle/bush/bush_02_irregular_leafy.svg'],
  ['obstacle-bush_03_compact_arcade', 'assets/obstacle/bush/bush_03_compact_arcade.svg'],
  ['obstacle-bush_04_wide_low', 'assets/obstacle/bush/bush_04_wide_low.svg'],
  ['obstacle-decoration_01_spiky_organic', 'assets/obstacle/decoration/decoration_01_spiky_organic.svg'],
  ['obstacle-decoration_02_two_lobed', 'assets/obstacle/decoration/decoration_02_two_lobed.svg'],
  ['obstacle-decoration_03_pink_yellow_flowers', 'assets/obstacle/decoration/decoration_03_pink_yellow_flowers.svg'],
  ['obstacle-decoration_04_grass_blue_flowers', 'assets/obstacle/decoration/decoration_04_grass_blue_flowers.svg'],
  ['obstacle-decoration_05_wild_red_flowers', 'assets/obstacle/decoration/decoration_05_wild_red_flowers.svg'],
  ['obstacle-decoration_06_sharp_grass_pink_yellow', 'assets/obstacle/decoration/decoration_06_sharp_grass_pink_yellow.svg'],
  ['obstacle-decoration_07_leafy_blue_flower', 'assets/obstacle/decoration/decoration_07_leafy_blue_flower.svg'],
  ['obstacle-decoration_08_tall_grass_wildflowers', 'assets/obstacle/decoration/decoration_08_tall_grass_wildflowers.svg'],
  ['obstacle-decoration_09_cactus_flowers', 'assets/obstacle/decoration/decoration_09_cactus_flowers.svg'],
  ['obstacle-decoration_10_reed_patch_orange', 'assets/obstacle/decoration/decoration_10_reed_patch_orange.svg'],
  ['obstacle-decoration_11_fern_star', 'assets/obstacle/decoration/decoration_11_fern_star.svg'],
  ['obstacle-decoration_12_clover_patch', 'assets/obstacle/decoration/decoration_12_clover_patch.svg'],
  ['obstacle-decoration_13_dry_grass_mix', 'assets/obstacle/decoration/decoration_13_dry_grass_mix.svg'],
  ['obstacle-decoration_14_vine_swirl', 'assets/obstacle/decoration/decoration_14_vine_swirl.svg'],
  ['obstacle-wood_barricade_1', 'assets/obstacle/wood_barricade_1.svg'],
  ['obstacle-wood_barricade_2', 'assets/obstacle/wood_barricade_2.svg'],
  ['obstacle-wood_barricade_3', 'assets/obstacle/wood_barricade_3.svg'],
  ['obstacle-rock_block_1', 'assets/obstacle/rock_block_1.svg'],
  ['obstacle-rock_block_2', 'assets/obstacle/rock_block_2.svg'],
  ['obstacle-rock_block_3', 'assets/obstacle/rock_block_3.svg'],
] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    OBSTACLE_SVG_ASSETS.forEach(([key, path]) => {
      this.load.svg(key, path, OBSTACLE_SVG_TEXTURE_SIZE);
    });

    this.load.image('obstacle-steel_block_01', 'assets/obstacle/steel_block_01.png');
    this.load.image('obstacle-mirror_panel_01', 'assets/obstacle/mirror_panel_01.png');
    this.load.svg('weapon-power_triple_shot', 'assets/weapon/power_triple_shot.svg', WEAPON_SVG_TEXTURE_SIZE);
    this.load.svg('weapon-power_shotgun', 'assets/weapon/power_shotgun.svg', WEAPON_SVG_TEXTURE_SIZE);
    this.load.svg('weapon-power_grenade', 'assets/weapon/power_grenade.svg', WEAPON_SVG_TEXTURE_SIZE);
    this.load.svg('weapon-power_laser', 'assets/weapon/power_laser.svg', WEAPON_SVG_TEXTURE_SIZE);
    this.load.svg('hud-dash', 'assets/power/dash.svg', HUD_ICON_SVG_TEXTURE_SIZE);
    this.load.svg('hud-shot', 'assets/power/shot.svg', HUD_ICON_SVG_TEXTURE_SIZE);
    this.load.svg('hud-shield', 'assets/power/shield.svg', HUD_ICON_SVG_TEXTURE_SIZE);
    this.load.svg('hud-bottom-panel', 'assets/hud/hud-bottom-panel.svg', HUD_BOTTOM_PANEL_TEXTURE_SIZE);

    SOUND_ASSETS.forEach(([key, path]) => {
      this.load.audio(key, path);
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
      [bX, bY, 1, 1], [bX + bW, bY, -1, 1],
      [bX, bY + bH, 1, -1], [bX + bW, bY + bH, -1, -1],
    ].forEach(([cx, cy, sx, sy]) => {
      bracket.lineBetween(cx, cy, cx + sx * cL, cy);
      bracket.lineBetween(cx, cy, cx, cy + sy * cL);
    });

    // ── Text elements ──────────────────────────────────────────────────────
    const mono = 'Share Tech Mono, Courier New, monospace';

    const preTitle = this.add.text(W / 2, bY + 30, '[ MULTIPLAYER COMBAT ]', {
      fontSize: '13px', fontFamily: mono, color: scenario.boot.preTitleText,
    }).setOrigin(0.5).setAlpha(0);

    const title = this.add.text(W / 2, bY + 82, 'TANK ARENA', {
      fontSize: '56px', fontFamily: mono, color: scenario.boot.titleText,
      stroke: scenario.boot.titleStroke, strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScale(0.6);

    const version = this.add.text(W / 2, bY + 142, 'v1.0  ·  ANGULAR 22  ·  PHASER 3', {
      fontSize: '11px', fontFamily: mono, color: scenario.boot.metaText,
    }).setOrigin(0.5).setAlpha(0);

    const loader = this.add.text(W / 2, H * 0.78, '■ INITIALIZING SYSTEMS...', {
      fontSize: '13px', fontFamily: mono, color: scenario.boot.loaderText,
    }).setOrigin(0.5).setAlpha(0);

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
