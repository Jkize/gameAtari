export type TankColorHex = `#${string}`;

export interface TankPaint {
  hull: { base: TankColorHex };
  turret: { base: TankColorHex };
  tracks: { treadShadow: TankColorHex };
}

export interface TankCustomizationV1 {
  version: 1;
  baseColor: TankColorHex;
  paint: TankPaint;
}

export type TankCustomization = TankCustomizationV1;

export interface TankRenderColors {
  hull: number;
  turret: number;
  trackTreadShadow: number;
}

export const DEFAULT_TANK_CUSTOMIZATION: TankCustomization = {
  version: 1,
  baseColor: '#db3a2c',
  paint: {
    hull: { base: '#db3a2c' },
    turret: { base: '#db3a2c' },
    tracks: { treadShadow: '#db3a2c' },
  },
};

export const TANK_COLOR_PRESETS: readonly TankColorHex[] = [
  '#db3a2c',
  '#ff8a1f',
  '#f3d33b',
  '#42d97c',
  '#24c7d9',
  '#3478f6',
  '#9b5de5',
  '#e94f9c',
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isTankColorHex(value: unknown): value is TankColorHex {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

/**
 * Accepts the canonical nested contract and temporarily understands the
 * previous flat contract so a cached browser value can migrate safely.
 */
export function normalizeTankCustomization(value: unknown): TankCustomization {
  if (!isRecord(value)) return cloneDefaultCustomization();
  const baseColor = normalizedColor(value['baseColor']);
  const paint = isRecord(value['paint']) ? value['paint'] : null;
  if (value['version'] !== 1 || !baseColor || !paint) return cloneDefaultCustomization();

  const hullBase = nestedColor(paint, 'hull', 'base')
    ?? normalizedColor(paint['hull']);
  const turretBase = nestedColor(paint, 'turret', 'base')
    ?? normalizedColor(paint['turret']);
  const treadShadow = nestedColor(paint, 'tracks', 'treadShadow')
    ?? normalizedColor(paint['trackTread']);

  if (!hullBase || !turretBase || !treadShadow) return cloneDefaultCustomization();
  return {
    version: 1,
    baseColor,
    paint: {
      hull: { base: hullBase },
      turret: { base: turretBase },
      tracks: { treadShadow },
    },
  };
}

export function tankColorHexToNumber(color: TankColorHex): number {
  return Number.parseInt(color.slice(1), 16);
}

export function resolveTankRenderColors(
  customization: TankCustomization | undefined,
  fallbackColor: number,
): TankRenderColors {
  if (!customization) {
    return {
      hull: fallbackColor,
      turret: fallbackColor,
      trackTreadShadow: fallbackColor,
    };
  }
  return {
    hull: tankColorHexToNumber(customization.paint.hull.base),
    turret: tankColorHexToNumber(customization.paint.turret.base),
    trackTreadShadow: tankColorHexToNumber(customization.paint.tracks.treadShadow),
  };
}

export function cloneTankCustomization(customization: TankCustomization): TankCustomization {
  return {
    version: 1,
    baseColor: customization.baseColor,
    paint: {
      hull: { ...customization.paint.hull },
      turret: { ...customization.paint.turret },
      tracks: { ...customization.paint.tracks },
    },
  };
}

export function tankCustomizationsEqual(
  left: TankCustomization,
  right: TankCustomization,
): boolean {
  return left.version === right.version
    && left.baseColor === right.baseColor
    && left.paint.hull.base === right.paint.hull.base
    && left.paint.turret.base === right.paint.turret.base
    && left.paint.tracks.treadShadow === right.paint.tracks.treadShadow;
}

function nestedColor(
  paint: Record<string, unknown>,
  group: string,
  property: string,
): TankColorHex | null {
  const groupValue = paint[group];
  return isRecord(groupValue) ? normalizedColor(groupValue[property]) : null;
}

function normalizedColor(value: unknown): TankColorHex | null {
  return isTankColorHex(value) ? value.toLowerCase() as TankColorHex : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneDefaultCustomization(): TankCustomization {
  return cloneTankCustomization(DEFAULT_TANK_CUSTOMIZATION);
}
