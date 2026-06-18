import Phaser from 'phaser';
import { socketManager } from '../network/socket';
import { GameState, PlayerPublicState, BulletPublicState, Obstacle, ObstacleAssetId, ObstacleType } from '../types/game-state.types';
import { PlayerInput } from '../types/input.types';
import { ensureTankSvgTextures, TANK_BODY_ROTATION_OFFSET, TANK_TURRET_ORIGIN_X, TANK_TURRET_ORIGIN_Y, TANK_TURRET_ROTATION_OFFSET } from '../rendering/tank-svg-textures';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';
import type { Socket } from 'socket.io-client';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  BG:         ACTIVE_BACKGROUND_SCENARIO.base,
  GRID:       ACTIVE_BACKGROUND_SCENARIO.minorLine,
  GRID_MAJOR: ACTIVE_BACKGROUND_SCENARIO.majorLine,
  BORDER:     ACTIVE_BACKGROUND_SCENARIO.border,
  PANEL:      0x2b1d10,
  TEXT_WARM:  0xf2cf8f,
  TEXT_MUTED: 0x8c714a,

  BULLET:     0xffee00,
  BULLET_GLOW: 0xff9900,

  HP_HIGH: 0x00ff44,
  HP_MED:  0xffcc00,
  HP_LOW:  0xff2244,
} as const;

function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >>  8) & 0xff) * factor);
  const b = Math.round(( color        & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function colorToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

const OBS: Record<string, { fill: number; glow: number }> = {
  bush:   { fill: 0x16451f, glow: 0x33cc33 },
  wood:   { fill: 0x4a2508, glow: 0xcc6622 },
  rock:   { fill: 0x30303a, glow: 0x8888aa },
  steel:  { fill: 0x1a2438, glow: 0x3366ff },
  mirror: { fill: 0x004455, glow: 0x00ddff },
};

const OBSTACLE_ASSET_BY_TYPE: Record<ObstacleType, ObstacleAssetId> = {
  bush: 'bush_01',
  wood: 'wood_barricade_01',
  rock: 'rock_block_01',
  steel: 'steel_block_01',
  mirror: 'mirror_panel_01',
};

const MONO = 'Share Tech Mono, Courier New, monospace';
const BODY_TURN_STEP = 0.1;
const PLAYER_LABEL_OFFSET = 1.5;
const TANK_TURRET_SCALE = 3;

interface TankSprites {
  body: Phaser.GameObjects.Image;
  turret: Phaser.GameObjects.Image;
}

// ── Seeded random helpers ─────────────────────────────────────────────────────
function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Scene ────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // Socket
  private socket!: Socket;
  private myPlayerId = '';

  // Authoritative state (latest from server)
  private gameState: GameState | null = null;

  // World size (updated once we receive map)
  private mapW = 1600;
  private mapH = 1200;

  // Rendering layers
  private bgGfx!: Phaser.GameObjects.Graphics;    // static background (depth 0)
  private glowGfx!: Phaser.GameObjects.Graphics;  // ADD blend – all glows (depth 4)
  private mainGfx!: Phaser.GameObjects.Graphics;  // NORMAL – bodies, HP bars (depth 5)
  private playerUiGfx!: Phaser.GameObjects.Graphics;

  // Static obstacle render objects (one per obstacle, depth 2)
  private obsGfx: Map<string, Phaser.GameObjects.GameObject> = new Map();

  // Camera follow target (invisible rectangle that we move each frame)
  private camTarget!: Phaser.GameObjects.Rectangle;

  // HUD elements (scrollFactor 0, depth 100+)
  private hudPanelGfx!: Phaser.GameObjects.Graphics;
  private hudHpBarGfx!: Phaser.GameObjects.Graphics;
  private hudHpText!: Phaser.GameObjects.Text;
  private hudDashText!: Phaser.GameObjects.Text;
  private hudAmmoText!: Phaser.GameObjects.Text;
  private hudPlayerCountText!: Phaser.GameObjects.Text;
  private hudTitleText!: Phaser.GameObjects.Text;
  private hudStatusText!: Phaser.GameObjects.Text;

  // Center overlay
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private centerBig!: Phaser.GameObjects.Text;
  private centerSub!: Phaser.GameObjects.Text;
  private centerHint!: Phaser.GameObjects.Text;

  // Input
  private keys!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key;
                    S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key;
                    SHIFT: Phaser.Input.Keyboard.Key; ENTER: Phaser.Input.Keyboard.Key; };
  private lastInputSend = 0;
  private readonly INPUT_HZ = 1000 / 60;
  private pendingDash = false;

  // Per-player name labels (world space, depth 10)
  private playerNameTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private playerTankSprites: Map<string, TankSprites> = new Map();

  // Effect tracking
  private playerMaxHp: Map<string, number> = new Map();
  private playerLastHp: Map<string, number> = new Map();
  private playerLastPos: Map<string, { x: number; y: number }> = new Map();
  private bulletLastPos: Map<string, { x: number; y: number }> = new Map();
  private prevPlayerIds: Set<string> = new Set();
  private prevBulletIds: Set<string> = new Set();
  private prevObsIds:    Set<string> = new Set();

  constructor() {
    super({ key: 'GameScene' });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  create(): void {
    this.bgGfx   = this.add.graphics().setDepth(0);
    this.glowGfx = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.mainGfx = this.add.graphics().setDepth(5);
    this.playerUiGfx = this.add.graphics().setDepth(8);

    this.camTarget = this.add.rectangle(800, 600, 1, 1, 0x000000, 0).setDepth(-1);
    this.cameras.main.startFollow(this.camTarget, true, 0.08, 0.08);

    this.createHUD();
    this.setupInput();
    this.setupSocket();

    this.cameras.main.fadeIn(500, 3, 6, 15);
  }

  override update(time: number): void {
    const state = this.gameState;

    if (!state) {
      this.showConnectingOverlay();
      return;
    }

    this.checkStateChanges();

    this.glowGfx.clear();
    this.mainGfx.clear();
    this.playerUiGfx.clear();

    this.drawObstacleGlows();
    this.drawPlayers(time);
    this.drawBullets(time);

    this.followLocalPlayer();
    this.sendInput(time);
    this.updateHUD(time);
  }

  // ── Socket setup ──────────────────────────────────────────────────────────
  private setupSocket(): void {
    this.socket = socketManager.connect();

    this.socket.on('gameJoined', (data: { playerId: string; map: GameState['map']; status: GameState['status'] }) => {
      this.resetRoundRenderState();
      this.myPlayerId = data.playerId;
      this.gameState = { status: data.status, map: data.map, players: [], bullets: [] };
      this.mapW = data.map.width;
      this.mapH = data.map.height;
      this.drawBackground();
      this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
    });

    this.socket.on('gameState', (state: GameState) => {
      this.gameState = state;
    });

    this.socket.on('playerDisconnected', (data: { playerId: string }) => {
      const pos = this.playerLastPos.get(data.playerId);
      if (pos) this.spawnExplosion(pos.x, pos.y, true);
      this.playerMaxHp.delete(data.playerId);
      this.playerLastHp.delete(data.playerId);
      this.playerLastPos.delete(data.playerId);
    });

    this.socket.on('connect', () => {
      this.socket.emit('joinGame');
    });

    if (this.socket.connected) {
      this.socket.emit('joinGame');
    }
  }

  // ── Input setup ───────────────────────────────────────────────────────────
  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      W:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
    };

    kb.on('keydown-ENTER', () => {
      if (this.gameState?.status === 'waiting' && this.myPlayerId) {
        this.socket.emit('startGame');
      } else if (this.gameState?.status === 'finished') {
        this.socket.emit('restartGame');
      }
    });

    kb.on('keydown-SHIFT', () => {
      this.pendingDash = true;
    });
  }

  // ── Background ────────────────────────────────────────────────────────────
  private resetRoundRenderState(): void {
    this.obsGfx.forEach(gfx => gfx.destroy());
    this.obsGfx.clear();

    this.playerNameTexts.forEach(txt => txt.destroy());
    this.playerNameTexts.clear();

    this.playerTankSprites.forEach(tank => {
      tank.body.destroy();
      tank.turret.destroy();
    });
    this.playerTankSprites.clear();

    this.playerMaxHp.clear();
    this.playerLastHp.clear();
    this.playerLastPos.clear();
    this.bulletLastPos.clear();
    this.prevPlayerIds.clear();
    this.prevBulletIds.clear();
    this.prevObsIds.clear();
  }

  private drawBackground(): void {
    const W   = this.mapW;
    const H   = this.mapH;
    const ts  = 80;
    const rng = seededRandom(0xdeadbeef);
    const scenario = ACTIVE_BACKGROUND_SCENARIO;

    this.bgGfx.clear();

    // Warm sand base
    this.bgGfx.fillStyle(scenario.base, 1);
    this.bgGfx.fillRect(0, 0, W, H);

    // Broad color variation keeps the terrain natural without image tiles.
    const noiseCount = Math.floor(W * H / 36000);
    for (let i = 0; i < noiseCount; i++) {
      const color = scenario.baseNoise[Math.floor(rng() * scenario.baseNoise.length)] ?? scenario.base;
      this.bgGfx.fillStyle(color, 0.08 + rng() * 0.08);
      this.bgGfx.fillEllipse(
        rng() * W,
        rng() * H,
        100 + rng() * 220,
        28 + rng() * 70,
      );
    }

    // Faint survey/tile lines, like a worn arena marked into sand.
    this.bgGfx.lineStyle(1, scenario.minorLine, 0.20);
    for (let x = 0; x <= W; x += ts) this.bgGfx.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += ts) this.bgGfx.lineBetween(0, y, W, y);

    this.bgGfx.lineStyle(1, scenario.majorLine, 0.24);
    for (let x = 0; x <= W; x += ts * 4) this.bgGfx.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += ts * 4) this.bgGfx.lineBetween(0, y, W, y);

    // Wind-shaped dunes and compacted sand patches.
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

    // Dry scrub clusters around the border make the arena feel grounded.
    const borderPoints: [number, number][] = [
      [0, 0], [W, 0], [0, H], [W, H],
      [W/2, 0], [W/2, H], [0, H/2], [W, H/2],
      [W/4, 0], [W*3/4, 0], [W/4, H], [W*3/4, H],
      [0, H/3], [0, H*2/3], [W, H/3], [W, H*2/3],
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

    // Ground cracks
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
      this.bgGfx.lineBetween(mx2, my2, mx2 + (rng()-0.5)*22, my2 + (rng()-0.5)*22);
    }

    // Worn arena boundary
    this.bgGfx.lineStyle(3, C.BORDER, 0.45);
    this.bgGfx.strokeRect(0, 0, W, H);
    this.bgGfx.lineStyle(1, scenario.innerBorder, 0.22);
    this.bgGfx.strokeRect(4, 4, W - 8, H - 8);
  }

  // ── Obstacle management ───────────────────────────────────────────────────
  private createObstacleGfx(obs: Obstacle): Phaser.GameObjects.GameObject {
    const textureKey = this.getObstacleTextureKey(obs);
    if (obs.type !== 'mirror' && textureKey && this.textures.exists(textureKey)) {
      return this.add.image(obs.x, obs.y, textureKey)
        .setOrigin(0.5)
        .setDisplaySize(obs.width, obs.height)
        .setDepth(obs.type === 'bush' ? 6 : 2);
    }

    const gfx = this.add.graphics().setDepth(obs.type === 'bush' ? 6 : 2);
    const rng = seededRandom(hashString(obs.id));

    switch (obs.type) {
      case 'bush':   this.drawBushObstacle(gfx, obs, rng);   break;
      case 'wood':   this.drawWoodObstacle(gfx, obs, rng);   break;
      case 'rock':   this.drawRockObstacle(gfx, obs, rng);   break;
      case 'steel':  this.drawSteelObstacle(gfx, obs, rng);  break;
      case 'mirror': this.drawMirrorObstacle(gfx, obs, rng); break;
      default: {
        const col = OBS[obs.type] ?? OBS['rock'];
        gfx.fillStyle(col.fill, 1);
        gfx.fillRect(obs.x - obs.width / 2, obs.y - obs.height / 2, obs.width, obs.height);
      }
    }

    return gfx;
  }

  private getObstacleTextureKey(obs: Obstacle): string | null {
    const assetId = obs.assetId ?? OBSTACLE_ASSET_BY_TYPE[obs.type];
    return assetId ? `obstacle-${assetId}` : null;
  }

  // ── Obstacle draw methods ─────────────────────────────────────────────────

  private drawBushObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle, rng: () => number): void {
    const x = obs.x - obs.width  / 2;
    const y = obs.y - obs.height / 2;
    const w = obs.width;
    const h = obs.height;

    // Drop shadow
    gfx.fillStyle(0x000000, 0.45);
    gfx.fillRect(x + 7, y + 9, w, h);

    // Dark soil/interior base
    gfx.fillStyle(0x071408, 1);
    gfx.fillRect(x, y, w, h);

    // Bottom dark trim (ground level)
    gfx.fillStyle(0x040d05, 0.70);
    gfx.fillRect(x, y + h * 0.82, w, h * 0.18);

    // ── Lower interior dark leaf mass ──
    const darkLeaves = [0x0e2e10, 0x133818, 0x174a1c, 0x1a5220];
    for (let i = 0; i < 8 + Math.floor(rng() * 4); i++) {
      const lx = x + 2 + rng() * (w - 4);
      const ly = y + h * 0.35 + rng() * (h * 0.55);
      const lr = w * (0.10 + rng() * 0.16);
      gfx.fillStyle(darkLeaves[Math.floor(rng() * darkLeaves.length)], 0.95);
      gfx.fillCircle(lx, ly, lr);
    }

    // ── Mid-layer leaves ──
    const midLeaves = [0x1c6020, 0x256828, 0x2a7030, 0x2f7d32, 0x38903c];
    for (let i = 0; i < 9 + Math.floor(rng() * 5); i++) {
      const lx = x + rng() * w;
      const ly = y + h * 0.20 + rng() * (h * 0.65);
      const lr = w * (0.09 + rng() * 0.15);
      gfx.fillStyle(midLeaves[Math.floor(rng() * midLeaves.length)], 0.88);
      gfx.fillCircle(lx, ly, lr);
    }

    // ── Organic bumpy top silhouette ──
    // A row of overlapping circles creates the rounded-lobe hedge profile
    const bumpCount = 4 + Math.floor(rng() * 3);
    const bumpSpacing = w / bumpCount;
    for (let i = 0; i < bumpCount; i++) {
      const bx = x + bumpSpacing * (i + 0.5) + (rng() - 0.5) * bumpSpacing * 0.30;
      const br = h * (0.38 + rng() * 0.16);
      const by2 = y + h * 0.58;
      // Dark base of bump
      gfx.fillStyle(0x1e6624, 1);
      gfx.fillCircle(bx, by2, br);
      // Mid green
      gfx.fillStyle(0x3d9e40, 0.85);
      gfx.fillCircle(bx, by2 - br * 0.08, br * 0.80);
      // Bright top highlight
      gfx.fillStyle(0x5aba58, 0.65);
      gfx.fillCircle(bx - br * 0.10, by2 - br * 0.22, br * 0.52);
      // Lime specular at peak
      gfx.fillStyle(0x8ee88a, 0.35);
      gfx.fillCircle(bx - br * 0.14, by2 - br * 0.32, br * 0.26);
    }

    // ── Tiny flowers ──
    const flowerPalette = [0xff77cc, 0xffff88, 0xffffff, 0xff99aa];
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
      const fx = x + w * 0.10 + rng() * w * 0.80;
      const fy = y + h * 0.20 + rng() * h * 0.50;
      gfx.fillStyle(flowerPalette[Math.floor(rng() * flowerPalette.length)], 0.85);
      gfx.fillCircle(fx, fy, 2 + rng() * 2);
      gfx.fillStyle(0xffee44, 0.75);
      gfx.fillCircle(fx, fy, 0.9);
    }
  }

  private drawWoodObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle, rng: () => number): void {
    const x = obs.x - obs.width  / 2;
    const y = obs.y - obs.height / 2;
    const w = obs.width;
    const h = obs.height;

    // Shadow
    gfx.fillStyle(0x000000, 0.38);
    gfx.fillRect(x + 4, y + 5, w, h);

    // Dark base
    gfx.fillStyle(0x3a1c06, 1);
    gfx.fillRect(x, y, w, h);

    // Planks
    const plankH = h > 56 ? 16 : 12;
    const plankCount = Math.ceil(h / plankH);
    for (let i = 0; i < plankCount; i++) {
      const py   = y + i * plankH;
      const ph   = Math.min(plankH - 1, y + h - py);
      const shade = i % 2 === 0 ? 0x6b3410 : 0x592c0b;
      gfx.fillStyle(shade, 1);
      gfx.fillRect(x + 1, py, w - 2, ph);

      // Wood grain strokes
      gfx.lineStyle(1, 0x3a1c06, 0.38);
      const grains = 3;
      for (let g = 0; g < grains; g++) {
        const gx = x + (w / (grains + 1)) * (g + 1) + (rng() - 0.5) * 5;
        gfx.lineBetween(gx, py + 2, gx + (rng() - 0.5) * 9, py + ph - 2);
      }
    }

    // Top-edge highlight
    gfx.fillStyle(0xb56a24, 0.28);
    gfx.fillRect(x + 1, y, w - 2, 4);

    // Nail heads
    const nailSpacing = Math.max(16, Math.floor(w / 4));
    for (let nx = x + nailSpacing / 2; nx < x + w; nx += nailSpacing) {
      gfx.fillStyle(0x20100a, 1);
      gfx.fillCircle(nx, y + 5, 2.2);
      gfx.fillStyle(0x7a4520, 0.55);
      gfx.fillCircle(nx - 0.6, y + 4.4, 1.0);
    }

    // Outer worn border
    gfx.lineStyle(2, 0xcc6622, 0.22);
    gfx.strokeRect(x, y, w, h);
    gfx.lineStyle(1, 0x1e0e04, 0.55);
    gfx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  private drawRockObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle, rng: () => number): void {
    const x = obs.x - obs.width  / 2;
    const y = obs.y - obs.height / 2;
    const w = obs.width;
    const h = obs.height;

    // Drop shadow
    gfx.fillStyle(0x000000, 0.52);
    gfx.fillRect(x + 6, y + 8, w, h);

    // ── Draw as 2 separate stone slabs (looks like ruin blocks) ──
    const numBlocks = w > 72 ? 2 : 1;
    const gap = 3;
    const blockW = (w - gap * (numBlocks - 1)) / numBlocks;

    for (let b = 0; b < numBlocks; b++) {
      const bx  = x + b * (blockW + gap);
      const bby = y + (b % 2) * (h * 0.06); // slight vertical offset per block
      const bw  = blockW;
      const bh  = h - (b % 2) * (h * 0.06);

      // Block shadow face (bottom/right darker edge)
      gfx.fillStyle(0x1a1a22, 1);
      gfx.fillRect(bx, bby, bw, bh);

      // Main front face
      gfx.fillStyle(0x383848, 1);
      gfx.fillRect(bx + 2, bby + 2, bw - 4, bh - 4);

      // Top face highlight (3D top surface)
      gfx.fillStyle(0x585870, 0.65);
      gfx.fillRect(bx + 2, bby + 2, bw - 4, Math.max(6, bh * 0.24));

      // Left-edge lighter strip (3D left surface)
      gfx.fillStyle(0x484860, 0.45);
      gfx.fillRect(bx + 2, bby + 2, Math.max(4, bw * 0.10), bh - 4);

      // Crack lines
      for (let i = 0; i < 1 + Math.floor(rng() * 2); i++) {
        const sx = bx + 6 + rng() * (bw - 12);
        const sy = bby + bh * 0.28 + rng() * (bh * 0.45);
        const ex = sx + (rng() - 0.5) * bw * 0.50;
        const ey = sy + rng() * bh * 0.35;
        gfx.lineStyle(1, 0x111118, 0.92);
        gfx.lineBetween(sx, sy, ex, ey);
        gfx.lineBetween(
          (sx+ex)/2, (sy+ey)/2,
          (sx+ex)/2 + (rng()-0.5)*10, (sy+ey)/2 + rng()*8,
        );
      }

      // Moss patch on top corner
      if (rng() > 0.28) {
        gfx.fillStyle(0x1a5228, 0.68);
        gfx.fillEllipse(bx + bw * 0.22, bby + bh * 0.14, bw * 0.40, bh * 0.20);
        gfx.fillStyle(0x2d7a40, 0.32);
        gfx.fillEllipse(bx + bw * 0.17, bby + bh * 0.10, bw * 0.22, bh * 0.12);
      }

      // Block outer border
      gfx.lineStyle(2, 0x141420, 0.90);
      gfx.strokeRect(bx, bby, bw, bh);
      // Inner top-left highlight lines (simulates lit edge)
      gfx.lineStyle(1, 0x646480, 0.32);
      gfx.lineBetween(bx + 2, bby + 2, bx + bw - 3, bby + 2);
      gfx.lineBetween(bx + 2, bby + 2, bx + 2, bby + bh - 3);
    }
  }

  private drawSteelObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle, rng: () => number): void {
    const x = obs.x - obs.width  / 2;
    const y = obs.y - obs.height / 2;
    const w = obs.width;
    const h = obs.height;

    // Shadow
    gfx.fillStyle(0x000000, 0.48);
    gfx.fillRect(x + 4, y + 5, w, h);

    // Dark metallic base
    gfx.fillStyle(0x131e2e, 1);
    gfx.fillRect(x, y, w, h);

    // Inner panel
    gfx.fillStyle(0x1e2e48, 1);
    gfx.fillRect(x + 4, y + 4, w - 8, h - 8);

    // Vertical panel dividers
    const panelW = Math.max(18, w / 3);
    gfx.lineStyle(1, 0x14202e, 0.75);
    for (let px = x + panelW; px < x + w - 4; px += panelW) {
      gfx.lineBetween(px, y + 4, px, y + h - 4);
    }

    // Horizontal seam line
    if (h > 40) {
      gfx.lineStyle(1, 0x14202e, 0.60);
      gfx.lineBetween(x + 4, obs.y, x + w - 4, obs.y);
    }

    // Rivet bolts at corners
    const bolts: [number, number][] = [
      [x + 7, y + 7], [x + w - 7, y + 7],
      [x + 7, y + h - 7], [x + w - 7, y + h - 7],
    ];
    for (const [bx, by] of bolts) {
      gfx.fillStyle(0x0d1828, 1);
      gfx.fillCircle(bx, by, 3.2);
      gfx.fillStyle(0x4a6080, 0.65);
      gfx.fillCircle(bx - 0.7, by - 0.7, 1.4);
    }

    // Metallic top highlight
    gfx.fillStyle(0x5f7fa8, 0.20);
    gfx.fillRect(x + 2, y + 2, w - 4, 4);

    // Warning stripes on bottom edge
    if (h > 28) {
      const stripeH   = 6;
      const stripeY   = y + h - stripeH - 3;
      const stripeW   = 10;
      const stripeNum = Math.floor((w - 8) / stripeW);
      for (let i = 0; i < stripeNum; i++) {
        if (i % 2 === 0) {
          gfx.fillStyle(0xf0b800, 0.18);
          gfx.fillRect(x + 4 + i * stripeW, stripeY, stripeW, stripeH);
        }
      }
    }

    // Outer glow border
    gfx.lineStyle(2, 0x3366ff, 0.28);
    gfx.strokeRect(x, y, w, h);
    gfx.lineStyle(1, 0x253860, 0.55);
    gfx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  }

  private drawMirrorObstacle(gfx: Phaser.GameObjects.Graphics, obs: Obstacle, rng: () => number): void {
    const x = obs.x - obs.width  / 2;
    const y = obs.y - obs.height / 2;
    const w = obs.width;
    const h = obs.height;
    const horizontal = w >= h;
    const frame = Math.max(3, Math.min(7, Math.min(w, h) * 0.22));
    const glassX = x + frame;
    const glassY = y + frame;
    const glassW = Math.max(1, w - frame * 2);
    const glassH = Math.max(1, h - frame * 2);
    const longSide = horizontal ? w : h;
    const segmentCount = Math.max(2, Math.floor(longSide / 34));

    // Drop shadow
    gfx.fillStyle(0x000000, 0.42);
    gfx.fillRect(x + 5, y + 6, w + 8, h + 8);

    // Dark reinforced housing
    gfx.fillStyle(0x001823, 1);
    gfx.fillRect(x - 5, y - 5, w + 10, h + 10);
    gfx.fillStyle(0x00384e, 1);
    gfx.fillRect(x - 2, y - 2, w + 4, h + 4);

    // Inner frame and continuous reflective glass
    gfx.fillStyle(0x001f2b, 1);
    gfx.fillRect(x, y, w, h);
    gfx.fillStyle(0x008fa8, 0.58);
    gfx.fillRect(glassX, glassY, glassW, glassH);
    gfx.fillStyle(0x18e6ff, 0.32);
    gfx.fillRect(glassX + 2, glassY + 2, Math.max(1, glassW - 4), Math.max(1, glassH * 0.42));
    gfx.fillStyle(0x004f68, 0.35);
    gfx.fillRect(glassX + 2, glassY + glassH * 0.58, Math.max(1, glassW - 4), Math.max(1, glassH * 0.34));

    // Repeated reflective cells make long mirrors read as one full-width surface.
    gfx.lineStyle(2, 0x00f7ff, 0.55);
    for (let i = 1; i < segmentCount; i++) {
      const t = i / segmentCount;
      if (horizontal) {
        const sx = x + w * t + (rng() - 0.5) * 2;
        gfx.lineBetween(sx, y + frame * 0.7, sx, y + h - frame * 0.7);
      } else {
        const sy = y + h * t + (rng() - 0.5) * 2;
        gfx.lineBetween(x + frame * 0.7, sy, x + w - frame * 0.7, sy);
      }
    }

    gfx.lineStyle(2.5, 0xffffff, 0.62);
    if (horizontal) {
      gfx.lineBetween(glassX + glassW * 0.12, glassY + glassH * 0.34, glassX + glassW * 0.36, glassY + glassH * 0.34);
      gfx.lineBetween(glassX + glassW * 0.50, glassY + glassH * 0.50, glassX + glassW * 0.76, glassY + glassH * 0.50);
      gfx.lineStyle(1.5, 0x9dffff, 0.48);
      gfx.lineBetween(glassX + glassW * 0.18, glassY + glassH * 0.68, glassX + glassW * 0.90, glassY + glassH * 0.68);
    } else {
      gfx.lineBetween(glassX + glassW * 0.36, glassY + glassH * 0.12, glassX + glassW * 0.36, glassY + glassH * 0.36);
      gfx.lineBetween(glassX + glassW * 0.50, glassY + glassH * 0.50, glassX + glassW * 0.50, glassY + glassH * 0.76);
      gfx.lineStyle(1.5, 0x9dffff, 0.48);
      gfx.lineBetween(glassX + glassW * 0.68, glassY + glassH * 0.18, glassX + glassW * 0.68, glassY + glassH * 0.90);
    }

    // Bright rails and end caps.
    gfx.lineStyle(3, 0x00eaff, 0.88);
    gfx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    gfx.lineStyle(1.5, 0xb9ffff, 0.72);
    gfx.strokeRect(glassX, glassY, glassW, glassH);

    gfx.fillStyle(0x00eaff, 0.90);
    if (horizontal) {
      gfx.fillRect(x - 3, y - 3, 7, h + 6);
      gfx.fillRect(x + w - 4, y - 3, 7, h + 6);
    } else {
      gfx.fillRect(x - 3, y - 3, w + 6, 7);
      gfx.fillRect(x - 3, y + h - 4, w + 6, 7);
    }
  }

  private drawObstacleGlows(): void {
    if (!this.gameState) return;
    this.gameState.map.obstacles.forEach(obs => {
      const ox = obs.x - obs.width  / 2;
      const oy = obs.y - obs.height / 2;
      switch (obs.type) {
        case 'bush':
          this.glowGfx.fillStyle(0x22aa22, 0.04);
          this.glowGfx.fillRect(ox - 2, oy - 2, obs.width + 4, obs.height + 4);
          this.glowGfx.lineStyle(4, 0x44cc44, 0.08);
          this.glowGfx.strokeRect(ox - 2, oy - 2, obs.width + 4, obs.height + 4);
          break;
        case 'mirror':
          // Wide electric bloom – multiple layered strokes
          this.glowGfx.lineStyle(22, 0x00bbdd, 0.07);
          this.glowGfx.strokeRect(ox - 9, oy - 9, obs.width + 18, obs.height + 18);
          this.glowGfx.lineStyle(14, 0x00ccee, 0.13);
          this.glowGfx.strokeRect(ox - 5, oy - 5, obs.width + 10, obs.height + 10);
          this.glowGfx.lineStyle(7,  0x00ddff, 0.26);
          this.glowGfx.strokeRect(ox - 2, oy - 2, obs.width + 4, obs.height + 4);
          this.glowGfx.lineStyle(3,  0x00ffff, 0.45);
          this.glowGfx.strokeRect(ox, oy, obs.width, obs.height);
          this.glowGfx.fillStyle(0x00ddff, 0.07);
          this.glowGfx.fillRect(ox, oy, obs.width, obs.height);
          break;
        case 'steel':
          this.glowGfx.lineStyle(5, 0x2255cc, 0.14);
          this.glowGfx.strokeRect(ox - 1, oy - 1, obs.width + 2, obs.height + 2);
          break;
        case 'wood':
          this.glowGfx.lineStyle(2, 0x884422, 0.06);
          this.glowGfx.strokeRect(ox, oy, obs.width, obs.height);
          break;
        case 'rock':
          this.glowGfx.lineStyle(2, 0x505060, 0.06);
          this.glowGfx.strokeRect(ox, oy, obs.width, obs.height);
          break;
      }
    });
  }

  // ── State change detection → effects ──────────────────────────────────────
  private checkStateChanges(): void {
    if (!this.gameState) return;
    const s = this.gameState;

    const curPlayers  = new Set(s.players.map(p => p.id));
    const curBullets  = new Set(s.bullets.map(b => b.id));
    const curObs      = new Set(s.map.obstacles.map(o => o.id));

    this.prevPlayerIds.forEach(id => {
      if (!curPlayers.has(id)) {
        const pos = this.playerLastPos.get(id);
        if (pos) this.spawnExplosion(pos.x, pos.y, true);
        this.playerMaxHp.delete(id);
        this.playerLastHp.delete(id);
        this.playerLastPos.delete(id);
        const txt = this.playerNameTexts.get(id);
        if (txt) { txt.destroy(); this.playerNameTexts.delete(id); }
        const tank = this.playerTankSprites.get(id);
        if (tank) {
          tank.body.destroy();
          tank.turret.destroy();
          this.playerTankSprites.delete(id);
        }
      }
    });

    this.prevBulletIds.forEach(id => {
      if (!curBullets.has(id)) {
        const pos = this.bulletLastPos.get(id);
        if (pos) this.spawnSpark(pos.x, pos.y);
        this.bulletLastPos.delete(id);
      }
    });

    this.prevObsIds.forEach(id => {
      if (!curObs.has(id)) {
        const gfx = this.obsGfx.get(id);
        if (gfx) { gfx.destroy(); this.obsGfx.delete(id); }
      }
    });

    s.map.obstacles.forEach(obs => {
      if (!this.obsGfx.has(obs.id)) {
        this.obsGfx.set(obs.id, this.createObstacleGfx(obs));
      }
    });

    s.players.forEach(p => {
      if (!this.playerMaxHp.has(p.id)) this.playerMaxHp.set(p.id, p.hp);
      const prev = this.playerLastHp.get(p.id);
      if (prev !== undefined && p.hp < prev && p.id === this.myPlayerId) {
        this.cameras.main.shake(220, 0.009);
      }
      this.playerLastHp.set(p.id, p.hp);
      this.playerLastPos.set(p.id, { x: p.x, y: p.y });

      if (!this.playerNameTexts.has(p.id)) {
        const txt = this.add.text(p.x, p.y, p.id.slice(0, 8), {
          fontSize: '11px', fontFamily: MONO,
          color: colorToCss(p.color),
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setDepth(10);
        this.playerNameTexts.set(p.id, txt);
      }
    });

    s.bullets.forEach(b => this.bulletLastPos.set(b.id, { x: b.x, y: b.y }));

    this.prevPlayerIds  = curPlayers;
    this.prevBulletIds  = curBullets;
    this.prevObsIds     = curObs;
  }

  // ── Player rendering ──────────────────────────────────────────────────────
  private drawPlayers(time: number): void {
    if (!this.gameState) return;
    this.gameState.players.forEach(p => {
      const isLocal = p.id === this.myPlayerId;
      this.drawTank(p, isLocal, time);
      this.drawHpBar(p);

      const txt = this.playerNameTexts.get(p.id);
      if (txt) {
        const nameLabel = p.id.slice(0, 8);
        const label = isLocal ? nameLabel : `${nameLabel}\n${p.hp}hp`;
        txt.setText(label);
        txt.setPosition(p.x, p.y - p.radius * PLAYER_LABEL_OFFSET);
        txt.setVisible(p.alive);
      }
    });
  }

  private drawTank(p: PlayerPublicState, isLocal: boolean, time: number): void {
    const { x, y, radius: r, bodyAngle, aimAngle: a, color } = p;
    const textureKeys = ensureTankSvgTextures(this, color);
    if (!textureKeys) return;

    let sprites = this.playerTankSprites.get(p.id);
    if (!sprites) {
      sprites = {
        body: this.add.image(x, y, textureKeys.body)
          .setOrigin(0.5)
          .setDepth(5),
        turret: this.add.image(x, y, textureKeys.turret)
          .setOrigin(TANK_TURRET_ORIGIN_X, TANK_TURRET_ORIGIN_Y)
          .setDepth(7),
      };
      this.playerTankSprites.set(p.id, sprites);
    }

    const bodyScale = (r * 2.7) / sprites.body.width;
    const turretScale = (r * TANK_TURRET_SCALE) / sprites.turret.width;

    if (!p.alive) {
      this.mainGfx.fillStyle(0x000000, 0.42);
      this.mainGfx.fillEllipse(x + 4, y + 6, r * 2.35, r * 1.9);

      sprites.body
        .setVisible(true)
        .setTexture(textureKeys.destroyedBody)
        .setPosition(x, y)
        .setScale(bodyScale)
        .setRotation(bodyAngle + TANK_BODY_ROTATION_OFFSET)
        .setAlpha(0.78)
        .setTint(0x777777);
      sprites.turret
        .setVisible(true)
        .setTexture(textureKeys.destroyedTurret)
        .setPosition(x, y)
        .setScale(turretScale)
        .setRotation(a + TANK_TURRET_ROTATION_OFFSET)
        .setAlpha(0.72)
        .setTint(0x777777);

      return;
    }

    const pulse     = isLocal ? (0.85 + 0.15 * Math.sin(time * 0.004)) : 1;

    this.glowGfx.fillStyle(color, 0.055 * pulse);
    this.glowGfx.fillCircle(x, y, r * 1.75);
    this.glowGfx.fillStyle(color, 0.035 * pulse);
    this.glowGfx.fillCircle(x, y, r * 1.05);

    if (p.dashing) {
      this.glowGfx.fillStyle(color, 0.13);
      this.glowGfx.fillCircle(x, y, r * 2.05);
      this.glowGfx.lineStyle(4, color, 0.55);
      this.glowGfx.strokeCircle(x, y, r * 1.45);
      this.glowGfx.lineStyle(2, color, 0.35);
      this.glowGfx.strokeCircle(x, y, r * 1.9);
    }

    // Shadow
    this.mainGfx.fillStyle(0x000000, 0.30);
    this.mainGfx.fillEllipse(x + 4, y + 5, r * 2.2, r * 1.8);

    sprites.body
      .setVisible(true)
      .setTexture(textureKeys.body)
      .setPosition(x, y)
      .setScale(bodyScale)
      .setAlpha(1)
      .clearTint();
    sprites.body.setRotation(
      Phaser.Math.Angle.RotateTo(
        sprites.body.rotation,
        bodyAngle + TANK_BODY_ROTATION_OFFSET,
        BODY_TURN_STEP,
      ),
    );
    sprites.turret
      .setVisible(true)
      .setTexture(textureKeys.turret)
      .setPosition(x, y)
      .setScale(turretScale)
      .setRotation(a + TANK_TURRET_ROTATION_OFFSET)
      .setAlpha(1)
      .clearTint();

  }

  private drawHpBar(p: PlayerPublicState): void {
    if (!p.alive) return;
    const maxHp = this.playerMaxHp.get(p.id) ?? p.hp;
    const frac  = Math.max(0, p.hp / (maxHp || 1));
    const r     = p.radius;
    const bW    = r * 2.6;
    const bH    = 5;
    const bx    = p.x - bW / 2;
    const by    = p.y - r * 1.5;

    this.playerUiGfx.fillStyle(0x0a0a0a, 0.85);
    this.playerUiGfx.fillRect(bx - 1, by - 1, bW + 2, bH + 2);

    const col = frac > 0.5 ? C.HP_HIGH : frac > 0.25 ? C.HP_MED : C.HP_LOW;
    this.playerUiGfx.fillStyle(col, 1);
    this.playerUiGfx.fillRect(bx, by, bW * frac, bH);

    if (frac <= 0.25) {
      this.glowGfx.fillStyle(C.HP_LOW, 0.22);
      this.glowGfx.fillRect(bx - 2, by - 2, bW + 4, bH + 4);
    }
  }

  // ── Bullet rendering ──────────────────────────────────────────────────────
  private drawBullets(time: number): void {
    if (!this.gameState) return;
    const flicker = 0.85 + 0.15 * Math.sin(time * 0.012);
    this.gameState.bullets.forEach(b => {
      const r = b.radius;
      this.glowGfx.fillStyle(C.BULLET_GLOW, 0.18 * flicker);
      this.glowGfx.fillCircle(b.x, b.y, r * 4);
      this.glowGfx.fillStyle(C.BULLET, 0.40 * flicker);
      this.glowGfx.fillCircle(b.x, b.y, r * 2.2);
      this.mainGfx.fillStyle(C.BULLET, 1);
      this.mainGfx.fillCircle(b.x, b.y, r);
      this.mainGfx.fillStyle(0xffffff, 0.92);
      this.mainGfx.fillCircle(b.x, b.y, r * 0.42);
    });
  }

  // ── Camera follow ─────────────────────────────────────────────────────────
  private followLocalPlayer(): void {
    if (!this.gameState) return;
    const me = this.gameState.players.find(p => p.id === this.myPlayerId);
    if (me) {
      this.camTarget.setPosition(me.x, me.y);
    }
  }

  // ── Input sending ─────────────────────────────────────────────────────────
  private sendInput(time: number): void {
    if (!this.myPlayerId || !this.gameState) return;
    if (time - this.lastInputSend < this.INPUT_HZ) return;
    this.lastInputSend = time;

    if (this.gameState.status !== 'playing') return;

    let moveX = 0, moveY = 0;
    if (this.keys.W.isDown) moveY -= 1;
    if (this.keys.S.isDown) moveY += 1;
    if (this.keys.A.isDown) moveX -= 1;
    if (this.keys.D.isDown) moveX += 1;

    const me = this.gameState.players.find(p => p.id === this.myPlayerId);
    let aimAngle = 0;
    if (me) {
      const ptr = this.input.activePointer;
      aimAngle = Phaser.Math.Angle.Between(me.x, me.y, ptr.worldX, ptr.worldY);
    }

    const input: PlayerInput = {
      moveX, moveY, aimAngle,
      shoot: this.input.activePointer.isDown,
      dash: this.pendingDash,
    };
    this.pendingDash = false;
    this.socket.emit('playerInput', input);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  private createHUD(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    this.hudPanelGfx = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudHpBarGfx = this.add.graphics().setScrollFactor(0).setDepth(101);

    this.hudTitleText = this.add.text(W / 2, 14, 'TANK ARENA', {
      fontSize: '14px', fontFamily: MONO, color: '#f2cf8f',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101).setAlpha(0.55);

    this.hudHpText = this.add.text(20, 18, 'HP ---', {
      fontSize: '13px', fontFamily: MONO, color: '#00ff88',
    }).setScrollFactor(0).setDepth(101);

    this.hudDashText = this.add.text(20, 58, 'DASH ---', {
      fontSize: '11px', fontFamily: MONO, color: '#00ddff',
    }).setScrollFactor(0).setDepth(101);

    this.hudAmmoText = this.add.text(20, 74, 'AMMO ---', {
      fontSize: '11px', fontFamily: MONO, color: '#f2cf8f',
    }).setScrollFactor(0).setDepth(101);

    this.hudPlayerCountText = this.add.text(W - 16, 18, 'PLAYERS: -', {
      fontSize: '12px', fontFamily: MONO, color: '#8c714a',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(101);

    this.hudStatusText = this.add.text(W / 2, H - 20, '', {
      fontSize: '12px', fontFamily: MONO, color: '#ffee00',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(101).setAlpha(0.8);

    this.overlayGfx = this.add.graphics().setScrollFactor(0).setDepth(108);

    this.centerBig = this.add.text(W / 2, H / 2 - 28, '', {
      fontSize: '48px', fontFamily: MONO, color: '#f2cf8f',
      stroke: '#4a2c17', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(109).setAlpha(0);

    this.centerSub = this.add.text(W / 2, H / 2 + 36, '', {
      fontSize: '20px', fontFamily: MONO, color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(109).setAlpha(0);

    this.centerHint = this.add.text(W / 2, H / 2 + 70, '', {
      fontSize: '13px', fontFamily: MONO, color: '#8c714a',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(109).setAlpha(0);
  }

  private showConnectingOverlay(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.overlayGfx.clear();
    this.overlayGfx.fillStyle(0x000000, 0.7);
    this.overlayGfx.fillRect(0, 0, W, H);
    this.centerBig.setText('CONNECTING...').setColor('#b89562').setAlpha(1);
    this.centerSub.setAlpha(0);
    this.centerHint.setAlpha(0);
  }

  private updateHUD(time: number): void {
    const state = this.gameState!;
    const W = this.scale.width;
    const H = this.scale.height;

    this.hudPanelGfx.clear();
    this.hudPanelGfx.fillStyle(C.PANEL, 0.84);
    this.hudPanelGfx.fillRect(10, 10, 190, 96);
    this.hudPanelGfx.lineStyle(1, C.TEXT_WARM, 0.20);
    this.hudPanelGfx.strokeRect(10, 10, 190, 96);
    this.hudPanelGfx.fillStyle(C.PANEL, 0.84);
    this.hudPanelGfx.fillRect(W - 170, 10, 158, 40);
    this.hudPanelGfx.lineStyle(1, C.TEXT_MUTED, 0.34);
    this.hudPanelGfx.strokeRect(W - 170, 10, 158, 40);

    this.hudHpBarGfx.clear();
    const me = state.players.find(p => p.id === this.myPlayerId);
    if (me) {
      const maxHp = this.playerMaxHp.get(me.id) ?? me.hp;
      const frac  = Math.max(0, me.hp / (maxHp || 1));
      const bx = 20, by = 43, bW2 = 162, bH = 10;

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
    } else if (this.myPlayerId) {
      this.hudHpText.setText('HP  DEAD').setColor('#ff2244');
      this.hudDashText.setText('DASH ---').setColor('#334455');
      this.hudAmmoText.setText('AMMO ---').setColor('#8c714a');
    } else {
      this.hudHpText.setText('CONNECTING...').setColor('#334455');
      this.hudDashText.setText('DASH ---').setColor('#334455');
      this.hudAmmoText.setText('AMMO ---').setColor('#8c714a');
    }

    this.hudPlayerCountText.setText(`PLAYERS: ${state.players.length}`);

    if (state.status === 'waiting') {
      this.overlayGfx.clear();
      this.overlayGfx.fillStyle(0x000000, 0.55);
      this.overlayGfx.fillRect(0, 0, W, H);

      const blink = Math.sin(time * 0.0038) > 0;
      this.centerBig.setAlpha(1).setColor('#f2cf8f').setText('TANK ARENA');
      this.centerSub.setAlpha(1).setText(
        this.myPlayerId ? 'PRESS [ENTER] TO START' : 'WAITING FOR SERVER...',
      ).setColor(blink ? '#ffffff' : '#8c714a');
      this.centerHint.setAlpha(0.7).setText('W A S D  ·  MOUSE AIM  ·  CLICK SHOOT');
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

      const survivors  = state.players;
      const isWinner   = survivors.some(p => p.id === this.myPlayerId);
      const label      = isWinner ? 'VICTORY!' : 'GAME OVER';
      const labelColor = isWinner ? '#00ff88' : '#ff4444';

      this.centerBig.setAlpha(1).setColor(labelColor).setText(label);
      if (survivors.length === 1) {
        const wId = survivors[0].id;
        const tag = wId === this.myPlayerId ? 'YOU WIN' : `WINNER: ${wId.slice(0, 8)}`;
        this.centerSub.setAlpha(1).setText(tag);
      } else {
        this.centerSub.setAlpha(0);
      }
      this.centerHint.setAlpha(0.6).setText('PRESS [ENTER] TO PLAY AGAIN');
      this.hudStatusText.setText('');
    }
  }

  // ── Particle effects ──────────────────────────────────────────────────────
  private spawnExplosion(x: number, y: number, large: boolean): void {
    const count  = large ? 28 : 12;
    const speed  = large ? { min: 60, max: 340 } : { min: 30, max: 150 };
    const life   = large ? 750 : 380;
    const scale  = large ? { start: 2.2, end: 0 } : { start: 0.9, end: 0 };
    const tints  = large
      ? [0xff6600, 0xffcc00, 0xff2200, 0xffffff]
      : [0xffcc00, 0xffee88, 0xffffff];

    const em = this.add.particles(x, y, 'particle', {
      speed, scale,
      alpha:    { start: 1, end: 0 },
      lifespan: life,
      blendMode: 'ADD',
      tint: tints,
      emitting: false,
    });
    em.explode(count);
    this.time.delayedCall(life + 200, () => { if (em?.scene) em.destroy(); });
  }

  private spawnSpark(x: number, y: number): void {
    const em = this.add.particles(x, y, 'particle', {
      speed:   { min: 25, max: 110 },
      scale:   { start: 0.7, end: 0 },
      alpha:   { start: 0.9, end: 0 },
      lifespan: 260,
      blendMode: 'ADD',
      tint: [0xffee00, 0xffffff, 0xffaa00],
      emitting: false,
    });
    em.explode(8);
    this.time.delayedCall(400, () => { if (em?.scene) em.destroy(); });
  }
}
