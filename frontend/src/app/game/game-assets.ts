export interface GameTextureSize {
  readonly width: number;
  readonly height: number;
}

export interface PhaserGameAsset {
  readonly type: 'audio' | 'image' | 'svg';
  readonly key: string;
  // Audio entries list one URL per format; the loader picks the first one
  // the browser can decode (iOS Safari cannot play OGG, so MP3 is required).
  readonly path: string | string[];
  readonly textureSize?: GameTextureSize;
}

const OBSTACLE_SIZE = { width: 64, height: 64 } as const;
const MIRROR_SIZE = { width: 256, height: 64 } as const;
const WEAPON_SIZE = { width: 96, height: 96 } as const;
const HUD_ICON_SIZE = { width: 96, height: 96 } as const;

export const PHASER_GAME_ASSETS: readonly PhaserGameAsset[] = [
  ...[
    'bush_01_rounded_dense',
    'bush_02_irregular_leafy',
    'bush_03_compact_arcade',
    'bush_04_wide_low',
  ].map((assetId) => ({
    type: 'svg' as const,
    key: `obstacle-${assetId}`,
    path: `assets/obstacle/bush/${assetId}.svg`,
    textureSize: OBSTACLE_SIZE,
  })),
  ...[
    'decoration_01_spiky_organic',
    'decoration_02_two_lobed',
    'decoration_03_pink_yellow_flowers',
    'decoration_04_grass_blue_flowers',
    'decoration_05_wild_red_flowers',
    'decoration_06_sharp_grass_pink_yellow',
    'decoration_07_leafy_blue_flower',
    'decoration_08_tall_grass_wildflowers',
    'decoration_09_cactus_flowers',
    'decoration_10_reed_patch_orange',
    'decoration_11_fern_star',
    'decoration_12_clover_patch',
    'decoration_13_dry_grass_mix',
    'decoration_14_vine_swirl',
  ].map((assetId) => ({
    type: 'svg' as const,
    key: `obstacle-${assetId}`,
    path: `assets/obstacle/decoration/${assetId}.svg`,
    textureSize: OBSTACLE_SIZE,
  })),
  ...[
    'wood_barricade_1',
    'wood_barricade_2',
    'wood_barricade_3',
    'rock_block_1',
    'rock_block_2',
    'rock_block_3',
  ].map((assetId) => ({
    type: 'svg' as const,
    key: `obstacle-${assetId}`,
    path: `assets/obstacle/${assetId}.svg`,
    textureSize: OBSTACLE_SIZE,
  })),
  {
    type: 'image',
    key: 'obstacle-steel_block_01',
    path: 'assets/obstacle/steel_block_01.png',
  },
  {
    type: 'svg',
    key: 'obstacle-mirror_panel_01',
    path: 'assets/obstacle/mirror_panel_01.svg',
    textureSize: MIRROR_SIZE,
  },
  ...['triple_shot', 'shotgun', 'grenade', 'laser'].map((type) => ({
    type: 'svg' as const,
    key: `weapon-power_${type}`,
    path: `assets/weapon/power_${type}.svg`,
    textureSize: WEAPON_SIZE,
  })),
  ...['dash', 'shot', 'shield'].map((type) => ({
    type: 'svg' as const,
    key: `hud-${type}`,
    path: `assets/power/${type}.svg`,
    textureSize: HUD_ICON_SIZE,
  })),
  {
    type: 'svg',
    key: 'hud-bottom-panel',
    path: 'assets/hud/hud-bottom-panel.svg',
    textureSize: { width: 1792, height: 100 },
  },
  {
    type: 'svg',
    key: 'hud-hp-panel',
    path: 'assets/hud/hud-hp-panel.svg',
    textureSize: { width: 300, height: 80 },
  },
  {
    type: 'svg',
    key: 'hud-players-panel',
    path: 'assets/hud/hud-players-panel.svg',
    textureSize: { width: 220, height: 60 },
  },
  {
    type: 'svg',
    key: 'hud-viewer-eye',
    path: 'assets/hud/viewer-eye.svg',
    textureSize: { width: 64, height: 40 },
  },
  ...[
    ['weapon-standard-fire', 'weapon_standard_fire.ogg'],
    ['weapon-triple-shot-fire', 'weapon_triple_shot_fire.ogg'],
    ['weapon-shotgun-fire', 'weapon_shotgun_fire.ogg'],
    ['weapon-grenade-launch', 'weapon_grenade_launch.ogg'],
    ['weapon-grenade-explode', 'weapon_grenade_explode.ogg'],
    ['weapon-laser-fire', 'weapon_laser_fire.ogg'],
    ['weapon-laser-reflect-mirror', 'weapon_laser_reflect_mirror.ogg'],
    ['bullet-hit-spark', 'bullet_hit_spark.ogg'],
    ['bullet-hit-wood', 'bullet_hit_wood.ogg'],
    ['bullet-hit-rock', 'bullet_hit_rock.ogg'],
    ['bullet-hit-steel', 'bullet_hit_steel.ogg'],
    ['bullet-mirror-ricochet', 'bullet_mirror_ricochet.ogg'],
    ['weapon-reload-start', 'weapon_reload_start.ogg'],
    ['weapon-reload-complete', 'weapon_reload_complete.ogg'],
    ['powerup-pickup-weapon', 'powerup_pickup_weapon.ogg'],
    ['player-dash', 'dash.ogg'],
  ].map(([key, file]) => ({
    type: 'audio' as const,
    key,
    path: [
      `assets/sounds/effects/${file}`,
      `assets/sounds/effects/${file.replace(/\.ogg$/, '.mp3')}`,
    ],
  })),
  ...[
    ['shield-launch', 'shield_launch.mp3'],
    ['shield-launching', 'shield_launching.mp3'],
    ['shield-hit', 'shield_hit.mp3'],
    ['result-victory-first', 'victory_stinger_top_1.mp3'],
    ['result-victory-second', 'victory_stinger_top_2.mp3'],
    ['result-victory-third', 'victory_stinger_top_3.mp3'],
    ['result-defeat', 'defeat_stinger.mp3'],
  ].map(([key, file]) => ({
    type: 'audio' as const,
    key,
    path: `assets/sounds/effects/${file}`,
  })),
  ...[
    ['arena-ambience', 'arena_ambience.mp3'],
    ['music-battle-one', 'main_battle_music_p1.mp3'],
    ['music-battle-two', 'main_battle_music_p2.mp3'],
    ['music-danger-zone', 'danger_zone_music.mp3'],
  ].map(([key, file]) => ({
    type: 'audio' as const,
    key,
    path: `assets/sounds/music/${file}`,
  })),
];

export const TANK_TEMPLATE_PATHS = {
  body: '/assets/tanks/tank_body_template.svg',
  turret: '/assets/tanks/tank_pistol_template.svg',
  hurtBody: '/assets/tanks/tank_body_hurt_template.svg',
  hurtTurret: '/assets/tanks/tank_pistol_hurt_template.svg',
  criticalBody: '/assets/tanks/tank_body_critical_template.svg',
  criticalTurret: '/assets/tanks/tank_pistol_critical_template.svg',
  destroyedBody: '/assets/tanks/tank_body_destroyed_template.svg',
  destroyedTurret: '/assets/tanks/tank_pistol_destroyed_template.svg',
} as const;

export const SHIELD_TEMPLATE_PATH = '/assets/tanks/tank_shield_template.svg';

export const WEAPON_OVERLAY_TEMPLATE_PATHS = {
  triple_shot: '/assets/weapons/triple_shot_overlay_template.svg',
  shotgun: '/assets/weapons/shotgun_overlay_template.svg',
  grenade: '/assets/weapons/grenade_overlay_template.svg',
  laser: '/assets/weapons/laser_overlay_template.svg',
} as const;

export const GAME_PUBLIC_ASSET_PATHS = [
  ...PHASER_GAME_ASSETS.flatMap((asset) => (Array.isArray(asset.path) ? asset.path : [asset.path])),
  ...Object.values(TANK_TEMPLATE_PATHS),
  SHIELD_TEMPLATE_PATH,
  ...Object.values(WEAPON_OVERLAY_TEMPLATE_PATHS),
] as const;
