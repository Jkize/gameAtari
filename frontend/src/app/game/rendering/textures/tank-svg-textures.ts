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

export function getTankTextureKeys(hullColor: number, turretColor = hullColor): TankTextureKeys {
  const hullKey = colorToKeyPart(hullColor);
  const turretKey = colorToKeyPart(turretColor);
  return {
    body: `tank-body-${hullKey}`,
    turret: `tank-turret-${turretKey}`,
    hurtBody: `tank-body-hurt-${hullKey}`,
    hurtTurret: `tank-turret-hurt-${turretKey}`,
    criticalBody: `tank-body-critical-${hullKey}`,
    criticalTurret: `tank-turret-critical-${turretKey}`,
    destroyedBody: `tank-body-destroyed-${hullKey}`,
    destroyedTurret: `tank-turret-destroyed-${turretKey}`,
  };
}

export function ensureTankSvgTextures(
  scene: Phaser.Scene,
  hullColor: number,
  turretColor = hullColor,
): TankTextureKeys | null {
  const keys = getTankTextureKeys(hullColor, turretColor);
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
        applyTankColor(templates.body, hullColor),
        112,
        112,
      );
      const turretUrl = loadSvgTexture(
        scene,
        keys.turret,
        applyTankColor(templates.turret, turretColor),
        112,
        112,
      );
      const hurtBodyUrl = loadSvgTexture(
        scene,
        keys.hurtBody,
        applyTankColor(templates.hurtBody, hullColor),
        112,
        112,
      );
      const hurtTurretUrl = loadSvgTexture(
        scene,
        keys.hurtTurret,
        applyTankColor(templates.hurtTurret, turretColor),
        112,
        112,
      );
      const criticalBodyUrl = loadSvgTexture(
        scene,
        keys.criticalBody,
        applyTankColor(templates.criticalBody, hullColor),
        112,
        112,
      );
      const criticalTurretUrl = loadSvgTexture(
        scene,
        keys.criticalTurret,
        applyTankColor(templates.criticalTurret, turretColor),
        112,
        112,
      );
      const destroyedBodyUrl = loadSvgTexture(
        scene,
        keys.destroyedBody,
        applyTankColor(templates.destroyedBody, hullColor),
        112,
        112,
      );
      const destroyedTurretUrl = loadSvgTexture(
        scene,
        keys.destroyedTurret,
        applyTankColor(templates.destroyedTurret, turretColor),
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
