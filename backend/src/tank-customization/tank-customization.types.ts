import { createHash, randomInt } from 'crypto';

export const TANK_CUSTOMIZATION_SETTING_KEY = 'tank_customization';
export const TANK_COLOR_PRESETS = [
  '#db3a2c',
  '#ff8a1f',
  '#f3d33b',
  '#42d97c',
  '#24c7d9',
  '#3478f6',
  '#9b5de5',
  '#e94f9c',
] as const;

export type TankColorHex = `#${string}`;

export interface TankPaint {
  hull: { base: TankColorHex };
  turret: { base: TankColorHex };
  tracks: { treadShadow: TankColorHex };
}

export interface TankPaintPatch {
  hull?: { base?: TankColorHex };
  turret?: { base?: TankColorHex };
  tracks?: { treadShadow?: TankColorHex };
}

export interface TankCustomization {
  version: 1;
  baseColor: TankColorHex;
  paint: TankPaint;
}

export interface StoredTankCustomization {
  version?: 1;
  baseColor?: TankColorHex;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isTankColorHex(value: unknown): value is TankColorHex {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function randomBaseColor(): TankColorHex {
  return TANK_COLOR_PRESETS[randomInt(TANK_COLOR_PRESETS.length)];
}

export function stableLegacyBaseColor(userId: string): TankColorHex {
  const index = createHash('sha256').update(userId).digest().readUInt32BE(0) % TANK_COLOR_PRESETS.length;
  return TANK_COLOR_PRESETS[index];
}

export function createStoredTankCustomization(baseColor = randomBaseColor()): StoredTankCustomization {
  return { version: 1, baseColor, paint: {} };
}

/**
 * Produces the complete public/network contract. Missing paint values always
 * inherit the base color, while the stored JSON may remain sparse.
 */
export function resolveTankCustomization(
  value: unknown,
  fallbackBaseColor: TankColorHex,
): TankCustomization {
  const source = isRecord(value) ? value as StoredTankCustomization : {};
  const baseColor = normalizeColor(source.baseColor) ?? fallbackBaseColor;
  const paint = isRecord(source.paint) ? source.paint : {};
  return {
    version: 1,
    baseColor,
    paint: {
      hull: {
        base: nestedColor(paint, 'hull', 'base')
          ?? normalizeColor(paint.hull) // Temporary flat-contract compatibility.
          ?? baseColor,
      },
      turret: {
        base: nestedColor(paint, 'turret', 'base')
          ?? normalizeColor(paint.turret)
          ?? baseColor,
      },
      tracks: {
        treadShadow: nestedColor(paint, 'tracks', 'treadShadow')
          ?? normalizeColor(paint.trackTread)
          ?? baseColor,
      },
    },
  };
}

/**
 * Canonicalizes known fields but preserves unknown root, paint-group and
 * paint-property fields so future customization capabilities remain forward
 * compatible.
 */
export function canonicalizeStoredTankCustomization(
  value: unknown,
  fallbackBaseColor: TankColorHex,
): StoredTankCustomization {
  const source = isRecord(value) ? { ...value } : {};
  const resolved = resolveTankCustomization(source, fallbackBaseColor);
  delete source.skinId;

  const sourcePaint = isRecord(source.paint) ? { ...source.paint } : {};
  delete sourcePaint.trackTread;
  const paint: Record<string, unknown> = sourcePaint;
  writeSparseColor(paint, 'hull', 'base', resolved.paint.hull.base, resolved.baseColor);
  writeSparseColor(paint, 'turret', 'base', resolved.paint.turret.base, resolved.baseColor);
  writeSparseColor(
    paint,
    'tracks',
    'treadShadow',
    resolved.paint.tracks.treadShadow,
    resolved.baseColor,
  );

  return {
    ...source,
    version: 1,
    baseColor: resolved.baseColor,
    paint,
  };
}

export function mergeTankPaint(
  stored: unknown,
  patch: TankPaintPatch,
  fallbackBaseColor: TankColorHex,
): StoredTankCustomization {
  const canonical = canonicalizeStoredTankCustomization(stored, fallbackBaseColor);
  const paint = { ...(canonical.paint ?? {}) };
  const baseColor = canonical.baseColor ?? fallbackBaseColor;

  applyPatchColor(paint, 'hull', 'base', patch.hull?.base, baseColor);
  applyPatchColor(paint, 'turret', 'base', patch.turret?.base, baseColor);
  applyPatchColor(paint, 'tracks', 'treadShadow', patch.tracks?.treadShadow, baseColor);

  return { ...canonical, paint };
}

function applyPatchColor(
  paint: Record<string, unknown>,
  group: string,
  property: string,
  value: unknown,
  baseColor: TankColorHex,
): void {
  if (value === undefined) return;
  if (!isTankColorHex(value)) throw new Error(`Invalid tank paint color for ${group}.${property}`);
  writeSparseColor(paint, group, property, value.toLowerCase() as TankColorHex, baseColor);
}

function writeSparseColor(
  paint: Record<string, unknown>,
  group: string,
  property: string,
  color: TankColorHex,
  baseColor: TankColorHex,
): void {
  const existingGroup = isRecord(paint[group]) ? { ...paint[group] } : {};
  if (color === baseColor) delete existingGroup[property];
  else existingGroup[property] = color;
  if (Object.keys(existingGroup).length) paint[group] = existingGroup;
  else delete paint[group];
}

function nestedColor(
  paint: Record<string, unknown>,
  group: string,
  property: string,
): TankColorHex | null {
  const groupValue = paint[group];
  return isRecord(groupValue) ? normalizeColor(groupValue[property]) : null;
}

function normalizeColor(value: unknown): TankColorHex | null {
  return isTankColorHex(value) ? value.toLowerCase() as TankColorHex : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
