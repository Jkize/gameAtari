import { Component, HostListener, Input, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DEFAULT_TANK_CUSTOMIZATION,
  TankColorHex,
  TankCustomization,
  TankPartColors,
  isTankColorHex,
  tankColorHexToNumber,
} from '@game/contracts/tank-customization.types';
import { TankAppearancePreviewComponent } from './tank-appearance-preview/tank-appearance-preview.component';
import { TankCustomizationStore } from './tank-customization.store';

type ColorPart = keyof TankPartColors;

interface PartOption {
  id: ColorPart;
  icon: string;
}

const MODAL_HISTORY_STATE_KEY = 'tankCustomizationEditor';

@Component({
  selector: 'app-tank-customization',
  standalone: true,
  imports: [TranslocoPipe, TankAppearancePreviewComponent],
  templateUrl: './tank-customization.component.html',
  styleUrl: './tank-customization.component.css',
})
export class TankCustomizationComponent implements OnInit {
  @Input() openOnInit = false;
  @Input() showLauncher = true;

  readonly store = inject(TankCustomizationStore);
  readonly editorOpen = signal(false);
  readonly activePart = signal<ColorPart>('body');
  readonly draft = signal<TankCustomization>(this.copy(this.store.current()));
  readonly selectedColor = computed(() => this.draft().colors[this.activePart()]);
  readonly selectedRgb = computed(() => {
    const color = tankColorHexToNumber(this.selectedColor());
    return {
      red: (color >> 16) & 0xff,
      green: (color >> 8) & 0xff,
      blue: color & 0xff,
    };
  });

  readonly partOptions: readonly PartOption[] = [
    { id: 'body', icon: 'ti-car-4wd' },
    { id: 'turret', icon: 'ti-focus-centered' },
    { id: 'tracks', icon: 'ti-track' },
  ];

  readonly presets: readonly TankColorHex[] = [
    '#db3a2c',
    '#ff8a1f',
    '#f3d33b',
    '#42d97c',
    '#24c7d9',
    '#3478f6',
    '#9b5de5',
    '#e94f9c',
  ];
  private modalHistoryEntryActive = false;

  ngOnInit(): void {
    if (this.openOnInit) this.openEditor();
  }

  openEditor(): void {
    if (this.editorOpen()) return;
    this.draft.set(this.copy(this.store.current()));
    this.activePart.set('body');
    this.editorOpen.set(true);
    const currentState = window.history.state;
    const modalState = currentState && typeof currentState === 'object'
      ? { ...currentState, [MODAL_HISTORY_STATE_KEY]: true }
      : { [MODAL_HISTORY_STATE_KEY]: true };
    window.history.pushState(modalState, '', window.location.href);
    this.modalHistoryEntryActive = true;
  }

  closeEditor(): void {
    if (!this.editorOpen()) return;
    this.dismissEditor();
    this.removeModalHistoryEntry();
  }

  save(): void {
    this.store.save(this.draft());
    this.editorOpen.set(false);
    this.removeModalHistoryEntry();
  }

  reset(): void {
    this.draft.set(this.copy(DEFAULT_TANK_CUSTOMIZATION));
  }

  updateColor(part: ColorPart, value: string): void {
    if (!isTankColorHex(value)) return;
    this.draft.update((current) => ({
      ...current,
      colors: { ...current.colors, [part]: value.toLowerCase() as TankColorHex },
    }));
  }

  selectPart(part: ColorPart): void {
    this.activePart.set(part);
  }

  updateSelectedColor(value: string): void {
    this.updateColor(this.activePart(), value);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.editorOpen()) this.closeEditor();
  }

  @HostListener('window:popstate')
  onBrowserBack(): void {
    if (!this.editorOpen() || !this.modalHistoryEntryActive) return;
    this.modalHistoryEntryActive = false;
    this.dismissEditor();
  }

  private dismissEditor(): void {
    this.draft.set(this.copy(this.store.current()));
    this.editorOpen.set(false);
  }

  private removeModalHistoryEntry(): void {
    if (!this.modalHistoryEntryActive) return;
    this.modalHistoryEntryActive = false;
    window.history.back();
  }

  private copy(customization: TankCustomization): TankCustomization {
    return { ...customization, colors: { ...customization.colors } };
  }
}
