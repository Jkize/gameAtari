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

const OBSTACLE_ASSET_ID: Record<ObstacleType, Obstacle['assetId']> = {
  bush: 'bush_01',
  wood: 'wood_barricade_01',
  rock: 'rock_block_01',
  steel: 'steel_block_01',
  mirror: 'mirror_panel_01',
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
      assetId: OBSTACLE_ASSET_ID[type],
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
      const mirroredX = MAP_WIDTH - x;
      const mirroredY = MAP_HEIGHT - y;

      add(type, x, y, w, h);
      add(type, mirroredX, y, w, h);
      add(type, x, mirroredY, w, h);
      add(type, mirroredX, mirroredY, w, h);
    };

    const addHorizontalLine = (
      type: ObstacleType,
      startX: number,
      y: number,
      count: number,
      gap = 80,
      w = TILE,
      h = TILE,
    ) => {
      for (let i = 0; i < count; i++) {
        add(type, startX + i * gap, y, w, h);
      }
    };

    const addVerticalLine = (
      type: ObstacleType,
      x: number,
      startY: number,
      count: number,
      gap = 80,
      w = TILE,
      h = TILE,
    ) => {
      for (let i = 0; i < count; i++) {
        add(type, x, startY + i * gap, w, h);
      }
    };

    const addBushPair = (x: number, y: number, horizontal = true) => {
      const gap = 72;
      if (horizontal) {
        add('bush', x - gap / 2, y);
        add('bush', x + gap / 2, y);
      } else {
        add('bush', x, y - gap / 2);
        add('bush', x, y + gap / 2);
      }
    };

    const addBushQuad = (x: number, y: number) => {
      const gap = 72;
      add('bush', x - gap / 2, y - gap / 2);
      add('bush', x + gap / 2, y - gap / 2);
      add('bush', x - gap / 2, y + gap / 2);
      add('bush', x + gap / 2, y + gap / 2);
    };

    /*
      Open spawn corners, clear horizontal/vertical lanes, and symmetric cover.
      Coordinates are obstacle centers, matching frontend and collision bounds.
    */

    // Soft cover near spawn exits. These are grouped but do not block movement.
    addBushPair(330, 230, true);
    addBushPair(MAP_WIDTH - 330, 230, true);
    addBushPair(330, MAP_HEIGHT - 230, true);
    addBushPair(MAP_WIDTH - 330, MAP_HEIGHT - 230, true);

    // Four-bush islands in open green zones, intentionally away from rocks.
    addBushQuad(660, 290);
    addBushQuad(940, 910);

    // A light central screen: cover to hide in, not a wall to get stuck on.
    addBushPair(800, 600, true);

    // Defensive rock triplets. They read like cover lines but leave wide lanes.
    addHorizontalLine('rock', 360, 430, 3, 92);
    addHorizontalLine('rock', MAP_WIDTH - 544, 770, 3, 92);

    // Wood barricade triplets on the side lanes.
    addHorizontalLine('wood', 260, 610, 3, 88);
    addHorizontalLine('wood', MAP_WIDTH - 436, 610, 3, 88);

    // A few hard anchors, isolated so tanks can rotate and pass around them.
    add('steel', 470, 600);
    add('steel', MAP_WIDTH - 470, 600);
    add('steel', 700, 500);
    add('steel', 900, 700);

    // Ricochet accents. Sparse placement keeps the arena readable.
    add('mirror', 260, 350, 140, 18);
    add('mirror', MAP_WIDTH - 260, MAP_HEIGHT - 350, 140, 18);
    add('mirror', 620, 900, 18, 130);
    add('mirror', MAP_WIDTH - 620, 300, 18, 130);

    return obstacles;
  }
}
