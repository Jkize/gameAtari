export interface TerrainPatchLayer {
  color: number;
  alphaMin: number;
  alphaMax: number;
  widthScale: number;
  heightScale: number;
  offsetX: number;
  offsetY: number;
}

export interface TerrainPatchTemplate {
  color: number;
  alphaMin: number;
  alphaMax: number;
  radiusMin: number;
  radiusMax: number;
  widthScale: number;
  heightScaleMin: number;
  heightScaleMax: number;
  layers: TerrainPatchLayer[];
}

export interface BackgroundScenarioTemplate {
  id: string;
  name: string;
  cssClass: string;
  pageBackground: string;
  canvasBackground: string;
  boot: {
    panel: number;
    preTitleText: string;
    titleText: string;
    titleStroke: string;
    metaText: string;
    loaderText: string;
  };
  base: number;
  baseNoise: number[];
  minorLine: number;
  majorLine: number;
  border: number;
  innerBorder: number;
  crack: number;
  scrubDark: number;
  scrubMid: number;
  scrubLight: number;
  patch: TerrainPatchTemplate;
}

export const DESERT_SCENARIO: BackgroundScenarioTemplate = {
  id: 'desert',
  name: 'Desert',
  cssClass: 'scenario-desert',
  pageBackground: '#20170d',
  canvasBackground: '#8f6940',
  boot: {
    panel: 0x2b1d10,
    preTitleText: '#b89562',
    titleText: '#f2cf8f',
    titleStroke: '#4a2c17',
    metaText: '#8c714a',
    loaderText: '#c79b5d',
  },
  base: 0xb98952,
  baseNoise: [0xc89a60, 0xb57b44, 0xd3aa72, 0xa86f3d],
  minorLine: 0xa16b39,
  majorLine: 0x7d512f,
  border: 0x6f4c2a,
  innerBorder: 0xd6aa6c,
  crack: 0x5b3720,
  scrubDark: 0x4b5427,
  scrubMid: 0x6d7137,
  scrubLight: 0x9a8746,
  patch: {
    color: 0x9f7040,
    alphaMin: 0.18,
    alphaMax: 0.30,
    radiusMin: 50,
    radiusMax: 120,
    widthScale: 2.8,
    heightScaleMin: 0.45,
    heightScaleMax: 0.85,
    layers: [
      {
        color: 0xd5ae77,
        alphaMin: 0.12,
        alphaMax: 0.22,
        widthScale: 1.75,
        heightScale: 0.42,
        offsetX: 10,
        offsetY: -8,
      },
      {
        color: 0x7c512f,
        alphaMin: 0.10,
        alphaMax: 0.18,
        widthScale: 1.10,
        heightScale: 0.28,
        offsetX: -14,
        offsetY: 10,
      },
    ],
  },
};

export const ACTIVE_BACKGROUND_SCENARIO = DESERT_SCENARIO;
