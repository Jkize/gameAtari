import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { OBSTACLE_DEFINITIONS } from '../config/obstacle.config';
import { POWER_UP_ASSET_ID, POWER_UP_RADIUS } from '../config/power-up.config';
import { GameMap, Obstacle, ObstacleAssetId, ObstacleType } from '../types/map.types';
import { PowerUpSpawn, PowerUpType } from '../types/power-up.types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FORTRESS_CENTER_DATA = require('./data/fortress_center_br.json') as RawMapJson;
const JUNGLE_SURVIVAL_DATA = require('./data/p16-jungle-survival.json') as RawMapJson;
const CANYON_STANDOFF_DATA_P16 = require('./data/p16-canyon-standoff.json') as RawMapJson;
const FOREST_CLEARING_DATA_P16 = require('./data/p16-forest-clearing.json') as RawMapJson;
const FORTRESS_SIEGE_DATA_P16 = require('./data/p16-fortress-siege.json') as RawMapJson;
const MIRROR_MAZE_DATA_P16 = require('./data/p16-mirror-maze.json') as RawMapJson;
const URBAN_GRID_DATA_P16 = require('./data/p16-urban-grid.json') as RawMapJson;
const CANYON_STANDOFF_DATA_P4 = require('./data/p4-canyon-standoff.json') as RawMapJson;
const FOREST_CLEARING_DATA_P4 = require('./data/p4-forest-clearing.json') as RawMapJson;
const FORTRESS_SIEGE_DATA_P4 = require('./data/p4-fortress-siege.json') as RawMapJson;
const JUNGLE_SURVIVAL_DATA_P4 = require('./data/p4-jungle-survival.json') as RawMapJson;
const MIRROR_MAZE_DATA_P4 = require('./data/p4-mirror-maze.json') as RawMapJson;
const URBAN_ASSAULT_DATA_P4 = require('./data/p4-urban-grid-p4.json') as RawMapJson;
const CANYON_STANDOFF_DATA_P8 = require('./data/p8-canyon-standoff.json') as RawMapJson;
const FOREST_CLEARING_DATA_P8 = require('./data/p8-forest-clearing.json') as RawMapJson;
const FORTRESS_SIEGE_DATA_P8 = require('./data/p8-fortress-siege.json') as RawMapJson;
const JUNGLE_SURVIVAL_DATA_P8 = require('./data/p8-jungle-survival.json') as RawMapJson;
const MIRROR_MAZE_DATA_P8 = require('./data/p8-mirror-maze.json') as RawMapJson;
const URBAN_GRID_DATA_P8 = require('./data/p8-urban-grid.json') as RawMapJson;

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
  maxPlayers?: number;
  spawnPoints: { x: number; y: number }[];
  obstacles: RawObstacle[];
  powerUps: RawPowerUp[];
}

const MAP_POOL: RawMapJson[] = [
  FORTRESS_CENTER_DATA,
  JUNGLE_SURVIVAL_DATA,
  CANYON_STANDOFF_DATA_P16,
  FOREST_CLEARING_DATA_P16,
  FORTRESS_SIEGE_DATA_P16,
  MIRROR_MAZE_DATA_P16,
  URBAN_GRID_DATA_P16,
  CANYON_STANDOFF_DATA_P4,
  FOREST_CLEARING_DATA_P4,
  FORTRESS_SIEGE_DATA_P4,
  JUNGLE_SURVIVAL_DATA_P4,
  MIRROR_MAZE_DATA_P4,
  URBAN_ASSAULT_DATA_P4,
  CANYON_STANDOFF_DATA_P8,
  FOREST_CLEARING_DATA_P8,
  FORTRESS_SIEGE_DATA_P8,
  JUNGLE_SURVIVAL_DATA_P8,
  MIRROR_MAZE_DATA_P8,
  URBAN_GRID_DATA_P8,
];

@Injectable()
export class MapService {
  createMap(playerCount = 4): GameMap {
    return this.loadFromJson(this.pickMapForPlayerCount(playerCount));
  }

  private pickMapForPlayerCount(playerCount: number): RawMapJson {
    const tier = this.tierForPlayerCount(playerCount);
    const candidates = MAP_POOL.filter(map => map.spawnPoints.length === tier);
    if (candidates.length === 0) {
      throw new Error(`No map found for ${tier}-player tier`);
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private tierForPlayerCount(playerCount: number): number {
    if (playerCount <= 4) return 4;
    if (playerCount <= 8) return 8;
    return 16;
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

  private power(type: PowerUpType, x: number, y: number): PowerUpSpawn {
    return {
      id: uuidv4(),
      type,
      assetId: POWER_UP_ASSET_ID[type],
      x,
      y,
      radius: POWER_UP_RADIUS,
      createdAt: Date.now(),
    };
  }
}
