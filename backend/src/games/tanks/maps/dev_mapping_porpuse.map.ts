import { v4 as uuidv4 } from 'uuid';
import {
  BUSH_OBSTACLE_ASSET_IDS,
  DECORATION_OBSTACLE_ASSET_IDS,
  DEFAULT_OBSTACLE_SIZE,
  OBSTACLE_DEFINITIONS,
} from '../obstacle.config';
import { GameMap, Obstacle, ObstacleType } from '../types/map.types';
import { PowerUpSpawn, PowerUpType } from '../types/power-up.types';

const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1200;
const POWER_UP_RADIUS = 18;

const POWER_UP_ASSET_ID: Record<PowerUpType, string> = {
  triple_shot: 'power_triple_shot',
  shotgun: 'power_shotgun',
  grenade: 'power_grenade',
  laser: 'power_laser',
};

const DEV_MAPPING_PURPOSE_SPAWN_POINTS = [
  { x: 150, y: 150 },
  { x: 1450, y: 150 },
  { x: 150, y: 1050 },
  { x: 1450, y: 1050 },
  { x: 800, y: 120 },
  { x: 800, y: 1080 },
  { x: 120, y: 600 },
  { x: 1480, y: 600 },
  { x: 400, y: 300 },
  { x: 1200, y: 300 },
  { x: 400, y: 900 },
  { x: 1200, y: 900 },
  { x: 550, y: 550 },
  { x: 1050, y: 550 },
  { x: 800, y: 400 },
];

export function createDevMappingPorpuseMap(): GameMap {
  return {
    name: 'dev_mapping_porpuse',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    spawnPoints: DEV_MAPPING_PURPOSE_SPAWN_POINTS,
    obstacles: buildDevMappingPorpuseObstacles(),
    powerUps: buildDevMappingPorpusePowerUps(),
  };
}

function obs(
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

function buildDevMappingPorpuseObstacles(): Obstacle[] {
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
    obstacles.push(obs(type, x, y, w, h, assetId));
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

  return obstacles;
}

function power(type: PowerUpType, x: number, y: number): PowerUpSpawn {
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

function buildDevMappingPorpusePowerUps(): PowerUpSpawn[] {
  return [
    power('triple_shot', 800, 520),
    power('shotgun', 730, 650),
    power('grenade', 870, 650),
    power('laser', 800, 720),
  ];
}
