import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomState } from '@core/realtime/room-state';

@Component({
  selector: 'app-private-room-panel',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './private-room-panel.component.html',
  styleUrl: './private-room-panel.component.css',
})
export class PrivateRoomPanelComponent implements OnInit, OnDestroy {
  @Input({ required: true }) room!: RoomState;
  @Input() currentUserId = '';
  @Input() starting = false;
  @Input() compact = false;

  @Output() startRequested = new EventEmitter<void>();
  @Output() leaveRequested = new EventEmitter<void>();

  readonly now = signal(Date.now());
  readonly statHelp = signal<'wins' | 'kills' | null>(null);
  private timer?: number;

  ngOnInit(): void {
    this.timer = window.setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
  }

  isAdmin(): boolean {
    return this.room.adminUserId === this.currentUserId;
  }

  connectedPlayers(): number {
    return this.room.players?.filter(player => player.connected).length ?? 0;
  }

  rankedPlayers(): NonNullable<RoomState['players']> {
    return [...(this.room.players ?? [])].sort((left, right) =>
      (right.roundWins ?? 0) - (left.roundWins ?? 0)
      || (right.kills ?? 0) - (left.kills ?? 0)
      || (right.damageDealt ?? 0) - (left.damageDealt ?? 0)
      || left.username.localeCompare(right.username),
    );
  }

  toggleStatHelp(stat: 'wins' | 'kills'): void {
    this.statHelp.update(current => current === stat ? null : stat);
  }

  canStart(): boolean {
    return this.isAdmin()
      && this.room.status === 'waiting'
      && this.connectedPlayers() >= this.room.minPlayers
      && !this.starting;
  }

  remainingSeconds(): number | null {
    if (this.room.expiresAt === null) return null;
    return Math.max(0, Math.ceil((this.room.expiresAt - this.now()) / 1000));
  }

  remainingTime(): string {
    const remaining = this.remainingSeconds();
    if (remaining === null) return '';
    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
    const seconds = (remaining % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  isClosingSoon(): boolean {
    const remaining = this.remainingSeconds();
    return remaining !== null && remaining <= 30;
  }
}
