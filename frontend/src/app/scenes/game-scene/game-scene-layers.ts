import Phaser from 'phaser';
import { REVEALED_TANK_DEPTH } from './game-scene.constants';

export interface GameSceneLayers {
  bgGfx: Phaser.GameObjects.Graphics;
  dangerZoneGfx: Phaser.GameObjects.Graphics;
  glowGfx: Phaser.GameObjects.Graphics;
  mainGfx: Phaser.GameObjects.Graphics;
  bulletGlowGfx: Phaser.GameObjects.Graphics;
  bulletGfx: Phaser.GameObjects.Graphics;
  playerUiGfx: Phaser.GameObjects.Graphics;
}

export function createGameSceneLayers(scene: Phaser.Scene): GameSceneLayers {
  return {
    bgGfx: scene.add.graphics().setDepth(0),
    dangerZoneGfx: scene.add.graphics().setDepth(REVEALED_TANK_DEPTH + 0.35),
    glowGfx: scene.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD),
    mainGfx: scene.add.graphics().setDepth(5),
    bulletGlowGfx: scene.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD),
    bulletGfx: scene.add.graphics().setDepth(9.2),
    playerUiGfx: scene.add.graphics().setDepth(REVEALED_TANK_DEPTH + 0.6),
  };
}

export function clearDynamicLayers(layers: GameSceneLayers): void {
  layers.glowGfx.clear();
  layers.dangerZoneGfx.clear();
  layers.mainGfx.clear();
  layers.bulletGlowGfx.clear();
  layers.bulletGfx.clear();
  layers.playerUiGfx.clear();
}
