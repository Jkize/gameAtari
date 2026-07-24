import { Component, HostListener, Input, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  TankColorHex,
  TankCustomization,
  TANK_COLOR_PRESETS,
  cloneTankCustomization,
  isTankColorHex,
  tankCustomizationsEqual,
  tankColorHexToNumber,
} from '@game/contracts/tank-customization.types';
import {
  QueueCountdownButtonComponent,
  QueueLobbyNavigationRequest,
} from '@features/matchmaking/queue-countdown-button/queue-countdown-button.component';
import { TankAppearancePreviewComponent } from './tank-appearance-preview/tank-appearance-preview.component';
import { TankCustomizationStore } from './tank-customization.store';

type ColorPart = 'hull' | 'turret' | 'trackTreadShadow';

interface PartOption {
  id: ColorPart;
  icon: string;
}

const MODAL_HISTORY_STATE_KEY = 'tankCustomizationEditor';

@Component({
  selector: 'app-tank-customization',
  standalone: true,
  imports: [TranslocoPipe, TankAppearancePreviewComponent, QueueCountdownButtonComponent],
  templateUrl: './tank-customization.component.html',
  styleUrls: [
    './tank-customization.component.css',
    './tank-customization.portrait.css',
  ],
})
export class TankCustomizationComponent {
  @Input() showLauncher = true;

  readonly store = inject(TankCustomizationStore);
  readonly editorOpen = signal(false);
  readonly activePart = signal<ColorPart>('hull');
  readonly draft = signal<TankCustomization>(this.copy(this.store.current()));
  readonly savedSnapshot = signal<TankCustomization>(this.copy(this.store.current()));
  readonly discardConfirmationOpen = signal(false);
  readonly isDirty = computed(
    () => !tankCustomizationsEqual(this.draft(), this.savedSnapshot()),
  );
  readonly selectedColor = computed(() => this.colorForPart(this.draft(), this.activePart()));
  readonly selectedRgb = computed(() => {
    const color = tankColorHexToNumber(this.selectedColor());
    return {
      red: (color >> 16) & 0xff,
      green: (color >> 8) & 0xff,
      blue: color & 0xff,
    };
  });

  readonly partOptions: readonly PartOption[] = [
    { id: 'hull', icon: 'ti-car-4wd' },
    { id: 'turret', icon: 'ti-focus-centered' },
    { id: 'trackTreadShadow', icon: 'ti-track' },
  ];

  readonly presets = TANK_COLOR_PRESETS;
  private modalHistoryEntryActive = false;
  private pendingNavigation: (() => void) | null = null;
  private pendingCloseIsNavigation = false;

  openEditor(): void {
    if (this.editorOpen()) return;
    const saved = this.copy(this.store.current());
    this.savedSnapshot.set(saved);
    this.draft.set(this.copy(saved));
    this.discardConfirmationOpen.set(false);
    this.activePart.set('hull');
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
    this.requestClose();
  }

  closeEditorForNavigation(request?: QueueLobbyNavigationRequest): void {
    if (!this.editorOpen()) return;
    this.requestClose(request?.proceed, true);
  }

  async save(): Promise<void> {
    if (!await this.store.save(this.draft())) return;
    this.editorOpen.set(false);
    this.removeModalHistoryEntry();
  }

  reset(): void {
    this.draft.set(this.copy(this.savedSnapshot()));
  }

  continueEditing(): void {
    this.discardConfirmationOpen.set(false);
    this.clearPendingClose();
  }

  discardChanges(): void {
    this.draft.set(this.copy(this.savedSnapshot()));
    this.discardConfirmationOpen.set(false);
    const navigation = this.pendingNavigation;
    const isNavigation = this.pendingCloseIsNavigation;
    this.clearPendingClose();
    this.finishClose(navigation, isNavigation);
  }

  updateColor(part: ColorPart, value: string): void {
    if (!isTankColorHex(value)) return;
    const color = value.toLowerCase() as TankColorHex;
    this.draft.update((current) => {
      const next = cloneTankCustomization(current);
      if (part === 'hull') next.paint.hull.base = color;
      else if (part === 'turret') next.paint.turret.base = color;
      else next.paint.tracks.treadShadow = color;
      return next;
    });
  }

  colorForPart(customization: TankCustomization, part: ColorPart): TankColorHex {
    if (part === 'hull') return customization.paint.hull.base;
    if (part === 'turret') return customization.paint.turret.base;
    return customization.paint.tracks.treadShadow;
  }

  selectPart(part: ColorPart): void {
    this.activePart.set(part);
  }

  updateSelectedColor(value: string): void {
    this.updateColor(this.activePart(), value);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.discardConfirmationOpen()) {
      this.continueEditing();
      return;
    }
    if (this.editorOpen()) this.closeEditor();
  }

  @HostListener('window:popstate')
  onBrowserBack(): void {
    if (!this.editorOpen() || !this.modalHistoryEntryActive) return;
    if (this.isDirty()) {
      this.restoreModalHistoryEntry();
      this.requestClose();
      return;
    }
    this.modalHistoryEntryActive = false;
    this.dismissEditor();
  }

  private dismissEditor(): void {
    this.draft.set(this.copy(this.savedSnapshot()));
    this.discardConfirmationOpen.set(false);
    this.clearPendingClose();
    this.editorOpen.set(false);
  }

  private requestClose(
    navigation: (() => void) | null = null,
    isNavigation = false,
  ): void {
    if (this.isDirty()) {
      this.pendingNavigation = navigation;
      this.pendingCloseIsNavigation = isNavigation;
      this.discardConfirmationOpen.set(true);
      return;
    }
    this.finishClose(navigation, isNavigation);
  }

  private finishClose(
    navigation: (() => void) | null,
    isNavigation: boolean,
  ): void {
    if (isNavigation) {
      this.modalHistoryEntryActive = false;
      this.dismissEditor();
      navigation?.();
      return;
    }
    this.dismissEditor();
    this.removeModalHistoryEntry();
  }

  private clearPendingClose(): void {
    this.pendingNavigation = null;
    this.pendingCloseIsNavigation = false;
  }

  private restoreModalHistoryEntry(): void {
    const currentState = window.history.state;
    const modalState = currentState && typeof currentState === 'object'
      ? { ...currentState, [MODAL_HISTORY_STATE_KEY]: true }
      : { [MODAL_HISTORY_STATE_KEY]: true };
    window.history.pushState(modalState, '', window.location.href);
    this.modalHistoryEntryActive = true;
  }

  private removeModalHistoryEntry(): void {
    if (!this.modalHistoryEntryActive) return;
    this.modalHistoryEntryActive = false;
    window.history.back();
  }

  private copy(customization: TankCustomization): TankCustomization {
    return cloneTankCustomization(customization);
  }
}
