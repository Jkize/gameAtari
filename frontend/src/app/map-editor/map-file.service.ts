import { Injectable } from '@angular/core';
import { ObstacleAssetId, ObstacleType } from '../types/game-state.types';
import { CATALOG_BY_ASSET, SUPPORTED_ASSET_IDS } from './obstacle-catalog';
import {
  CustomMapJson,
  MapEditorDocument,
  ValidationIssue,
} from './map-editor.models';

const TYPES = new Set<ObstacleType>(['bush', 'decoration', 'wood', 'rock', 'steel', 'mirror']);
const PLAYER_RADIUS = 28;

function id(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

@Injectable({ providedIn: 'root' })
export class MapFileService {
  parse(text: string): { document: MapEditorDocument; notice: string } {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('The selected file is not valid JSON.');
    }
    if (!raw || typeof raw !== 'object') throw new Error('The map JSON must contain an object.');
    const value = raw as Record<string, unknown>;
    if (typeof value['name'] !== 'string') throw new Error('Map "name" must be a string.');
    if (!finite(value['width']) || !finite(value['height'])) throw new Error('Map width and height must be numbers.');
    if (!Array.isArray(value['obstacles'])) throw new Error('Map "obstacles" must be an array.');
    if (!Array.isArray(value['spawnPoints'])) throw new Error('Map "spawnPoints" must be an array.');

    const obstacles = value['obstacles'].map((entry, index) => {
      if (!entry || typeof entry !== 'object') throw new Error(`Obstacle ${index} must be an object.`);
      const obstacle = entry as Record<string, unknown>;
      const type = obstacle['type'];
      const assetId = obstacle['assetId'];
      if (typeof type !== 'string' || !TYPES.has(type as ObstacleType)) {
        throw new Error(`Obstacle ${index} has unsupported type "${String(type)}".`);
      }
      if (typeof assetId !== 'string' || !SUPPORTED_ASSET_IDS.has(assetId as ObstacleAssetId)) {
        throw new Error(`Obstacle ${index} has unsupported assetId "${String(assetId)}".`);
      }
      const catalog = CATALOG_BY_ASSET.get(assetId as ObstacleAssetId);
      if (!catalog || catalog.type !== type) {
        throw new Error(`Obstacle ${index} type "${type}" does not match asset "${assetId}".`);
      }
      for (const field of ['x', 'y', 'width', 'height'] as const) {
        if (!finite(obstacle[field])) throw new Error(`Obstacle ${index} field "${field}" must be a number.`);
      }
      return {
        editorId: id('obstacle', index),
        type: type as ObstacleType,
        assetId: assetId as ObstacleAssetId,
        x: obstacle['x'] as number,
        y: obstacle['y'] as number,
        width: obstacle['width'] as number,
        height: obstacle['height'] as number,
      };
    });

    const spawnPoints = value['spawnPoints'].map((entry, index) => {
      if (!entry || typeof entry !== 'object') throw new Error(`Spawn point ${index} must be an object.`);
      const spawn = entry as Record<string, unknown>;
      if (!finite(spawn['x']) || !finite(spawn['y'])) {
        throw new Error(`Spawn point ${index} must contain numeric x and y values.`);
      }
      return { editorId: id('spawn', index), x: spawn['x'], y: spawn['y'] };
    });

    const powerUps = Array.isArray(value['powerUps']) ? value['powerUps'] : [];
    return {
      document: {
        name: value['name'],
        width: value['width'],
        height: value['height'],
        obstacles,
        spawnPoints,
      },
      notice: powerUps.length
        ? `${powerUps.length} power-up entr${powerUps.length === 1 ? 'y was' : 'ies were'} ignored.`
        : '',
    };
  }

  validate(document: MapEditorDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!document.name.trim()) issues.push({ severity: 'error', message: 'Map name is required.' });
    if (!Number.isInteger(document.width) || document.width <= 0) {
      issues.push({ severity: 'error', message: 'Map width must be a positive integer.' });
    }
    if (!Number.isInteger(document.height) || document.height <= 0) {
      issues.push({ severity: 'error', message: 'Map height must be a positive integer.' });
    }
    if (document.width > 10000 || document.height > 10000) {
      issues.push({ severity: 'warning', message: 'This map is unusually large and may be expensive to run.' });
    }
    if (!document.obstacles.length) issues.push({ severity: 'warning', message: 'The map has no obstacles.' });
    if (document.spawnPoints.length < 2) {
      issues.push({ severity: 'error', message: 'Add at least two spawn points.' });
    }

    document.obstacles.forEach((obstacle, index) => {
      const selection = { kind: 'obstacle' as const, id: obstacle.editorId };
      if (![obstacle.x, obstacle.y, obstacle.width, obstacle.height].every(Number.isFinite)) {
        issues.push({ severity: 'error', message: `Obstacle ${index + 1} contains invalid numbers.`, selection });
        return;
      }
      if (obstacle.width <= 0 || obstacle.height <= 0) {
        issues.push({ severity: 'error', message: `Obstacle ${index + 1} must have a positive size.`, selection });
      }
      if (
        obstacle.x - obstacle.width / 2 < 0 ||
        obstacle.y - obstacle.height / 2 < 0 ||
        obstacle.x + obstacle.width / 2 > document.width ||
        obstacle.y + obstacle.height / 2 > document.height
      ) {
        issues.push({ severity: 'error', message: `Obstacle ${index + 1} extends beyond the map.`, selection });
      }
      const catalog = CATALOG_BY_ASSET.get(obstacle.assetId);
      if (!catalog || catalog.type !== obstacle.type) {
        issues.push({ severity: 'error', message: `Obstacle ${index + 1} uses an unsupported type/asset pair.`, selection });
      }
    });

    for (let i = 0; i < document.obstacles.length; i++) {
      for (let j = i + 1; j < document.obstacles.length; j++) {
        if (this.rectanglesOverlap(document.obstacles[i], document.obstacles[j])) {
          issues.push({
            severity: 'warning',
            message: `Obstacles ${i + 1} and ${j + 1} overlap.`,
            selection: { kind: 'obstacle', id: document.obstacles[i].editorId },
          });
        }
      }
    }

    document.spawnPoints.forEach((spawn, index) => {
      const selection = { kind: 'spawn' as const, id: spawn.editorId };
      if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.y) ||
          spawn.x < 0 || spawn.y < 0 || spawn.x > document.width || spawn.y > document.height) {
        issues.push({ severity: 'error', message: `Spawn ${index + 1} is outside the map.`, selection });
      }
      document.obstacles.forEach(obstacle => {
        if (!this.circleIntersectsRect(spawn.x, spawn.y, PLAYER_RADIUS, obstacle)) return;
        const soft = obstacle.type === 'bush' || obstacle.type === 'decoration';
        issues.push({
          severity: soft ? 'warning' : 'error',
          message: `Spawn ${index + 1} overlaps ${soft ? 'soft cover' : `a ${obstacle.type} obstacle`}.`,
          selection,
        });
      });
      for (let other = index + 1; other < document.spawnPoints.length; other++) {
        const point = document.spawnPoints[other];
        if (Math.hypot(spawn.x - point.x, spawn.y - point.y) < PLAYER_RADIUS * 3) {
          issues.push({ severity: 'warning', message: `Spawns ${index + 1} and ${other + 1} are very close.`, selection });
        }
      }
    });

    return issues;
  }

  serialize(document: MapEditorDocument): string {
    const result: CustomMapJson = {
      name: document.name.trim(),
      width: Math.round(document.width),
      height: Math.round(document.height),
      maxPlayers: document.spawnPoints.length,
      spawnPoints: document.spawnPoints.map(point => ({ x: Math.round(point.x), y: Math.round(point.y) })),
      obstacles: document.obstacles.map(obstacle => ({
        type: obstacle.type,
        assetId: obstacle.assetId,
        x: Math.round(obstacle.x),
        y: Math.round(obstacle.y),
        width: Math.round(obstacle.width),
        height: Math.round(obstacle.height),
      })),
      powerUps: [],
    };
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  download(document: MapEditorDocument): void {
    const blob = new Blob([this.serialize(document)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.slug(document.name) || 'custom-map'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private slug(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private rectanglesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
    return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
  }

  private circleIntersectsRect(cx: number, cy: number, radius: number, rect: { x: number; y: number; width: number; height: number }): boolean {
    const nearestX = Math.max(rect.x - rect.width / 2, Math.min(cx, rect.x + rect.width / 2));
    const nearestY = Math.max(rect.y - rect.height / 2, Math.min(cy, rect.y + rect.height / 2));
    return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 <= radius ** 2;
  }
}
