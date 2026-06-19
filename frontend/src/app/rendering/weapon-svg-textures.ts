import Phaser from 'phaser';
import type { PowerUpType } from '../types/game-state.types';

export type WeaponOverlayType = PowerUpType;

const WEAPON_OVERLAY_TEMPLATE_PATHS: Record<WeaponOverlayType, string> = {
  triple_shot: '/assets/weapons/triple_shot_overlay_template.svg',
  shotgun: '/assets/weapons/shotgun_overlay_template.svg',
  grenade: '/assets/weapons/grenade_overlay_template.svg',
  laser: '/assets/weapons/laser_overlay_template.svg',
};

const TANK_COLOR_PATTERN = /--tank-color:\s*#[0-9a-fA-F]{3,8}\s*;/;

let weaponOverlayTemplatesPromise: Promise<Record<WeaponOverlayType, string>> | null = null;

function colorToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function colorToKeyPart(color: number): string {
  return color.toString(16).padStart(6, '0');
}

function applyTankColor(svg: string, color: number): string {
  return svg.replace(TANK_COLOR_PATTERN, `--tank-color: ${colorToCss(color)};`);
}

function svgTexture(scene: Phaser.Scene, key: string, svgString: string, width = 112, height = 112): string {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  scene.load.svg(key, url, { width, height });
  return url;
}

function getWeaponOverlayTemplates(): Promise<Record<WeaponOverlayType, string>> {
  weaponOverlayTemplatesPromise ??= Promise.all(
    Object.entries(WEAPON_OVERLAY_TEMPLATE_PATHS).map(([type, path]) =>
      fetch(path).then(response => response.text()).then(svg => [type, svg] as const),
    ),
  ).then(entries => Object.fromEntries(entries) as Record<WeaponOverlayType, string>);

  return weaponOverlayTemplatesPromise;
}

export function getWeaponOverlayTextureKey(type: WeaponOverlayType, color: number): string {
  return `tank-weapon-${type}-${colorToKeyPart(color)}`;
}

export function ensureWeaponOverlayTexture(
  scene: Phaser.Scene,
  type: WeaponOverlayType,
  color: number,
): string | null {
  const key = getWeaponOverlayTextureKey(type, color);
  if (scene.textures.exists(key)) return key;

  const pendingKey = `weaponOverlay:${key}`;
  const registry = scene.registry;
  const pending = (registry.get('weaponOverlayTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('weaponOverlayTextureLoads', pending);

  void getWeaponOverlayTemplates().then(templates => {
    const url = svgTexture(scene, key, applyTankColor(templates[type], color));
    scene.load.once(`filecomplete-svg-${key}`, () => URL.revokeObjectURL(url));
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      pending.delete(pendingKey);
      registry.set('weaponOverlayTextureLoads', pending);
    });
    scene.load.start();
  }).catch(() => {
    pending.delete(pendingKey);
    registry.set('weaponOverlayTextureLoads', pending);
  });

  return null;
}
