import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { socketManager } from '../network/socket';
import { SOCKET_EVENTS } from '../network/socket-events';
import { PublicStatsComponent } from '../stats/public-stats.component';
import { environment } from '../../environments/environment';
import { RewardEligibilityNoticeComponent } from '../rewards/reward-eligibility-notice.component';
import { AccountRefreshService } from '../account/account-refresh.service';
import { QuickPlayCardComponent } from './quick-play-card.component';

interface RoomState {
  id: string;
  name: string;
  status: 'waiting' | 'countdown' | 'in_game' | 'finished';
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
}

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    PublicStatsComponent,
    TranslocoPipe,
    RewardEligibilityNoticeComponent,
    QuickPlayCardComponent,
  ],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
})
export class LobbyComponent implements OnInit, OnDestroy {
  readonly rooms = signal<RoomState[]>([]);
  readonly currentRoom = signal<RoomState | null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  readonly searching = signal(false);
  private socket!: Socket;

  private readonly transloco = inject(TranslocoService);

  constructor(
    readonly auth: AuthService,
    readonly accountRefresh: AccountRefreshService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.socket = socketManager.connect(this.auth.accessToken()!);
    this.socket.on(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, rooms => this.rooms.set(rooms));
    this.socket.on(SOCKET_EVENTS.ROOM.JOINED, room => {
      this.currentRoom.set(room);
      this.searching.set(false);
    });
    this.socket.on(SOCKET_EVENTS.ROOM.STATE_UPDATED, room => {
      if (this.currentRoom()?.id === room.id) {
        this.currentRoom.set(room);
        this.searching.set(false);
      }
    });
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, room => {
      this.currentRoom.set(room);
      this.searching.set(false);
    });
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, room => {
      this.currentRoom.set(room);
      this.searching.set(false);
    });
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, room => {
      this.currentRoom.set(room);
      this.searching.set(false);
    });
    this.socket.on(SOCKET_EVENTS.ROOM.RETURNED_TO_LOBBY, () => this.currentRoom.set(null));
    this.socket.on(SOCKET_EVENTS.ROOM.LEFT, () => this.currentRoom.set(null));
    this.socket.on(SOCKET_EVENTS.SESSION.CLAIMED, data =>
      this.notice.set(this.transloco.translate(data?.message ?? 'session.claimed')));
    this.socket.on(SOCKET_EVENTS.SESSION.REPLACED, data => {
      this.currentRoom.set(null);
      this.error.set('');
      this.notice.set(this.transloco.translate(data?.message ?? 'session.replaced'));
    });
    this.socket.on(SOCKET_EVENTS.GAME.STARTED, (data: { roomId?: string }) => {
      if (environment.devGameMode && data?.roomId) {
        const slug = data.roomId.replace(/^dev-/, '');
        void this.router.navigate(['/game', slug]);
        return;
      }
      void this.router.navigateByUrl('/game');
    });
    this.socket.on(SOCKET_EVENTS.GAME.ERROR, data => {
      this.error.set(data?.message ?? this.transloco.translate('lobby.errorFallback'));
      this.searching.set(false);
    });
    this.restoreStoredNotice();
    this.socket.emit(SOCKET_EVENTS.LOBBY.LIST_ROOMS);
    this.socket.emit(SOCKET_EVENTS.ROOM.GET_STATE);
  }

  ngOnDestroy(): void {
    this.socket?.off(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED);
    this.socket?.off(SOCKET_EVENTS.ROOM.JOINED);
    this.socket?.off(SOCKET_EVENTS.ROOM.STATE_UPDATED);
    this.socket?.off(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED);
    this.socket?.off(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED);
    this.socket?.off(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED);
    this.socket?.off(SOCKET_EVENTS.ROOM.RETURNED_TO_LOBBY);
    this.socket?.off(SOCKET_EVENTS.ROOM.LEFT);
    this.socket?.off(SOCKET_EVENTS.SESSION.CLAIMED);
    this.socket?.off(SOCKET_EVENTS.SESSION.REPLACED);
    this.socket?.off(SOCKET_EVENTS.GAME.STARTED);
    this.socket?.off(SOCKET_EVENTS.GAME.ERROR);
  }

  quickPlay(): void {
    this.searching.set(true);
    this.error.set('');
    this.socket.emit(SOCKET_EVENTS.LOBBY.QUICK_PLAY);
  }

  leaveRoom(): void {
    this.socket.emit(SOCKET_EVENTS.LOBBY.LEAVE_ROOM);
    this.searching.set(false);
  }

  private restoreStoredNotice(): void {
    const key = 'tank-arena:lobby-notice';
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return;
    window.sessionStorage.removeItem(key);
    this.notice.set(this.transloco.translate(stored));
  }
}
