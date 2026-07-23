import Phaser from 'phaser';
import { WEAPON_OVERLAY_TEMPLATE_PATHS } from '@game/assets/game-assets';
import type { PowerUpType } from '@game/contracts/game-state.types';
import { applyTankColor, colorToKeyPart, loadSvgTexture } from './svg-texture-utils';

export type WeaponOverlayType = PowerUpType;

let weaponOverlayTemplatesPromise: Promise<Record<WeaponOverlayType, string>> | null = null;

function getWeaponOverlayTemplates(): Promise<Record<WeaponOverlayType, string>> {
  weaponOverlayTemplatesPromise ??= Promise.all(
    Object.entries(WEAPON_OVERLAY_TEMPLATE_PATHS).map(([type, path]) =>
      fetch(path)
        .then((response) => response.text())
        .then((svg) => [type, svg] as const),
    ),
  ).then((entries) => Object.fromEntries(entries) as Record<WeaponOverlayType, string>);

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
  const pending =
    (registry.get('weaponOverlayTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('weaponOverlayTextureLoads', pending);

  void getWeaponOverlayTemplates()
    .then((templates) => {
      const url = loadSvgTexture(scene, key, applyTankColor(templates[type], color), 112, 112);
      scene.load.once(`filecomplete-svg-${key}`, () => URL.revokeObjectURL(url));
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        pending.delete(pendingKey);
        registry.set('weaponOverlayTextureLoads', pending);
      });
      scene.load.start();
    })
    .catch(() => {
      pending.delete(pendingKey);
      registry.set('weaponOverlayTextureLoads', pending);
    });

  return null;
}
