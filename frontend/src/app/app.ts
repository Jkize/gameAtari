import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { ThemeService } from './shared/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslocoPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly theme = inject(ThemeService);
  private readonly swUpdate = inject(SwUpdate);

  protected readonly updateReady = signal(false);

  constructor() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady.set(true));
    }
  }

  protected reloadForUpdate(): void {
    document.location.reload();
  }
}
