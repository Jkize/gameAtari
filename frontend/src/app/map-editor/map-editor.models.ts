import { ObstacleAssetId, ObstacleType } from '../types/game-state.types';

export type EditorEntityKind = 'obstacle' | 'spawn';
export type EditorTool = 'select' | 'spawn' | ObstacleAssetId;

export interface EditorObstacle {
  editorId: string;
  type: ObstacleType;
  assetId: ObstacleAssetId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorSpawnPoint {
  editorId: string;
  x: number;
  y: number;
}

export interface MapEditorDocument {
  name: string;
  width: number;
  height: number;
  obstacles: EditorObstacle[];
  spawnPoints: EditorSpawnPoint[];
}

export interface EditorSelection {
  kind: EditorEntityKind;
  id: string;
}

export interface CustomMapJson {
  name: string;
  width: number;
  height: number;
  spawnPoints: Array<{ x: number; y: number }>;
  obstacles: Array<{
    type: ObstacleType;
    assetId: ObstacleAssetId;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  powerUps: [];
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  selection?: EditorSelection;
}

export interface ViewportState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}
