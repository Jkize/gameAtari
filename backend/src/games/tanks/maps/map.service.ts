import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GameMap, Obstacle, ObstacleAssetId, ObstacleType } from '../types/map.types';
import { PowerUpSpawn, PowerUpType } from '../types/power-up.types';
import {
  BUSH_OBSTACLE_ASSET_IDS,
  DECORATION_OBSTACLE_ASSET_IDS,
  DEFAULT_OBSTACLE_SIZE,
  OBSTACLE_DEFINITIONS,
} from '../obstacle.config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FORTRESS_CENTER_DATA = require('./data/fortress_center_br.json') as RawMapJson;
const JUNGLE_SURVIVAL_DATA = require('./data/jungle_survival_br.json') as RawMapJson;
const URBAN_ASSAULT_DATA = require('./data/urban_grid_br.json') as RawMapJson;
const JUNGLE_SURVIVAL_DATAV2 = require('./data/jungle-survival-br-v2.json') as RawMapJson;


const POWER_UP_RADIUS = 18;

const POWER_UP_ASSET_ID: Record<PowerUpType, string> = {
  triple_shot: 'power_triple_shot',
  shotgun: 'power_shotgun',
  grenade: 'power_grenade',
  laser: 'power_laser',
};

interface RawObstacle {
  type: ObstacleType;
  assetId?: ObstacleAssetId;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawPowerUp {
  type: PowerUpType;
  x: number;
  y: number;
}

interface RawMapJson {
  name: string;
  width: number;
  height: number;
  spawnPoints: { x: number; y: number }[];
  obstacles: RawObstacle[];
  powerUps: RawPowerUp[];
}

@Injectable()
export class MapService {
  createMap(): GameMap {
    //return this.loadFromJson(JUNGLE_SURVIVAL_DATA); 
    return this.loadFromJson(JUNGLE_SURVIVAL_DATAV2);
    //return this.createLegacyMap(); 
  }

  private loadFromJson(data: RawMapJson): GameMap {
    const obstacles = data.obstacles.map((raw): Obstacle => {
      const definition = OBSTACLE_DEFINITIONS[raw.type];
      return {
        id: uuidv4(),
        type: raw.type,
        assetId: raw.assetId ?? definition.assetId,
        x: raw.x,
        y: raw.y,
        width: raw.width,
        height: raw.height,
        hp: definition.hp,
        maxHp: definition.hp,
        healthRatio: 1,
        destructible: definition.destructible,
      };
    });

    const powerUps = data.powerUps.map(raw => this.power(raw.type, raw.x, raw.y));

    return {
      name: data.name,
      width: data.width,
      height: data.height,
      spawnPoints: data.spawnPoints,
      obstacles,
      powerUps,
    };
  }

  // Legacy hardcoded 1600×1200 map — kept for testing
  createLegacyMap(): GameMap {
    return {
      width: 1600,
      height: 1200,
      obstacles: this.buildLegacyObstacles(),
      powerUps: this.buildLegacyPowerUps(),
    };
  }

  private obs(
    type: ObstacleType,
    x: number,
    y: number,
    w = DEFAULT_OBSTACLE_SIZE,
    h = DEFAULT_OBSTACLE_SIZE,
    assetId?: Obstacle['assetId'],
  ): Obstacle {
    const definition = OBSTACLE_DEFINITIONS[type];

    return {
      id: uuidv4(),
      type,
      assetId: assetId ?? definition.assetId,
      x,
      y,
      width: w,
      height: h,
      hp: definition.hp,
      maxHp: definition.hp,
      healthRatio: 1,
      destructible: definition.destructible,
    };
  }

  private buildLegacyObstacles(): Obstacle[] {
    const MAP_WIDTH = 1600;
    const MAP_HEIGHT = 1200;
    const obstacles: Obstacle[] = [];
    const usedPositions = new Set<string>();
    const bushCoverSize = 70;
    const bushGap = -5;
    const bushPatchGap = bushCoverSize + bushGap;

    const add = (
      type: ObstacleType,
      x: number,
      y: number,
      w = DEFAULT_OBSTACLE_SIZE,
      h = DEFAULT_OBSTACLE_SIZE,
      assetId?: Obstacle['assetId'],
    ) => {
      const key = `${type}-${x}-${y}-${w}-${h}-${assetId ?? ''}`;

      if (usedPositions.has(key)) {
        return;
      }

      usedPositions.add(key);
      obstacles.push(this.obs(type, x, y, w, h, assetId));
    };

    const addSymmetric = (
      type: ObstacleType,
      x: number,
      y: number,
      w = DEFAULT_OBSTACLE_SIZE,
      h = DEFAULT_OBSTACLE_SIZE,
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
      w = DEFAULT_OBSTACLE_SIZE,
      h = DEFAULT_OBSTACLE_SIZE,
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
      w = DEFAULT_OBSTACLE_SIZE,
      h = DEFAULT_OBSTACLE_SIZE,
    ) => {
      for (let i = 0; i < count; i++) {
        add(type, x, startY + i * gap, w, h);
      }
    };

    const addBushPair = (x: number, y: number, horizontal = true) => {
      if (horizontal) {
        add('bush', x - bushPatchGap / 2, y, bushCoverSize, bushCoverSize);
        add('bush', x + bushPatchGap / 2, y, bushCoverSize, bushCoverSize);
      } else {
        add('bush', x, y - bushPatchGap / 2, bushCoverSize, bushCoverSize);
        add('bush', x, y + bushPatchGap / 2, bushCoverSize, bushCoverSize);
      }
    };

    const addBushQuad = (x: number, y: number) => {
      add('bush', x - bushPatchGap / 2, y - bushPatchGap / 2, bushCoverSize, bushCoverSize);
      add('bush', x + bushPatchGap / 2, y - bushPatchGap / 2, bushCoverSize, bushCoverSize);
      add('bush', x - bushPatchGap / 2, y + bushPatchGap / 2, bushCoverSize, bushCoverSize);
      add('bush', x + bushPatchGap / 2, y + bushPatchGap / 2, bushCoverSize, bushCoverSize);
    };

    const addAssetPreview = () => {
      const columns = 9;
      const gap = bushPatchGap;
      const startX = MAP_WIDTH / 2 - ((columns - 1) * gap) / 2;
      const startY = MAP_HEIGHT - 154;
      const previewAssets = [
        ...BUSH_OBSTACLE_ASSET_IDS.map(assetId => ({ type: 'bush' as const, assetId })),
        ...DECORATION_OBSTACLE_ASSET_IDS.map(assetId => ({ type: 'decoration' as const, assetId })),
      ];

      previewAssets.forEach(({ type, assetId }, index) => {
        const x = startX + (index % columns) * gap;
        const y = startY + Math.floor(index / columns) * gap;
        add(type, x, y, bushCoverSize, bushCoverSize, assetId);
      });
    };

    // Unused helpers referenced above — suppress TS error
    void addSymmetric;
    void addVerticalLine;

    addBushPair(330, 230, true);
    addBushPair(MAP_WIDTH - 330, 230, true);
    addBushPair(330, MAP_HEIGHT - 230, true);
    addBushPair(MAP_WIDTH - 330, MAP_HEIGHT - 230, true);

    addBushQuad(660, 290);
    addBushQuad(940, 910);

    addBushPair(800, 600, true);

    addAssetPreview();

    addHorizontalLine('rock', 360, 430, 3, DEFAULT_OBSTACLE_SIZE);
    addHorizontalLine('rock', MAP_WIDTH - 544, 770, 3, DEFAULT_OBSTACLE_SIZE);

    addHorizontalLine('wood', 260, 610, 3, 88);
    addHorizontalLine('wood', MAP_WIDTH - 436, 610, 3, 88);

    add('steel', 470, 600);
    add('steel', MAP_WIDTH - 470, 600);
    add('steel', 700, 500);
    add('steel', 900, 700);

    add('mirror', 260, 350, 140, 18);
    add('mirror', MAP_WIDTH - 260, MAP_HEIGHT - 350, 140, 18);
    add('mirror', 620, 900, 18, 130);
    add('mirror', MAP_WIDTH - 620, 300, 18, 130);
 //s ss
    return obstacles;
  }

  private power(type: PowerUpType, x: number, y: number): PowerUpSpawn {
    return {
      id: uuidv4(),
      type,
      assetId: POWER_UP_ASSET_ID[type],
      x,
      y,
      radius: POWER_UP_RADIUS,
    };
  }

  private buildLegacyPowerUps(): PowerUpSpawn[] {
    return [
      this.power('triple_shot', 800, 520),
      this.power('shotgun', 730, 650),
      this.power('grenade', 870, 650),
      this.power('laser', 800, 720),
    ];
  }
}
