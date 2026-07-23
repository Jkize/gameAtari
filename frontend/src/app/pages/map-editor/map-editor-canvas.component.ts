import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CATALOG_BY_ASSET } from './obstacle-catalog';
import { EditorObstacle, EditorSelection } from './map-editor.models';
import { MapEditorStore } from './map-editor.store';
import { drawMirrorPanel, MirrorPanelSurface } from '@game/rendering/textures/mirror-panel-renderer';

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type Interaction =
  | { mode: 'pan'; screenX: number; screenY: number; offsetX: number; offsetY: number }
  | {
      mode: 'move';
      startX: number;
      startY: number;
      obstacles: Array<{ id: string; x: number; y: number }>;
      spawnPoints: Array<{ id: string; x: number; y: number }>;
    }
  | { mode: 'box'; startX: number; startY: number; currentX: number; currentY: number; additive: boolean }
  | { mode: 'resize'; handle: ResizeHandle; original: EditorObstacle; startX: number; startY: number }
  | null;

@Component({
  selector: 'app-map-editor-canvas',
  standalone: true,
  template: '<canvas #canvas aria-label="Custom map editing canvas"></canvas>',
  styles: [`
    :host { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; }
    canvas { width: 100%; height: 100%; display: block; outline: none; cursor: crosshair; }
  `],
})
export class MapEditorCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) private canvasRef!: ElementRef<HTMLCanvasElement>;

  private context?: CanvasRenderingContext2D;
  private resizeObserver?: ResizeObserver;
  private interaction: Interaction = null;
  private hoverDoc?: { x: number; y: number };
  private spacePressed = false;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly redrawEffect = effect(() => {
    this.store.document();
    this.store.selection();
    this.store.tool();
    this.store.gridSize();
    this.store.gridVisible();
    this.store.viewport();
    this.draw();
  });

  constructor(readonly store: MapEditorStore) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.context = canvas.getContext('2d') ?? undefined;
    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerUp);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventContext);
    canvas.addEventListener('keydown', this.keyDown);
    canvas.addEventListener('keyup', this.keyUp);
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      if (!this.store.viewport().offsetX && !this.store.viewport().offsetY) this.fitMap();
    });
    this.resizeObserver.observe(canvas);
    this.resizeCanvas();
    requestAnimationFrame(() => this.fitMap());
  }

  ngOnDestroy(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('pointerdown', this.pointerDown);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointercancel', this.pointerUp);
    canvas.removeEventListener('wheel', this.wheel);
    canvas.removeEventListener('contextmenu', this.preventContext);
    canvas.removeEventListener('keydown', this.keyDown);
    canvas.removeEventListener('keyup', this.keyUp);
    this.resizeObserver?.disconnect();
    this.redrawEffect.destroy();
  }

  fitMap(): void {
    const canvas = this.canvasRef.nativeElement;
    const document = this.store.document();
    const margin = 64;
    const zoom = Math.max(0.1, Math.min(4, Math.min(
      (canvas.clientWidth - margin * 2) / document.width,
      (canvas.clientHeight - margin * 2) / document.height,
    )));
    this.store.viewport.set({
      zoom,
      offsetX: (canvas.clientWidth - document.width * zoom) / 2,
      offsetY: (canvas.clientHeight - document.height * zoom) / 2,
    });
  }

  setZoom(zoom: number): void {
    const canvas = this.canvasRef.nativeElement;
    this.zoomAt(zoom, canvas.clientWidth / 2, canvas.clientHeight / 2);
  }

  resetView(): void {
    this.store.viewport.set({ zoom: 1, offsetX: 40, offsetY: 40 });
  }

  focusSelection(): void {
    const selection = this.store.selection()[0];
    if (!selection) return;
    const document = this.store.document();
    const entity = selection.kind === 'obstacle'
      ? document.obstacles.find(item => item.editorId === selection.id)
      : document.spawnPoints.find(item => item.editorId === selection.id);
    if (!entity) return;
    const canvas = this.canvasRef.nativeElement;
    const viewport = this.store.viewport();
    this.store.viewport.set({
      ...viewport,
      offsetX: canvas.clientWidth / 2 - entity.x * viewport.zoom,
      offsetY: canvas.clientHeight / 2 - entity.y * viewport.zoom,
    });
    canvas.focus();
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    const canvas = this.canvasRef.nativeElement;
    canvas.focus();
    canvas.setPointerCapture(event.pointerId);
    const screen = this.eventPoint(event);
    const doc = this.toDocument(screen.x, screen.y);
    this.hoverDoc = doc;

    if (event.button === 1 || this.spacePressed) {
      const viewport = this.store.viewport();
      this.interaction = { mode: 'pan', screenX: screen.x, screenY: screen.y, offsetX: viewport.offsetX, offsetY: viewport.offsetY };
      return;
    }
    if (event.button === 2) {
      this.store.setTool('select');
      return;
    }
    if (event.button !== 0) return;

    const tool = this.store.tool();
    if (tool === 'spawn') {
      this.store.addSpawn(doc.x, doc.y);
      this.store.setTool('select');
      return;
    }
    if (tool !== 'select') {
      this.store.addObstacle(tool, doc.x, doc.y);
      this.store.setTool('select');
      return;
    }

    const handle = this.hitResizeHandle(screen.x, screen.y);
    const obstacle = this.store.singleObstacle();
    if (handle && obstacle) {
      this.store.beginTransaction();
      this.interaction = { mode: 'resize', handle, original: { ...obstacle }, startX: doc.x, startY: doc.y };
      return;
    }

    const hit = this.hitEntity(doc.x, doc.y);
    if (hit) {
      if (event.shiftKey) this.store.toggleSelection(hit);
      else if (!this.isSelected(hit)) this.store.setSelection([hit]);
      const selectedObstacleIds = new Set(
        this.store.selection().filter(item => item.kind === 'obstacle').map(item => item.id),
      );
      const selectedSpawnIds = new Set(
        this.store.selection().filter(item => item.kind === 'spawn').map(item => item.id),
      );
      const document = this.store.document();
      this.store.beginTransaction();
      this.interaction = {
        mode: 'move',
        startX: doc.x,
        startY: doc.y,
        obstacles: document.obstacles
          .filter(item => selectedObstacleIds.has(item.editorId))
          .map(item => ({ id: item.editorId, x: item.x, y: item.y })),
        spawnPoints: document.spawnPoints
          .filter(item => selectedSpawnIds.has(item.editorId))
          .map(item => ({ id: item.editorId, x: item.x, y: item.y })),
      };
      return;
    }

    if (!event.shiftKey) this.store.clearSelection();
    this.interaction = { mode: 'box', startX: doc.x, startY: doc.y, currentX: doc.x, currentY: doc.y, additive: event.shiftKey };
    this.draw();
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    const screen = this.eventPoint(event);
    const doc = this.toDocument(screen.x, screen.y);
    this.hoverDoc = doc;
    if (!this.interaction) {
      this.draw();
      return;
    }
    if (this.interaction.mode === 'pan') {
      this.store.viewport.set({
        ...this.store.viewport(),
        offsetX: this.interaction.offsetX + screen.x - this.interaction.screenX,
        offsetY: this.interaction.offsetY + screen.y - this.interaction.screenY,
      });
      return;
    }
    if (this.interaction.mode === 'move') {
      const dx = doc.x - this.interaction.startX;
      const dy = doc.y - this.interaction.startY;
      this.store.moveEntitiesFrom(
        this.interaction.obstacles,
        this.interaction.spawnPoints,
        dx,
        dy,
        this.store.snapEnabled() && !event.altKey,
      );
      return;
    }
    if (this.interaction.mode === 'box') {
      this.interaction.currentX = doc.x;
      this.interaction.currentY = doc.y;
      this.draw();
      return;
    }
    this.resizeObstacle(this.interaction, doc.x, doc.y, event.shiftKey, event.altKey);
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (this.interaction?.mode === 'move' || this.interaction?.mode === 'resize') {
      this.store.finishTransaction();
    } else if (this.interaction?.mode === 'box') {
      this.selectBox(this.interaction);
    }
    this.interaction = null;
    try {
      this.canvasRef.nativeElement.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be released by the browser.
    }
    this.draw();
  };

  private readonly wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const screen = this.eventPoint(event);
    this.zoomAt(this.store.viewport().zoom * (event.deltaY < 0 ? 1.12 : 0.89), screen.x, screen.y);
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.spacePressed = true;
      event.preventDefault();
    }
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') this.spacePressed = false;
  };

  private readonly preventContext = (event: Event): void => event.preventDefault();

  private resizeObstacle(interaction: Extract<Interaction, { mode: 'resize' }>, x: number, y: number, keepRatio: boolean, disableSnap: boolean): void {
    const original = interaction.original;
    let left = original.x - original.width / 2;
    let right = original.x + original.width / 2;
    let top = original.y - original.height / 2;
    let bottom = original.y + original.height / 2;
    const snappedX = this.store.snapEnabled() && !disableSnap ? this.store.snap(x) : x;
    const snappedY = this.store.snapEnabled() && !disableSnap ? this.store.snap(y) : y;
    if (interaction.handle.includes('w')) left = snappedX;
    if (interaction.handle.includes('e')) right = snappedX;
    if (interaction.handle.includes('n')) top = snappedY;
    if (interaction.handle.includes('s')) bottom = snappedY;
    if (interaction.handle === 'n') top = snappedY;
    if (interaction.handle === 's') bottom = snappedY;
    if (interaction.handle === 'w') left = snappedX;
    if (interaction.handle === 'e') right = snappedX;

    const catalog = CATALOG_BY_ASSET.get(original.assetId);
    const minWidth = catalog?.minWidth ?? 8;
    const minHeight = catalog?.minHeight ?? 8;
    if (right - left < minWidth) {
      if (interaction.handle.includes('w') || interaction.handle === 'w') left = right - minWidth;
      else right = left + minWidth;
    }
    if (bottom - top < minHeight) {
      if (interaction.handle.includes('n') || interaction.handle === 'n') top = bottom - minHeight;
      else bottom = top + minHeight;
    }
    if (keepRatio && !['n', 's', 'e', 'w'].includes(interaction.handle)) {
      const ratio = original.width / original.height;
      const width = right - left;
      const height = bottom - top;
      if (width / height > ratio) {
        const targetHeight = width / ratio;
        if (interaction.handle.includes('n')) top = bottom - targetHeight; else bottom = top + targetHeight;
      } else {
        const targetWidth = height * ratio;
        if (interaction.handle.includes('w')) left = right - targetWidth; else right = left + targetWidth;
      }
    }
    this.store.setObstacleRect(original.editorId, {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      width: right - left,
      height: bottom - top,
    }, false);
  }

  private selectBox(box: Extract<Interaction, { mode: 'box' }>): void {
    const left = Math.min(box.startX, box.currentX);
    const right = Math.max(box.startX, box.currentX);
    const top = Math.min(box.startY, box.currentY);
    const bottom = Math.max(box.startY, box.currentY);
    const document = this.store.document();
    const found: EditorSelection[] = [
      ...document.obstacles
        .filter(item => item.x + item.width / 2 >= left && item.x - item.width / 2 <= right &&
          item.y + item.height / 2 >= top && item.y - item.height / 2 <= bottom)
        .map(item => ({ kind: 'obstacle' as const, id: item.editorId })),
      ...document.spawnPoints
        .filter(item => item.x >= left && item.x <= right && item.y >= top && item.y <= bottom)
        .map(item => ({ kind: 'spawn' as const, id: item.editorId })),
    ];
    this.store.setSelection(box.additive ? [...this.store.selection(), ...found.filter(item => !this.isSelected(item))] : found);
  }

  private hitEntity(x: number, y: number): EditorSelection | null {
    const document = this.store.document();
    for (let i = document.spawnPoints.length - 1; i >= 0; i--) {
      const spawn = document.spawnPoints[i];
      if (Math.hypot(x - spawn.x, y - spawn.y) <= 22 / this.store.viewport().zoom) {
        return { kind: 'spawn', id: spawn.editorId };
      }
    }
    for (let i = document.obstacles.length - 1; i >= 0; i--) {
      const obstacle = document.obstacles[i];
      if (x >= obstacle.x - obstacle.width / 2 && x <= obstacle.x + obstacle.width / 2 &&
          y >= obstacle.y - obstacle.height / 2 && y <= obstacle.y + obstacle.height / 2) {
        return { kind: 'obstacle', id: obstacle.editorId };
      }
    }
    return null;
  }

  private hitResizeHandle(screenX: number, screenY: number): ResizeHandle | null {
    const obstacle = this.store.singleObstacle();
    if (!obstacle) return null;
    const handles = this.resizeHandles(obstacle);
    for (const [handle, point] of Object.entries(handles) as Array<[ResizeHandle, { x: number; y: number }]>) {
      if (Math.abs(screenX - point.x) <= 7 && Math.abs(screenY - point.y) <= 7) return handle;
    }
    return null;
  }

  private isSelected(selection: EditorSelection): boolean {
    return this.store.selection().some(item => item.kind === selection.kind && item.id === selection.id);
  }

  private zoomAt(nextZoom: number, screenX: number, screenY: number): void {
    const viewport = this.store.viewport();
    const zoom = Math.max(0.1, Math.min(4, nextZoom));
    const docX = (screenX - viewport.offsetX) / viewport.zoom;
    const docY = (screenY - viewport.offsetY) / viewport.zoom;
    this.store.viewport.set({
      zoom,
      offsetX: screenX - docX * zoom,
      offsetY: screenY - docY * zoom,
    });
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    this.draw();
  }

  private draw(): void {
    const canvas = this.canvasRef?.nativeElement;
    const context = this.context;
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#130f0a';
    context.fillRect(0, 0, width, height);

    const viewport = this.store.viewport();
    const document = this.store.document();
    context.save();
    context.translate(viewport.offsetX, viewport.offsetY);
    context.scale(viewport.zoom, viewport.zoom);
    context.fillStyle = '#8f6940';
    context.shadowColor = 'rgba(0,0,0,.7)';
    context.shadowBlur = 30 / viewport.zoom;
    context.fillRect(0, 0, document.width, document.height);
    context.shadowBlur = 0;
    if (this.store.gridVisible()) this.drawGrid(context, document.width, document.height);

    const decorations = document.obstacles.filter(item => item.type === 'decoration');
    const structures = document.obstacles.filter(item => item.type !== 'decoration');
    decorations.forEach(item => this.drawObstacle(context, item));
    structures.forEach(item => this.drawObstacle(context, item));
    document.spawnPoints.forEach((spawn, index) => this.drawSpawn(context, spawn.x, spawn.y, index + 1, spawn.editorId));
    context.lineWidth = 3 / viewport.zoom;
    context.strokeStyle = '#e0b978';
    context.strokeRect(0, 0, document.width, document.height);
    context.restore();

    if (this.interaction?.mode === 'box') {
      const start = this.toScreen(this.interaction.startX, this.interaction.startY);
      const end = this.toScreen(this.interaction.currentX, this.interaction.currentY);
      context.fillStyle = 'rgba(69, 220, 255, .12)';
      context.strokeStyle = '#45dcff';
      context.lineWidth = 1;
      context.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    }
    this.drawPlacementPreview(context);
    this.drawSelectionOverlay(context);
  }

  private drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
    const size = this.store.gridSize();
    const zoom = this.store.viewport().zoom;
    context.lineWidth = 1 / zoom;
    for (let x = 0; x <= width; x += size) {
      context.strokeStyle = x % (size * 4) === 0 ? 'rgba(74,44,23,.46)' : 'rgba(74,44,23,.18)';
      context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
    }
    for (let y = 0; y <= height; y += size) {
      context.strokeStyle = y % (size * 4) === 0 ? 'rgba(74,44,23,.46)' : 'rgba(74,44,23,.18)';
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
  }

  private drawObstacle(context: CanvasRenderingContext2D, obstacle: EditorObstacle): void {
    if (obstacle.type === 'mirror') {
      this.drawMirrorObstacle(context, obstacle);
      return;
    }

    const catalog = CATALOG_BY_ASSET.get(obstacle.assetId);
    const image = catalog ? this.getImage(catalog.previewPath) : undefined;
    context.save();
    context.globalAlpha = obstacle.type === 'decoration' ? 0.9 : 1;
    if (image?.complete && image.naturalWidth) {
      context.drawImage(image, obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2, obstacle.width, obstacle.height);
    } else {
      const colors: Record<string, string> = {
        bush: '#315b26', decoration: '#5e7631', wood: '#673815',
        rock: '#56535a', steel: '#27364e', mirror: '#00a8c6',
      };
      context.fillStyle = colors[obstacle.type] ?? '#555';
      context.fillRect(obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2, obstacle.width, obstacle.height);
    }
    context.restore();
  }

  private drawMirrorObstacle(context: CanvasRenderingContext2D, obstacle: EditorObstacle): void {
    context.save();
    const surface: MirrorPanelSurface = {
      fillRect: (x, y, width, height, color, alpha) => {
        context.fillStyle = this.rgba(color, alpha);
        context.fillRect(x, y, width, height);
      },
      fillRoundedRect: (x, y, width, height, radius, color, alpha) => {
        context.fillStyle = this.rgba(color, alpha);
        this.roundedRectPath(context, x, y, width, height, radius);
        context.fill();
      },
      strokeLine: (x1, y1, x2, y2, width, color, alpha) => {
        context.strokeStyle = this.rgba(color, alpha);
        context.lineWidth = width;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
      },
      strokeRoundedRect: (x, y, width, height, radius, lineWidth, color, alpha) => {
        context.strokeStyle = this.rgba(color, alpha);
        context.lineWidth = lineWidth;
        this.roundedRectPath(context, x, y, width, height, radius);
        context.stroke();
      },
      fillCircle: (x, y, radius, color, alpha) => {
        context.fillStyle = this.rgba(color, alpha);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      },
    };

    drawMirrorPanel(surface, {
      id: obstacle.editorId,
      x: obstacle.x,
      y: obstacle.y,
      width: obstacle.width,
      height: obstacle.height,
    });
    context.restore();
  }

  private drawSpawn(context: CanvasRenderingContext2D, x: number, y: number, index: number, id: string): void {
    const zoom = this.store.viewport().zoom;
    context.save();
    context.strokeStyle = this.isSelected({ kind: 'spawn', id }) ? '#ffffff' : '#39ff9a';
    context.fillStyle = 'rgba(10, 56, 36, .75)';
    context.lineWidth = 2 / zoom;
    context.beginPath(); context.arc(x, y, 28, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = '#dffff0';
    context.font = `${Math.max(12, 15 / zoom)}px monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(index), x, y);
    context.restore();
  }

  private drawSelectionOverlay(context: CanvasRenderingContext2D): void {
    const viewport = this.store.viewport();
    const document = this.store.document();
    context.save();
    context.strokeStyle = '#45dcff';
    context.lineWidth = 2;
    context.setLineDash([6, 4]);
    this.store.selection().forEach(selection => {
      if (selection.kind === 'obstacle') {
        const obstacle = document.obstacles.find(item => item.editorId === selection.id);
        if (!obstacle) return;
        const topLeft = this.toScreen(obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2);
        context.strokeRect(topLeft.x, topLeft.y, obstacle.width * viewport.zoom, obstacle.height * viewport.zoom);
      }
    });
    context.setLineDash([]);
    const obstacle = this.store.singleObstacle();
    if (obstacle) {
      Object.values(this.resizeHandles(obstacle)).forEach(point => {
        context.fillStyle = '#f7d28d';
        context.strokeStyle = '#15222b';
        context.fillRect(point.x - 5, point.y - 5, 10, 10);
        context.strokeRect(point.x - 5, point.y - 5, 10, 10);
      });
    }
    context.restore();
  }

  private drawPlacementPreview(context: CanvasRenderingContext2D): void {
    const tool = this.store.tool();
    if (!this.hoverDoc || this.interaction || tool === 'select') return;
    const point = this.toScreen(
      this.store.snapEnabled() ? this.store.snap(this.hoverDoc.x) : this.hoverDoc.x,
      this.store.snapEnabled() ? this.store.snap(this.hoverDoc.y) : this.hoverDoc.y,
    );
    const zoom = this.store.viewport().zoom;
    context.save();
    context.globalAlpha = 0.55;
    context.strokeStyle = '#ffffff';
    context.setLineDash([5, 4]);
    if (tool === 'spawn') {
      context.beginPath(); context.arc(point.x, point.y, 28 * zoom, 0, Math.PI * 2); context.stroke();
    } else {
      const catalog = CATALOG_BY_ASSET.get(tool);
      if (catalog) context.strokeRect(
        point.x - catalog.defaultWidth * zoom / 2,
        point.y - catalog.defaultHeight * zoom / 2,
        catalog.defaultWidth * zoom,
        catalog.defaultHeight * zoom,
      );
    }
    context.restore();
  }

  private resizeHandles(obstacle: EditorObstacle): Record<ResizeHandle, { x: number; y: number }> {
    const left = obstacle.x - obstacle.width / 2;
    const right = obstacle.x + obstacle.width / 2;
    const top = obstacle.y - obstacle.height / 2;
    const bottom = obstacle.y + obstacle.height / 2;
    const centerX = obstacle.x;
    const centerY = obstacle.y;
    return {
      nw: this.toScreen(left, top), n: this.toScreen(centerX, top), ne: this.toScreen(right, top),
      e: this.toScreen(right, centerY), se: this.toScreen(right, bottom), s: this.toScreen(centerX, bottom),
      sw: this.toScreen(left, bottom), w: this.toScreen(left, centerY),
    };
  }

  private getImage(path: string): HTMLImageElement {
    let image = this.images.get(path);
    if (!image) {
      image = new Image();
      image.onload = () => this.draw();
      image.src = path;
      this.images.set(path, image);
    }
    return image;
  }

  private roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
    const right = x + width;
    const bottom = y + height;
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(right - r, y);
    context.quadraticCurveTo(right, y, right, y + r);
    context.lineTo(right, bottom - r);
    context.quadraticCurveTo(right, bottom, right - r, bottom);
    context.lineTo(x + r, bottom);
    context.quadraticCurveTo(x, bottom, x, bottom - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  private rgba(color: number, alpha: number): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private eventPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private toDocument(x: number, y: number): { x: number; y: number } {
    const viewport = this.store.viewport();
    return { x: (x - viewport.offsetX) / viewport.zoom, y: (y - viewport.offsetY) / viewport.zoom };
  }

  private toScreen(x: number, y: number): { x: number; y: number } {
    const viewport = this.store.viewport();
    return { x: viewport.offsetX + x * viewport.zoom, y: viewport.offsetY + y * viewport.zoom };
  }
}
