import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { AuthService } from '../auth/auth.service';
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
  private readonly auth = inject(AuthService);
  private readonly currentUrl = signal(this.router.url);

  protected readonly room = this.queueStatus.floatingRoom;
  protected readonly starting = this.queueStatus.startingPrivateRoom;
  protected readonly startFailed = this.queueStatus.startPrivateRoomFailed;
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

  protected connectedPlayers(): number {
    const room = this.room();
    return room?.players?.filter(player => player.connected).length ?? room?.playerCount ?? 0;
  }

  protected isAdmin(): boolean {
    return this.room()?.adminUserId === this.auth.user()?.id;
  }

  protected canStart(): boolean {
    const room = this.room();
    return Boolean(
      room
      && room.type === 'private'
      && room.status === 'waiting'
      && this.isAdmin()
      && this.connectedPlayers() >= room.minPlayers
      && !this.starting()
    );
  }

  protected startMatch(): void {
    const userId = this.auth.user()?.id;
    if (userId) this.queueStatus.startPrivateRoom(userId);
  }
}
