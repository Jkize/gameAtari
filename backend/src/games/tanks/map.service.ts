import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GameMap, Obstacle, ObstacleType } from './types/map.types';

const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1200;

const TILE = 64;

const OBSTACLE_HP: Record<ObstacleType, number> = {
  bush: 34,
  wood: 68,
  rock: 102,
  steel: 9999,
  mirror: 9999,
};

const OBSTACLE_DESTRUCTIBLE: Record<ObstacleType, boolean> = {
  bush: true,
  wood: true,
  rock: true,
  steel: false,
  mirror: false,
};

@Injectable()
export class MapService {
  createMap(): GameMap {
    return {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      obstacles: this.buildPredefinedObstacles(),
    };
  }

  private obs(
    type: ObstacleType,
    x: number,
    y: number,
    w = TILE,
    h = TILE,
  ): Obstacle {
    return {
      id: uuidv4(),
      type,
      x,
      y,
      width: w,
      height: h,
      hp: OBSTACLE_HP[type],
      destructible: OBSTACLE_DESTRUCTIBLE[type],
    };
  }

  private buildPredefinedObstacles(): Obstacle[] {
    const obstacles: Obstacle[] = [];
    const usedPositions = new Set<string>();

    const add = (
      type: ObstacleType,
      x: number,
      y: number,
      w = TILE,
      h = TILE,
    ) => {
      const key = `${type}-${x}-${y}-${w}-${h}`;

      if (usedPositions.has(key)) {
        return;
      }

      usedPositions.add(key);
      obstacles.push(this.obs(type, x, y, w, h));
    };

    const addSymmetric = (
      type: ObstacleType,
      x: number,
      y: number,
      w = TILE,
      h = TILE,
    ) => {
      const mirroredX = MAP_WIDTH - x - w;
      const mirroredY = MAP_HEIGHT - y - h;

      add(type, x, y, w, h);
      add(type, mirroredX, y, w, h);
      add(type, x, mirroredY, w, h);
      add(type, mirroredX, mirroredY, w, h);
    };

    /*
      Spawn areas are intentionally left mostly empty:
      top-left, top-right, bottom-left, bottom-right.
    */

    // Outer steel anchors
    addSymmetric('steel', 128, 128);
    addSymmetric('steel', 256, 128);
    addSymmetric('steel', 128, 256);

    // Side steel bunkers
    addSymmetric('steel', 448, 320, 128, 24);
    addSymmetric('steel', 448, 856, 128, 24);

    // Vertical steel walls near mid lanes
    addSymmetric('steel', 640, 256, 24, 128);
    addSymmetric('steel', 936, 256, 24, 128);

    // Central steel core
    add('steel', 704, 536, 64, 64);
    add('steel', 832, 536, 64, 64);
    add('steel', 704, 664, 64, 64);
    add('steel', 832, 664, 64, 64);

    // Central destructible rock ring
    add('rock', 768, 472);
    add('rock', 768, 728);
    add('rock', 640, 600);
    add('rock', 896, 600);

    // Diagonal rock clusters
    addSymmetric('rock', 384, 384);
    addSymmetric('rock', 448, 448);
    addSymmetric('rock', 512, 384);

    // Wood barricades near side lanes
    addSymmetric('wood', 288, 544);
    addSymmetric('wood', 352, 544);
    addSymmetric('wood', 416, 544);

    // Wood barricades near upper/lower middle
    addSymmetric('wood', 672, 192);
    addSymmetric('wood', 736, 192);
    addSymmetric('wood', 800, 192);

    // Bush cover near spawn approaches
    addSymmetric('bush', 320, 192);
    addSymmetric('bush', 384, 192);
    addSymmetric('bush', 320, 256);

    // Bush cover in open lanes
    addSymmetric('bush', 544, 480);
    addSymmetric('bush', 544, 544);
    addSymmetric('bush', 544, 608);

    // Bush cover near center but not blocking it completely
    addSymmetric('bush', 672, 416);
    addSymmetric('bush', 864, 416);

    // Mirror panels for ricochet mechanics
    addSymmetric('mirror', 768, 320, 16, 128);
    addSymmetric('mirror', 608, 592, 128, 16);

    // Extra mirror pair in side lanes
    addSymmetric('mirror', 320, 704, 128, 16);

    return obstacles;
  }
}