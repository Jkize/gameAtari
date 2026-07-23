import {
  Component,
  HostBinding,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  signal,
} from '@angular/core';
import { TANK_TEMPLATE_PATHS, TANK_TRACK_TEMPLATE_PATHS } from '@game/assets/game-assets';
import {
  TankCustomization,
  TankPartColors,
  tankColorHexToNumber,
} from '@game/contracts/tank-customization.types';
import { applyTankColor, applyTrackColor } from '@game/rendering/textures/svg-texture-utils';
import {
  DEFAULT_TURRET_ROTATION_DEG,
  nearestEquivalentAngle,
  turretRotationForPoint,
} from './tank-preview-geometry';

type TankPart = keyof TankPartColors;

interface PreviewTemplates {
  body: string;
  turret: string;
  tracks: string;
}

interface PreviewUrls {
  body: string;
  turret: string;
  tracks: string;
}

let templatePromise: Promise<PreviewTemplates> | null = null;

@Component({
  selector: 'app-tank-appearance-preview',
  standalone: true,
  templateUrl: './tank-appearance-preview.component.html',
  styleUrl: './tank-appearance-preview.component.css',
})
export class TankAppearancePreviewComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) customization!: TankCustomization;
  @Input() selectedPart: TankPart | null = null;
  @Input() interactive = false;

  readonly urls = signal<PreviewUrls | null>(null);
  readonly turretRotation = signal(DEFAULT_TURRET_ROTATION_DEG);

  private destroyed = false;
  private renderVersion = 0;
  private activePointerId: number | null = null;

  @HostBinding('class.tank-preview--interactive')
  get interactiveClass(): boolean {
    return this.interactive;
  }

  ngOnChanges(): void {
    void this.render();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revoke(this.urls());
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (!this.interactive) return;
    this.activePointerId = event.pointerId;
    try {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events and older touch engines may not expose an active pointer.
    }
    event.preventDefault();
    this.updateTurretRotation(event);
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.interactive) return;
    if (event.pointerType !== 'mouse' && this.activePointerId !== event.pointerId) return;
    this.updateTurretRotation(event);
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  onPointerEnd(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  @HostListener('pointerleave')
  onPointerLeave(): void {
    if (!this.interactive || this.activePointerId !== null) return;
    this.turretRotation.update((current) =>
      nearestEquivalentAngle(DEFAULT_TURRET_ROTATION_DEG, current),
    );
  }

  private async render(): Promise<void> {
    const version = ++this.renderVersion;
    try {
      const templates = await this.templates();
      if (this.destroyed || version !== this.renderVersion) return;
      const colors = this.customization.colors;
      const next: PreviewUrls = {
        body: this.svgUrl(applyTankColor(templates.body, tankColorHexToNumber(colors.body))),
        turret: this.svgUrl(applyTankColor(templates.turret, tankColorHexToNumber(colors.turret))),
        tracks: this.svgUrl(applyTrackColor(templates.tracks, tankColorHexToNumber(colors.tracks))),
      };
      const previous = this.urls();
      this.urls.set(next);
      this.revoke(previous);
    } catch {
      // Parent surfaces keep their loading treatment if a public template is unavailable.
    }
  }

  private templates(): Promise<PreviewTemplates> {
    templatePromise ??= Promise.all([
      this.fetchTemplate(TANK_TEMPLATE_PATHS.body),
      this.fetchTemplate(TANK_TEMPLATE_PATHS.turret),
      this.fetchTemplate(TANK_TRACK_TEMPLATE_PATHS.normal0),
    ]).then(([body, turret, tracks]) => ({ body, turret, tracks }));
    return templatePromise;
  }

  private async fetchTemplate(path: string): Promise<string> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load tank template: ${path}`);
    return response.text();
  }

  private svgUrl(svg: string): string {
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }

  private updateTurretRotation(event: PointerEvent): void {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const target = turretRotationForPoint(
      event.clientX,
      event.clientY,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    this.turretRotation.update((current) => nearestEquivalentAngle(target, current));
  }

  private revoke(urls: PreviewUrls | null): void {
    if (!urls) return;
    Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }
}
