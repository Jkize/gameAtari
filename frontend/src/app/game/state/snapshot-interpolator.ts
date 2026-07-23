import { BulletPublicState, GameState, PlayerPublicState } from '@game/contracts/game-state.types';

export interface GameSnapshot {
  timestamp: number;
  state: GameState;
}

interface SnapshotInterpolatorOptions {
  enabled: boolean;
  renderDelayMs?: number;
  bufferMax?: number;
}

const DEFAULT_RENDER_DELAY_MS = 75;
const DEFAULT_BUFFER_MAX = 6;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SnapshotInterpolator {
  private readonly renderDelayMs: number;
  private readonly bufferMax: number;
  private snapshots: GameSnapshot[] = [];

  constructor(private readonly options: SnapshotInterpolatorOptions) {
    this.renderDelayMs = options.renderDelayMs ?? DEFAULT_RENDER_DELAY_MS;
    this.bufferMax = options.bufferMax ?? DEFAULT_BUFFER_MAX;
  }

  push(state: GameState, timestamp = Date.now()): void {
    this.snapshots.push({ timestamp, state });

    if (this.snapshots.length > this.bufferMax) {
      this.snapshots.shift();
    }
  }

  latest(): GameState | null {
    return this.snapshots[this.snapshots.length - 1]?.state ?? null;
  }

  buildRenderState(): GameState | null {
    const latest = this.latest();
    if (!latest) return null;

    if (!this.options.enabled || this.snapshots.length < 2) {
      return latest;
    }

    const renderTime = Date.now() - this.renderDelayMs;
    const prevIdx = this.findPreviousSnapshotIndex(renderTime);
    const nextIdx = Math.min(prevIdx + 1, this.snapshots.length - 1);

    if (prevIdx === nextIdx) {
      return latest;
    }

    return interpolateSnapshots(
      this.snapshots[prevIdx],
      this.snapshots[nextIdx],
      renderTime,
    );
  }

  clear(): void {
    this.snapshots = [];
  }

  private findPreviousSnapshotIndex(renderTime: number): number {
    let prevIdx = 0;

    for (let i = 1; i < this.snapshots.length; i++) {
      if (this.snapshots[i].timestamp <= renderTime) {
        prevIdx = i;
      } else {
        break;
      }
    }

    return prevIdx;
  }
}

export function interpolateSnapshots(
  prev: GameSnapshot,
  next: GameSnapshot,
  renderTime: number,
): GameState {
  const duration = next.timestamp - prev.timestamp;

  const alpha = duration <= 0
    ? 1
    : Math.max(0, Math.min(1, (renderTime - prev.timestamp) / duration));

  const prevPlayerMap = new Map<string, PlayerPublicState>(
    prev.state.players.map(p => [p.id, p]),
  );

  const prevBulletMap = new Map<string, BulletPublicState>(
    prev.state.bullets.map(b => [b.id, b]),
  );

  const players = next.state.players.map(p => {
    const pp = prevPlayerMap.get(p.id);
    if (!pp) return p; // New entity: snap to first known position.

    return {
      ...p,
      x: lerp(pp.x, p.x, alpha),
      y: lerp(pp.y, p.y, alpha),
    };
  });

  const bullets = next.state.bullets.map(b => {
    const pb = prevBulletMap.get(b.id);
    if (!pb) return b; // New bullet: snap to first known position.

    return {
      ...b,
      x: lerp(pb.x, b.x, alpha),
      y: lerp(pb.y, b.y, alpha),
    };
  });

  return {
    ...next.state,
    players,
    bullets,
  };
}
