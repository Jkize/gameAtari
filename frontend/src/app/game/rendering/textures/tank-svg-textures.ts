import Phaser from 'phaser';
import { TANK_TEMPLATE_PATHS } from '@game/assets/game-assets';
import { applyTankColor, colorToKeyPart, loadSvgTexture } from './svg-texture-utils';

export interface TankTextureKeys {
  body: string;
  turret: string;
  hurtBody: string;
  hurtTurret: string;
  criticalBody: string;
  criticalTurret: string;
  destroyedBody: string;
  destroyedTurret: string;
}

export const TANK_TURRET_ORIGIN_X = 256 / 512;
export const TANK_TURRET_ORIGIN_Y = 150 / 512;
export const TANK_BODY_ROTATION_OFFSET = Math.PI / 2;
export const TANK_TURRET_ROTATION_OFFSET = -Math.PI / 2;

interface TankSvgTemplates {
  body: string;
  turret: string;
  hurtBody: string;
  hurtTurret: string;
  criticalBody: string;
  criticalTurret: string;
  destroyedBody: string;
  destroyedTurret: string;
}

let tankSvgTemplatesPromise: Promise<TankSvgTemplates> | null = null;

function getTankSvgTemplates(): Promise<TankSvgTemplates> {
  tankSvgTemplatesPromise ??= Promise.all([
    fetch(TANK_TEMPLATE_PATHS.body).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.turret).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.hurtBody).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.hurtTurret).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.criticalBody).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.criticalTurret).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.destroyedBody).then((response) => response.text()),
    fetch(TANK_TEMPLATE_PATHS.destroyedTurret).then((response) => response.text()),
  ]).then(
    ([
      body,
      turret,
      hurtBody,
      hurtTurret,
      criticalBody,
      criticalTurret,
      destroyedBody,
      destroyedTurret,
    ]) => ({
      body,
      turret,
      hurtBody,
      hurtTurret,
      criticalBody,
      criticalTurret,
      destroyedBody,
      destroyedTurret,
    }),
  );

  return tankSvgTemplatesPromise;
}

export function getTankTextureKeys(color: number): TankTextureKeys {
  const colorKey = colorToKeyPart(color);
  return {
    body: `tank-body-${colorKey}`,
    turret: `tank-turret-${colorKey}`,
    hurtBody: `tank-body-hurt-${colorKey}`,
    hurtTurret: `tank-turret-hurt-${colorKey}`,
    criticalBody: `tank-body-critical-${colorKey}`,
    criticalTurret: `tank-turret-critical-${colorKey}`,
    destroyedBody: `tank-body-destroyed-${colorKey}`,
    destroyedTurret: `tank-turret-destroyed-${colorKey}`,
  };
}

export function ensureTankSvgTextures(scene: Phaser.Scene, color: number): TankTextureKeys | null {
  const keys = getTankTextureKeys(color);
  if (
    scene.textures.exists(keys.body) &&
    scene.textures.exists(keys.turret) &&
    scene.textures.exists(keys.hurtBody) &&
    scene.textures.exists(keys.hurtTurret) &&
    scene.textures.exists(keys.criticalBody) &&
    scene.textures.exists(keys.criticalTurret) &&
    scene.textures.exists(keys.destroyedBody) &&
    scene.textures.exists(keys.destroyedTurret)
  ) {
    return keys;
  }

  const pendingKey = [
    keys.body,
    keys.turret,
    keys.hurtBody,
    keys.hurtTurret,
    keys.criticalBody,
    keys.criticalTurret,
    keys.destroyedBody,
    keys.destroyedTurret,
  ].join(':');
  const registry = scene.registry;
  const pending =
    (registry.get('tankTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('tankTextureLoads', pending);

  void getTankSvgTemplates()
    .then((templates) => {
      const bodyUrl = loadSvgTexture(
        scene,
        keys.body,
        applyTankColor(templates.body, color),
        112,
        112,
      );
      const turretUrl = loadSvgTexture(
        scene,
        keys.turret,
        applyTankColor(templates.turret, color),
        112,
        112,
      );
      const hurtBodyUrl = loadSvgTexture(
        scene,
        keys.hurtBody,
        applyTankColor(templates.hurtBody, color),
        112,
        112,
      );
      const hurtTurretUrl = loadSvgTexture(
        scene,
        keys.hurtTurret,
        applyTankColor(templates.hurtTurret, color),
        112,
        112,
      );
      const criticalBodyUrl = loadSvgTexture(
        scene,
        keys.criticalBody,
        applyTankColor(templates.criticalBody, color),
        112,
        112,
      );
      const criticalTurretUrl = loadSvgTexture(
        scene,
        keys.criticalTurret,
        applyTankColor(templates.criticalTurret, color),
        112,
        112,
      );
      const destroyedBodyUrl = loadSvgTexture(
        scene,
        keys.destroyedBody,
        applyTankColor(templates.destroyedBody, color),
        112,
        112,
      );
      const destroyedTurretUrl = loadSvgTexture(
        scene,
        keys.destroyedTurret,
        applyTankColor(templates.destroyedTurret, color),
        112,
        112,
      );
      const cleanup = (url: string): void => URL.revokeObjectURL(url);

      scene.load.once(`filecomplete-svg-${keys.body}`, () => cleanup(bodyUrl));
      scene.load.once(`filecomplete-svg-${keys.turret}`, () => cleanup(turretUrl));
      scene.load.once(`filecomplete-svg-${keys.hurtBody}`, () => cleanup(hurtBodyUrl));
      scene.load.once(`filecomplete-svg-${keys.hurtTurret}`, () => cleanup(hurtTurretUrl));
      scene.load.once(`filecomplete-svg-${keys.criticalBody}`, () => cleanup(criticalBodyUrl));
      scene.load.once(`filecomplete-svg-${keys.criticalTurret}`, () => cleanup(criticalTurretUrl));
      scene.load.once(`filecomplete-svg-${keys.destroyedBody}`, () => cleanup(destroyedBodyUrl));
      scene.load.once(`filecomplete-svg-${keys.destroyedTurret}`, () =>
        cleanup(destroyedTurretUrl),
      );
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        pending.delete(pendingKey);
        registry.set('tankTextureLoads', pending);
      });

      scene.load.start();
    })
    .catch(() => {
      pending.delete(pendingKey);
      registry.set('tankTextureLoads', pending);
    });
  return null;
}
