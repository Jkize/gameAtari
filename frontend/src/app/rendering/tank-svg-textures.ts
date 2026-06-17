import Phaser from 'phaser';

export interface TankTextureKeys {
  body: string;
  turret: string;
}

export const TANK_TURRET_ORIGIN_X = 256 / 512;
export const TANK_BODY_ROTATION_OFFSET = Math.PI / 2;
export const TANK_TURRET_ROTATION_OFFSET = -Math.PI / 2;
const TANK_BODY_TEMPLATE_PATH = '/assets/tanks/tank_body_template.svg';
const TANK_TURRET_TEMPLATE_PATH = '/assets/tanks/tank_pistol_template.svg';
const TANK_COLOR_PATTERN = /--tank-color:\s*#[0-9a-fA-F]{3,8}\s*;/;

interface TankSvgTemplates {
  body: string;
  turret: string;
}

let tankSvgTemplatesPromise: Promise<TankSvgTemplates> | null = null;

function svgTexture(scene: Phaser.Scene, key: string, svgString: string, width = 96, height = 96): string {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  scene.load.svg(key, url, { width, height });
  return url;
}

function getTankSvgTemplates(): Promise<TankSvgTemplates> {
  tankSvgTemplatesPromise ??= Promise.all([
    fetch(TANK_BODY_TEMPLATE_PATH).then(response => response.text()),
    fetch(TANK_TURRET_TEMPLATE_PATH).then(response => response.text()),
  ]).then(([body, turret]) => ({ body, turret }));

  return tankSvgTemplatesPromise;
}

function colorToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function colorToKeyPart(color: number): string {
  return color.toString(16).padStart(6, '0');
}

function applyTankColor(svg: string, color: number): string {
  return svg.replace(TANK_COLOR_PATTERN, `--tank-color: ${colorToCss(color)};`);
}

export function getTankTextureKeys(color: number): TankTextureKeys {
  const colorKey = colorToKeyPart(color);
  return {
    body: `tank-body-${colorKey}`,
    turret: `tank-turret-${colorKey}`,
  };
}

export function ensureTankSvgTextures(scene: Phaser.Scene, color: number): TankTextureKeys | null {
  const keys = getTankTextureKeys(color);
  if (scene.textures.exists(keys.body) && scene.textures.exists(keys.turret)) {
    return keys;
  }

  const pendingKey = `${keys.body}:${keys.turret}`;
  const registry = scene.registry;
  const pending = (registry.get('tankTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('tankTextureLoads', pending);

  void getTankSvgTemplates().then(templates => {
    const bodyUrl = svgTexture(scene, keys.body, applyTankColor(templates.body, color), 112, 112);
    const turretUrl = svgTexture(scene, keys.turret, applyTankColor(templates.turret, color), 112, 112);
    const cleanup = (url: string): void => URL.revokeObjectURL(url);

    scene.load.once(`filecomplete-svg-${keys.body}`, () => cleanup(bodyUrl));
    scene.load.once(`filecomplete-svg-${keys.turret}`, () => cleanup(turretUrl));
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      pending.delete(pendingKey);
      registry.set('tankTextureLoads', pending);
    });

    scene.load.start();
  }).catch(() => {
    pending.delete(pendingKey);
    registry.set('tankTextureLoads', pending);
  });
  return null;
}
