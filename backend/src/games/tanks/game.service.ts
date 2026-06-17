import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Player, PlayerInput } from './types/player.types';
import { Bullet } from './types/bullet.types';
import { GameMap } from './types/map.types';
import { GameStatus } from './types/game-state.types';

const PLAYER_SPEED   = 200;  // px/sec
const DASH_MULTIPLIER = 4;
const DASH_DURATION = 300; // ms
const DASH_COOLDOWN = 8000; // ms
const PLAYER_RADIUS  = 20;
const PLAYER_HP      = 100;
const SHOT_COOLDOWN  = 400;  // ms
const BULLET_SPEED   = 500;  // px/sec
const BULLET_DAMAGE  = 34;
const BULLET_RADIUS  = 6;
const BULLET_LIFETIME = 3000; // ms

export const PLAYER_COLORS = [
  0x00ff88, // neon green
  0xff3b30, // red
  0x3498db, // blue
  0xf1c40f, // yellow
  0x9b59b6, // purple
  0xe67e22, // orange
  0x1abc9c, // turquoise
  0xff66cc, // pink
  0xecf0f1, // off-white
  0x2ecc71, // light green
  0x00d9ff, // cyan
  0xff0066, // magenta
  0xc0392b, // dark red
  0x95a5a6, // grey
  0x8e44ad, // dark violet
];

const SPAWN_POINTS = [
  { x: 150,  y: 150  },
  { x: 1450, y: 150  },
  { x: 150,  y: 1050 },
  { x: 1450, y: 1050 },
  { x: 800,  y: 120  },
  { x: 800,  y: 1080 },
  { x: 120,  y: 600  },
  { x: 1480, y: 600  },
  { x: 400,  y: 300  },
  { x: 1200, y: 300  },
  { x: 400,  y: 900  },
  { x: 1200, y: 900  },
  { x: 550,  y: 550  },
  { x: 1050, y: 550  },
  { x: 800,  y: 400  },
];

@Injectable()
export class GameService {
  players = new Map<string, Player>();
  bullets: Bullet[] = [];
  map: GameMap | null = null;
  status: GameStatus = 'waiting';
  private usedColorIndices = new Set<number>();

  addPlayer(socketId: string): Player {
    const existing = this.players.get(socketId);
    if (existing) return existing;

    const spawn = SPAWN_POINTS[this.players.size % SPAWN_POINTS.length];
    const colorIndex = this.pickColorIndex();

    const player: Player = {
      id: socketId,
      x: spawn.x,
      y: spawn.y,
      radius: PLAYER_RADIUS,
      speed: PLAYER_SPEED,
      hp: PLAYER_HP,
      maxHp: PLAYER_HP,
      aimAngle: 0,
      color: PLAYER_COLORS[colorIndex],
      input: { moveX: 0, moveY: 0, aimAngle: 0, shoot: false, dash: false },
      lastShotAt: 0,
      shotCooldown: SHOT_COOLDOWN,
      lastDashAt: -DASH_COOLDOWN,
      dashUntil: 0,
      dashCooldown: DASH_COOLDOWN,
      alive: true,
    };

    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId: string): void {
    const player = this.players.get(socketId);
    if (player) {
      const idx = PLAYER_COLORS.indexOf(player.color);
      if (idx !== -1) this.usedColorIndices.delete(idx);
    }
    this.players.delete(socketId);
  }

  private pickColorIndex(): number {
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      if (!this.usedColorIndices.has(i)) {
        this.usedColorIndices.add(i);
        return i;
      }
    }
    return 0;
  }

  applyInput(socketId: string, raw: Partial<PlayerInput>): void {
    const player = this.players.get(socketId);
    if (!player || !player.alive) return;

    player.input.moveX    = this.clamp(Number(raw.moveX)    || 0, -1, 1);
    player.input.moveY    = this.clamp(Number(raw.moveY)    || 0, -1, 1);
    player.input.aimAngle = isFinite(Number(raw.aimAngle))  ? Number(raw.aimAngle) : player.aimAngle;
    player.input.shoot    = raw.shoot === true;
    player.input.dash     = raw.dash === true;

    if (player.input.dash) {
      this.tryDash(player, Date.now());
      player.input.dash = false;
    }
  }

  movePlayer(player: Player, deltaTime: number, now = Date.now()): void {
    let { moveX, moveY, aimAngle } = player.input;

    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
    }

    const speed = now < player.dashUntil ? player.speed * DASH_MULTIPLIER : player.speed;
    player.x += moveX * speed * deltaTime;
    player.y += moveY * speed * deltaTime;
    player.aimAngle = aimAngle;
  }

  tryShoot(player: Player, now: number): void {
    if (!player.input.shoot) return;
    if (now - player.lastShotAt < player.shotCooldown) return;

    player.lastShotAt = now;
    const angle = player.input.aimAngle;
    const offset = player.radius + BULLET_RADIUS + 2;

    this.bullets.push({
      id: uuidv4(),
      ownerId: player.id,
      x: player.x + Math.cos(angle) * offset,
      y: player.y + Math.sin(angle) * offset,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: BULLET_SPEED,
      damage: BULLET_DAMAGE,
      radius: BULLET_RADIUS,
      lifeTime: BULLET_LIFETIME,
    });
  }

  damagePlayer(player: Player, amount: number): void {
    if (!player.alive) return;
    player.hp = Math.max(0, player.hp - amount);
    if (player.hp === 0) player.alive = false;
  }

  reset(): void {
    this.players.clear();
    this.bullets = [];
    this.map = null;
    this.status = 'waiting';
    this.usedColorIndices.clear();
  }

  private clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  private tryDash(player: Player, now: number): void {
    const { moveX, moveY } = player.input;
    const isMoving = moveX * moveX + moveY * moveY > 0;
    if (!isMoving) return;
    if (now - player.lastDashAt < player.dashCooldown) return;

    player.lastDashAt = now;
    player.dashUntil = now + DASH_DURATION;
  }
}
