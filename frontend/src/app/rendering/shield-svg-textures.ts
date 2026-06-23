import Phaser from 'phaser';

const SHIELD_TEMPLATE_PATH = '/assets/tanks/tank_shield_template.svg';
const TANK_COLOR_PATTERN = /--tank-color:\s*#[0-9a-fA-F]{3,8}\s*;/;

let shieldTemplatePromise: Promise<string> | null = null;

function colorToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function colorToKeyPart(color: number): string {
  return color.toString(16).padStart(6, '0');
}

function applyShieldColor(svg: string, color: number): string {
  return svg.replace(TANK_COLOR_PATTERN, `--tank-color: ${colorToCss(color)};`);
}

function svgTexture(scene: Phaser.Scene, key: string, svgString: string, width = 160, height = 160): string {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  scene.load.svg(key, url, { width, height });
  return url;
}

function getShieldTemplate(): Promise<string> {
  shieldTemplatePromise ??= fetch(SHIELD_TEMPLATE_PATH).then(response => response.text());
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
  const pending = (registry.get('shieldTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('shieldTextureLoads', pending);

  void getShieldTemplate().then(template => {
    const url = svgTexture(scene, key, applyShieldColor(template, color));
    scene.load.once(`filecomplete-svg-${key}`, () => URL.revokeObjectURL(url));
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      pending.delete(pendingKey);
      registry.set('shieldTextureLoads', pending);
    });
    scene.load.start();
  }).catch(() => {
    pending.delete(pendingKey);
    registry.set('shieldTextureLoads', pending);
  });

  return null;
}
