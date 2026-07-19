import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomState } from '../network/room-state';

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

  @Output() startRequested = new EventEmitter<void>();
  @Output() leaveRequested = new EventEmitter<void>();

  readonly now = signal(Date.now());
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
