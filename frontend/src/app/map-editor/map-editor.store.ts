import { computed, Injectable, signal } from '@angular/core';
import { CATALOG_BY_ASSET } from './obstacle-catalog';
import {
  EditorObstacle,
  EditorSelection,
  EditorSpawnPoint,
  EditorTool,
  MapEditorDocument,
  ViewportState,
} from './map-editor.models';

const HISTORY_LIMIT = 100;

function createId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function cloneDocument(document: MapEditorDocument): MapEditorDocument {
  return {
    ...document,
    obstacles: document.obstacles.map(item => ({ ...item })),
    spawnPoints: document.spawnPoints.map(item => ({ ...item })),
  };
}

@Injectable()
export class MapEditorStore {
  readonly document = signal<MapEditorDocument>({
    name: 'Custom Arena',
    width: 1600,
    height: 1200,
    obstacles: [],
    spawnPoints: [],
  });
  readonly selection = signal<EditorSelection[]>([]);
  readonly tool = signal<EditorTool>('select');
  readonly gridSize = signal(16);
  readonly gridVisible = signal(true);
  readonly snapEnabled = signal(true);
  readonly viewport = signal<ViewportState>({ zoom: 0.5, offsetX: 80, offsetY: 80 });
  readonly importNotice = signal('');

  private readonly past = signal<MapEditorDocument[]>([]);
  private readonly future = signal<MapEditorDocument[]>([]);
  private transactionStart: MapEditorDocument | null = null;

  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);
  readonly selectedObstacles = computed(() => {
    const ids = new Set(this.selection().filter(item => item.kind === 'obstacle').map(item => item.id));
    return this.document().obstacles.filter(item => ids.has(item.editorId));
  });
  readonly selectedSpawns = computed(() => {
    const ids = new Set(this.selection().filter(item => item.kind === 'spawn').map(item => item.id));
    return this.document().spawnPoints.filter(item => ids.has(item.editorId));
  });
  readonly singleObstacle = computed(() => {
    const items = this.selectedObstacles();
    return items.length === 1 && this.selection().length === 1 ? items[0] : null;
  });
  readonly singleSpawn = computed(() => {
    const items = this.selectedSpawns();
    return items.length === 1 && this.selection().length === 1 ? items[0] : null;
  });

  setTool(tool: EditorTool): void {
    this.tool.set(tool);
  }

  updateMetadata(values: Partial<Pick<MapEditorDocument, 'name' | 'width' | 'height'>>): void {
    this.commit(document => ({ ...document, ...values }));
  }

  replaceDocument(document: MapEditorDocument, notice = ''): void {
    this.commit(() => cloneDocument(document));
    this.selection.set([]);
    this.tool.set('select');
    this.importNotice.set(notice);
  }

  addObstacle(assetId: EditorObstacle['assetId'], x: number, y: number): EditorObstacle | null {
    const item = CATALOG_BY_ASSET.get(assetId);
    if (!item) return null;
    const document = this.document();
    const obstacle: EditorObstacle = {
      editorId: createId('obstacle'),
      type: item.type,
      assetId: item.assetId,
      x: this.clamp(this.snap(x), item.defaultWidth / 2, document.width - item.defaultWidth / 2),
      y: this.clamp(this.snap(y), item.defaultHeight / 2, document.height - item.defaultHeight / 2),
      width: item.defaultWidth,
      height: item.defaultHeight,
    };
    this.commit(current => ({ ...current, obstacles: [...current.obstacles, obstacle] }));
    this.selection.set([{ kind: 'obstacle', id: obstacle.editorId }]);
    return obstacle;
  }

  addSpawn(x: number, y: number): EditorSpawnPoint {
    const document = this.document();
    const spawn: EditorSpawnPoint = {
      editorId: createId('spawn'),
      x: this.clamp(this.snap(x), 0, document.width),
      y: this.clamp(this.snap(y), 0, document.height),
    };
    this.commit(current => ({ ...current, spawnPoints: [...current.spawnPoints, spawn] }));
    this.selection.set([{ kind: 'spawn', id: spawn.editorId }]);
    return spawn;
  }

  setSelection(selection: EditorSelection[]): void {
    this.selection.set(selection);
  }

  toggleSelection(item: EditorSelection): void {
    const current = this.selection();
    const exists = current.some(entry => entry.kind === item.kind && entry.id === item.id);
    this.selection.set(exists
      ? current.filter(entry => entry.kind !== item.kind || entry.id !== item.id)
      : [...current, item]);
  }

  clearSelection(): void {
    this.selection.set([]);
  }

  beginTransaction(): void {
    if (!this.transactionStart) this.transactionStart = cloneDocument(this.document());
  }

  finishTransaction(): void {
    if (!this.transactionStart) return;
    const before = this.transactionStart;
    this.transactionStart = null;
    if (JSON.stringify(before) !== JSON.stringify(this.document())) {
      this.pushHistory(before);
    }
  }

  cancelTransaction(): void {
    if (!this.transactionStart) return;
    this.document.set(this.transactionStart);
    this.transactionStart = null;
  }

  moveSelection(dx: number, dy: number, snap = false): void {
    const selection = this.selection();
    if (!selection.length) return;
    const obstacleIds = new Set(selection.filter(item => item.kind === 'obstacle').map(item => item.id));
    const spawnIds = new Set(selection.filter(item => item.kind === 'spawn').map(item => item.id));
    this.mutateWithoutHistory(document => ({
      ...document,
      obstacles: document.obstacles.map(item => obstacleIds.has(item.editorId)
        ? { ...item, x: snap ? this.snap(item.x + dx) : item.x + dx, y: snap ? this.snap(item.y + dy) : item.y + dy }
        : item),
      spawnPoints: document.spawnPoints.map(item => spawnIds.has(item.editorId)
        ? { ...item, x: snap ? this.snap(item.x + dx) : item.x + dx, y: snap ? this.snap(item.y + dy) : item.y + dy }
        : item),
    }));
  }

  moveEntitiesFrom(
    obstacles: Array<{ id: string; x: number; y: number }>,
    spawnPoints: Array<{ id: string; x: number; y: number }>,
    dx: number,
    dy: number,
    snap = false,
  ): void {
    const obstacleOrigins = new Map(obstacles.map(item => [item.id, item]));
    const spawnOrigins = new Map(spawnPoints.map(item => [item.id, item]));
    this.mutateWithoutHistory(document => ({
      ...document,
      obstacles: document.obstacles.map(item => {
        const origin = obstacleOrigins.get(item.editorId);
        if (!origin) return item;
        return {
          ...item,
          x: snap ? this.snap(origin.x + dx) : origin.x + dx,
          y: snap ? this.snap(origin.y + dy) : origin.y + dy,
        };
      }),
      spawnPoints: document.spawnPoints.map(item => {
        const origin = spawnOrigins.get(item.editorId);
        if (!origin) return item;
        return {
          ...item,
          x: snap ? this.snap(origin.x + dx) : origin.x + dx,
          y: snap ? this.snap(origin.y + dy) : origin.y + dy,
        };
      }),
    }));
  }

  setObstacleRect(id: string, patch: Partial<Pick<EditorObstacle, 'x' | 'y' | 'width' | 'height'>>, withHistory = true): void {
    const update = (document: MapEditorDocument): MapEditorDocument => ({
      ...document,
      obstacles: document.obstacles.map(item => item.editorId === id ? { ...item, ...patch } : item),
    });
    if (withHistory) this.commit(update); else this.mutateWithoutHistory(update);
  }

  setSpawnPosition(id: string, x: number, y: number, withHistory = true): void {
    const update = (document: MapEditorDocument): MapEditorDocument => ({
      ...document,
      spawnPoints: document.spawnPoints.map(item => item.editorId === id ? { ...item, x, y } : item),
    });
    if (withHistory) this.commit(update); else this.mutateWithoutHistory(update);
  }

  deleteSelection(): void {
    const selection = this.selection();
    if (!selection.length) return;
    const obstacleIds = new Set(selection.filter(item => item.kind === 'obstacle').map(item => item.id));
    const spawnIds = new Set(selection.filter(item => item.kind === 'spawn').map(item => item.id));
    this.commit(document => ({
      ...document,
      obstacles: document.obstacles.filter(item => !obstacleIds.has(item.editorId)),
      spawnPoints: document.spawnPoints.filter(item => !spawnIds.has(item.editorId)),
    }));
    this.selection.set([]);
  }

  duplicateSelection(): void {
    const selected = this.selection();
    if (!selected.length) return;
    const obstacleIds = new Set(selected.filter(item => item.kind === 'obstacle').map(item => item.id));
    const spawnIds = new Set(selected.filter(item => item.kind === 'spawn').map(item => item.id));
    const offset = this.gridSize();
    const newSelection: EditorSelection[] = [];
    this.commit(document => {
      const obstacles = document.obstacles
        .filter(item => obstacleIds.has(item.editorId))
        .map(item => {
          const copy = { ...item, editorId: createId('obstacle'), x: item.x + offset, y: item.y + offset };
          newSelection.push({ kind: 'obstacle', id: copy.editorId });
          return copy;
        });
      const spawnPoints = document.spawnPoints
        .filter(item => spawnIds.has(item.editorId))
        .map(item => {
          const copy = { ...item, editorId: createId('spawn'), x: item.x + offset, y: item.y + offset };
          newSelection.push({ kind: 'spawn', id: copy.editorId });
          return copy;
        });
      return {
        ...document,
        obstacles: [...document.obstacles, ...obstacles],
        spawnPoints: [...document.spawnPoints, ...spawnPoints],
      };
    });
    this.selection.set(newSelection);
  }

  reorderSpawn(id: string, direction: -1 | 1): void {
    this.commit(document => {
      const index = document.spawnPoints.findIndex(item => item.editorId === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= document.spawnPoints.length) return document;
      const spawnPoints = [...document.spawnPoints];
      [spawnPoints[index], spawnPoints[target]] = [spawnPoints[target], spawnPoints[index]];
      return { ...document, spawnPoints };
    });
  }

  undo(): void {
    const past = this.past();
    const previous = past[past.length - 1];
    if (!previous) return;
    this.future.update(items => [cloneDocument(this.document()), ...items].slice(0, HISTORY_LIMIT));
    this.document.set(cloneDocument(previous));
    this.past.set(past.slice(0, -1));
    this.selection.set([]);
  }

  redo(): void {
    const [next, ...rest] = this.future();
    if (!next) return;
    this.past.update(items => [...items, cloneDocument(this.document())].slice(-HISTORY_LIMIT));
    this.document.set(cloneDocument(next));
    this.future.set(rest);
    this.selection.set([]);
  }

  snap(value: number): number {
    if (!this.snapEnabled()) return Math.round(value);
    const size = this.gridSize();
    return Math.round(value / size) * size;
  }

  private commit(update: (document: MapEditorDocument) => MapEditorDocument): void {
    const before = cloneDocument(this.document());
    const after = update(cloneDocument(before));
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.pushHistory(before);
    this.document.set(after);
  }

  private mutateWithoutHistory(update: (document: MapEditorDocument) => MapEditorDocument): void {
    this.document.update(document => update(cloneDocument(document)));
  }

  private pushHistory(document: MapEditorDocument): void {
    this.past.update(items => [...items, cloneDocument(document)].slice(-HISTORY_LIMIT));
    this.future.set([]);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
