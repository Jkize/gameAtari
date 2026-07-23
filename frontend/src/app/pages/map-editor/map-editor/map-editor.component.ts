import {
  Component,
  computed,
  ElementRef,
  HostListener,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MapEditorCanvasComponent } from '../map-editor-canvas.component';
import { MapFileService } from '../map-file.service';
import { MapEditorStore } from '../map-editor.store';
import { AssetCategory, OBSTACLE_CATALOG } from '../obstacle-catalog';
import { EditorObstacle, EditorSpawnPoint, ValidationIssue } from '../map-editor.models';

@Component({
  selector: 'app-map-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, MapEditorCanvasComponent],
  providers: [MapEditorStore],
  templateUrl: './map-editor.component.html',
  styleUrl: './map-editor.component.css',
})
export class MapEditorComponent {
  @ViewChild(MapEditorCanvasComponent) protected canvas?: MapEditorCanvasComponent;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  readonly search = signal('');
  readonly category = signal<'All' | AssetCategory>('All');
  readonly leftOpen = signal(true);
  readonly rightOpen = signal(true);
  readonly helpOpen = signal(false);
  readonly importError = signal('');
  readonly categories: Array<'All' | AssetCategory> = ['All', 'Bushes', 'Decorations', 'Structures'];
  readonly gridSizes = [8, 16, 32, 64];
  readonly filteredCatalog = computed(() => {
    const search = this.search().trim().toLowerCase();
    const category = this.category();
    return OBSTACLE_CATALOG.filter(item =>
      (category === 'All' || item.category === category) &&
      (!search || `${item.name} ${item.assetId}`.toLowerCase().includes(search)));
  });
  readonly issues = computed(() => this.files.validate(this.store.document()));
  readonly errors = computed(() => this.issues().filter(issue => issue.severity === 'error'));
  readonly warnings = computed(() => this.issues().filter(issue => issue.severity === 'warning'));

  constructor(
    readonly store: MapEditorStore,
    private readonly files: MapFileService,
  ) {}

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.store.redo() : this.store.undo();
      return;
    }
    if (typing) return;
    if (command && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.store.duplicateSelection();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.store.deleteSelection();
      return;
    }
    if (event.key === 'Escape') {
      this.store.setTool('select');
      this.store.clearSelection();
      return;
    }
    if (event.key.startsWith('Arrow') && this.store.selection().length) {
      event.preventDefault();
      const amount = event.shiftKey ? this.store.gridSize() : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-amount, 0], ArrowRight: [amount, 0],
        ArrowUp: [0, -amount], ArrowDown: [0, amount],
      };
      const move = moves[event.key];
      if (move) {
        this.store.beginTransaction();
        this.store.moveSelection(move[0], move[1]);
        this.store.finishTransaction();
      }
    }
  }

  changeMetadata(field: 'name' | 'width' | 'height', value: string): void {
    this.store.updateMetadata({ [field]: field === 'name' ? value : Number(value) });
    if (field !== 'name') requestAnimationFrame(() => this.canvas?.fitMap());
  }

  updateObstacle(field: keyof Pick<EditorObstacle, 'x' | 'y' | 'width' | 'height'>, value: string): void {
    const obstacle = this.store.singleObstacle();
    if (obstacle) this.store.setObstacleRect(obstacle.editorId, { [field]: Number(value) });
  }

  updateSpawn(field: keyof Pick<EditorSpawnPoint, 'x' | 'y'>, value: string): void {
    const spawn = this.store.singleSpawn();
    if (!spawn) return;
    this.store.setSpawnPosition(
      spawn.editorId,
      field === 'x' ? Number(value) : spawn.x,
      field === 'y' ? Number(value) : spawn.y,
    );
  }

  chooseCategory(value: string): void {
    this.category.set(value as 'All' | AssetCategory);
  }

  changeGridSize(value: string): void {
    this.store.gridSize.set(Number(value));
  }

  setZoomPercent(value: string): void {
    this.canvas?.setZoom(Number(value) / 100);
  }

  openImport(): void {
    this.fileInput?.nativeElement.click();
  }

  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importError.set('');
    try {
      const parsed = this.files.parse(await file.text());
      this.store.replaceDocument(parsed.document, parsed.notice);
      requestAnimationFrame(() => this.canvas?.fitMap());
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'Unable to import this map.');
    } finally {
      input.value = '';
    }
  }

  download(): void {
    if (this.errors().length) {
      this.rightOpen.set(true);
    }
    this.files.download(this.store.document());
  }

  selectIssue(issue: ValidationIssue): void {
    if (!issue.selection) return;
    this.store.setSelection([issue.selection]);
    this.store.setTool('select');
    requestAnimationFrame(() => this.canvas?.focusSelection());
  }
}
