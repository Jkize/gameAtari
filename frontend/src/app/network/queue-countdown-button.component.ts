import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { QueueStatusService } from './queue-status.service';

@Component({
  selector: 'app-queue-countdown-button',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './queue-countdown-button.component.html',
  styleUrl: './queue-countdown-button.component.css',
})
export class QueueCountdownButtonComponent {
  private readonly router = inject(Router);
  private readonly queueStatus = inject(QueueStatusService);
  private readonly currentUrl = signal(this.router.url);

  protected readonly room = this.queueStatus.countdownRoom;
  protected readonly visible = computed(() => {
    if (!this.room()) return false;
    const path = this.currentUrl().split(/[?#]/, 1)[0];
    return path !== '/lobby';
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(event => this.currentUrl.set(event.urlAfterRedirects));
  }

  protected goToLobby(): void {
    void this.router.navigateByUrl('/lobby');
  }
}
