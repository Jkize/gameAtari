import Phaser from 'phaser';

const TANK_COLOR_PATTERN = /--tank-color:\s*#[0-9a-fA-F]{3,8}\s*;/;

export function colorToKeyPart(color: number): string {
  return color.toString(16).padStart(6, '0');
}

export function applyTankColor(svg: string, color: number): string {
  return svg.replace(TANK_COLOR_PATTERN, `--tank-color: ${colorToCss(color)};`);
}

export function loadSvgTexture(
  scene: Phaser.Scene,
  key: string,
  svgString: string,
  width: number,
  height: number,
): string {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  scene.load.svg(key, url, { width, height });
  return url;
}

function colorToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}
