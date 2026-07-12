import Phaser from 'phaser';
import { SHIELD_TEMPLATE_PATH } from '../../game/game-assets';
import { applyTankColor, colorToKeyPart, loadSvgTexture } from './svg-texture-utils';

let shieldTemplatePromise: Promise<string> | null = null;

function getShieldTemplate(): Promise<string> {
  shieldTemplatePromise ??= fetch(SHIELD_TEMPLATE_PATH).then((response) => response.text());
  return shieldTemplatePromise;
}

export function getShieldTextureKey(color: number): string {
  return `tank-shield-${colorToKeyPart(color)}`;
}

export function ensureShieldSvgTexture(scene: Phaser.Scene, color: number): string | null {
  const key = getShieldTextureKey(color);
  if (scene.textures.exists(key)) return key;

  const pendingKey = `shield:${key}`;
  const registry = scene.registry;
  const pending =
    (registry.get('shieldTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('shieldTextureLoads', pending);

  void getShieldTemplate()
    .then((template) => {
      const url = loadSvgTexture(scene, key, applyTankColor(template, color), 160, 160);
      scene.load.once(`filecomplete-svg-${key}`, () => URL.revokeObjectURL(url));
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        pending.delete(pendingKey);
        registry.set('shieldTextureLoads', pending);
      });
      scene.load.start();
    })
    .catch(() => {
      pending.delete(pendingKey);
      registry.set('shieldTextureLoads', pending);
    });

  return null;
}
