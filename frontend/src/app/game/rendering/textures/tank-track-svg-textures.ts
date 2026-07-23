import Phaser from 'phaser';
import { TANK_TRACK_TEMPLATE_PATHS } from '@game/assets/game-assets';
import { applyTrackColor, colorToKeyPart, loadSvgTexture } from './svg-texture-utils';
import { USE_PLAYER_COLOR_FOR_TRACK_TREAD_SHADOW } from './tank-track-rendering.config';

type TrackFrameKeys = readonly [string, string, string];

export interface TankTrackTextureKeys {
  normal: TrackFrameKeys;
  critical: TrackFrameKeys;
}

interface TankTrackSvgTemplates {
  normal: readonly [string, string, string];
  critical: readonly [string, string, string];
}

let tankTrackTemplatesPromise: Promise<TankTrackSvgTemplates> | null = null;

function getTankTrackTemplates(): Promise<TankTrackSvgTemplates> {
  tankTrackTemplatesPromise ??= Promise.all(
    Object.values(TANK_TRACK_TEMPLATE_PATHS).map(path =>
      fetch(path).then(response => response.text()),
    ),
  ).then(([normal0, normal1, normal2, critical0, critical1, critical2]) => ({
    normal: [normal0, normal1, normal2],
    critical: [critical0, critical1, critical2],
  }));

  return tankTrackTemplatesPromise;
}

export function getTankTrackTextureKeys(color: number): TankTrackTextureKeys {
  const colorKey = colorToKeyPart(color);
  return {
    normal: [0, 1, 2].map(frame => `tank-track-${colorKey}-${frame}`) as unknown as TrackFrameKeys,
    critical: [0, 1, 2].map(
      frame => `tank-track-critical-${colorKey}-${frame}`,
    ) as unknown as TrackFrameKeys,
  };
}

export function ensureTankTrackSvgTextures(
  scene: Phaser.Scene,
  color: number,
): TankTrackTextureKeys | null {
  const keys = getTankTrackTextureKeys(color);
  const allKeys = [...keys.normal, ...keys.critical];
  if (allKeys.every(key => scene.textures.exists(key))) return keys;

  const pendingKey = `tracks:${colorToKeyPart(color)}`;
  const registry = scene.registry;
  const pending =
    (registry.get('tankTrackTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('tankTrackTextureLoads', pending);

  void getTankTrackTemplates()
    .then(templates => {
      const templateFrames = [...templates.normal, ...templates.critical];
      const urls = allKeys.map((key, index) => {
        const url = loadSvgTexture(
          scene,
          key,
          USE_PLAYER_COLOR_FOR_TRACK_TREAD_SHADOW
            ? applyTrackColor(templateFrames[index], color)
            : templateFrames[index],
          112,
          112,
        );
        scene.load.once(`filecomplete-svg-${key}`, () => URL.revokeObjectURL(url));
        return url;
      });

      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        pending.delete(pendingKey);
        registry.set('tankTrackTextureLoads', pending);
      });
      scene.load.start();
      return urls;
    })
    .catch(() => {
      pending.delete(pendingKey);
      registry.set('tankTrackTextureLoads', pending);
    });

  return null;
}
