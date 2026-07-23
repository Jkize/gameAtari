export type TankColorHex = `#${string}`;
export type TankSkinId = 'classic';

export interface TankPartColors {
  body: TankColorHex;
  turret: TankColorHex;
  tracks: TankColorHex;
}

/**
 * Versioned payload intended for both customization updates and the player's
 * appearance in the initial game/map response.
 */
export interface TankCustomizationV1 {
  version: 1;
  skinId: TankSkinId;
  colors: TankPartColors;
}

export type TankCustomization = TankCustomizationV1;

export const DEFAULT_TANK_CUSTOMIZATION: TankCustomization = {
  version: 1,
  skinId: 'classic',
  colors: {
    body: '#db3a2c',
    turret: '#db3a2c',
    tracks: '#db3a2c',
  },
};

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isTankColorHex(value: unknown): value is TankColorHex {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function normalizeTankCustomization(value: unknown): TankCustomization {
  if (!value || typeof value !== 'object') return cloneDefaultCustomization();

  const candidate = value as Partial<TankCustomizationV1>;
  const colors = candidate.colors as Partial<TankPartColors> | undefined;
  if (
    candidate.version !== 1 ||
    candidate.skinId !== 'classic' ||
    !isTankColorHex(colors?.body) ||
    !isTankColorHex(colors?.turret) ||
    !isTankColorHex(colors?.tracks)
  ) {
    return cloneDefaultCustomization();
  }

  return {
    version: 1,
    skinId: 'classic',
    colors: {
      body: colors.body.toLowerCase() as TankColorHex,
      turret: colors.turret.toLowerCase() as TankColorHex,
      tracks: colors.tracks.toLowerCase() as TankColorHex,
    },
  };
}

export function tankColorHexToNumber(color: TankColorHex): number {
  return Number.parseInt(color.slice(1), 16);
}

function cloneDefaultCustomization(): TankCustomization {
  return {
    ...DEFAULT_TANK_CUSTOMIZATION,
    colors: { ...DEFAULT_TANK_CUSTOMIZATION.colors },
  };
}
