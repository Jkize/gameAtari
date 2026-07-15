import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { MatchStartRedirectService } from './network/match-start-redirect.service';
import { QueueCountdownButtonComponent } from './network/queue-countdown-button.component';
import { QueueStatusService } from './network/queue-status.service';
import { ThemeService } from './shared/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslocoPipe, QueueCountdownButtonComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly theme = inject(ThemeService);
  private readonly swUpdate = inject(SwUpdate);
  private readonly matchStartRedirect = inject(MatchStartRedirectService);
  private readonly queueStatus = inject(QueueStatusService);

  protected readonly updateReady = signal(false);

  constructor() {
    this.matchStartRedirect.start();
    this.queueStatus.start();
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
