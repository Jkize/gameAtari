import Phaser from 'phaser';

export interface TankTextureKeys {
  body: string;
  turret: string;
}

export const TANK_TURRET_ORIGIN_X = 48 / 128;

function svgTexture(scene: Phaser.Scene, key: string, svgString: string, width = 96, height = 96): string {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  scene.load.svg(key, url, { width, height });
  return url;
}

function getTankBodySVG(): string {
  const treadY = [30, 48, 66, 84, 102, 120];

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 160">
  <ellipse cx="112" cy="88" rx="88" ry="52" fill="#000000" opacity="0.20"/>
  <rect x="12" y="24" width="34" height="112" rx="9" fill="#202020"/>
  <rect x="178" y="24" width="34" height="112" rx="9" fill="#202020"/>
  ${treadY.map(y => `
  <rect x="20" y="${y}" width="10" height="10" rx="1.5" fill="#101010"/>
  <rect x="194" y="${y}" width="10" height="10" rx="1.5" fill="#101010"/>`).join('')}
  <rect x="39" y="33" width="146" height="94" rx="16" fill="#b8b8b8"/>
  <rect x="51" y="43" width="122" height="74" rx="12" fill="#ffffff"/>
  <path d="M51 48 Q112 30 173 48 L173 64 Q112 52 51 64 Z" fill="#ffffff" opacity="0.11"/>
  <rect x="44" y="37" width="136" height="10" rx="5" fill="#777777" opacity="0.75"/>
  <rect x="44" y="113" width="136" height="10" rx="5" fill="#777777" opacity="0.75"/>
  <circle cx="64" cy="57" r="4" fill="#555555"/>
  <circle cx="160" cy="57" r="4" fill="#555555"/>
  <circle cx="64" cy="103" r="4" fill="#555555"/>
  <circle cx="160" cy="103" r="4" fill="#555555"/>
</svg>`;
}

function getTankTurretSVG(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 96">
  <rect x="60" y="40" width="58" height="16" rx="5" fill="#1f1f1f"/>
  <rect x="64" y="43" width="50" height="10" rx="3" fill="#f4f4f4"/>
  <rect x="108" y="41" width="12" height="14" rx="3" fill="#d8d8d8"/>
  <rect x="112" y="45" width="7" height="6" rx="2" fill="#303030"/>
  <ellipse cx="48" cy="51" rx="42" ry="26" fill="#777777"/>
  <ellipse cx="48" cy="45" rx="38" ry="30" fill="#ffffff"/>
  <ellipse cx="48" cy="38" rx="27" ry="20" fill="#b8b8b8"/>
  <circle cx="48" cy="48" r="15" fill="#777777" stroke="#555555" stroke-width="2"/>
  <circle cx="48" cy="48" r="8" fill="#171717" opacity="0.88"/>
  <circle cx="48" cy="48" r="3" fill="#555555"/>
  <path d="M29 41 Q48 30 67 41" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.14" stroke-linecap="round"/>
</svg>`;
}

export function getTankTextureKeys(): TankTextureKeys {
  return {
    body: 'tank-body-base',
    turret: 'tank-turret-base',
  };
}

export function ensureTankSvgTextures(scene: Phaser.Scene): TankTextureKeys | null {
  const keys = getTankTextureKeys();
  if (scene.textures.exists(keys.body) && scene.textures.exists(keys.turret)) {
    return keys;
  }

  const pendingKey = `${keys.body}:${keys.turret}`;
  const registry = scene.registry;
  const pending = (registry.get('tankTextureLoads') as Set<string> | undefined) ?? new Set<string>();
  if (pending.has(pendingKey)) return null;

  pending.add(pendingKey);
  registry.set('tankTextureLoads', pending);

  const bodyUrl = svgTexture(scene, keys.body, getTankBodySVG(), 112, 80);
  const turretUrl = svgTexture(scene, keys.turret, getTankTurretSVG(), 64, 48);
  const cleanup = (url: string): void => URL.revokeObjectURL(url);

  scene.load.once(`filecomplete-svg-${keys.body}`, () => cleanup(bodyUrl));
  scene.load.once(`filecomplete-svg-${keys.turret}`, () => cleanup(turretUrl));
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    pending.delete(pendingKey);
    registry.set('tankTextureLoads', pending);
  });

  scene.load.start();
  return null;
}
