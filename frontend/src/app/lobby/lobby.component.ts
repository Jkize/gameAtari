import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { socketManager } from '../network/socket';
import { SOCKET_EVENTS } from '../network/socket-events';
import { LanguageSwitcherComponent } from '../shared/language-switcher.component';
import { PublicStatsComponent } from '../stats/public-stats.component';
import { environment } from '../../environments/environment';

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
  imports: [PublicStatsComponent, TranslocoPipe, LanguageSwitcherComponent],
  template: `
    <main class="lobby">
      <header>
        <div>
          <p class="eyebrow">{{ 'lobby.eyebrow' | transloco }}</p>
          <h1>{{ 'lobby.heading' | transloco }}</h1>
        </div>
        <div class="pilot">
          {{ auth.user()?.username ?? ('lobby.guestUsername' | transloco) }}
          <app-lang-switcher></app-lang-switcher>
          <button (click)="logout()">{{ 'lobby.leave' | transloco }}</button>
        </div>
      </header>

      <app-public-stats [compact]="true"></app-public-stats>

      <section class="actions">
        <button class="primary" (click)="quickPlay()" [disabled]="!!currentRoom()">{{ 'lobby.quickPlay' | transloco }}</button>
      </section>

      @if (currentRoom()) {
        <section class="current">
          <p>{{ 'lobby.searching' | transloco }}</p>
          <h2>{{ currentRoom()!.name }}</h2>
          <strong>{{ 'lobby.capacityPlayers' | transloco: { current: currentRoom()!.playerCount, max: currentRoom()!.maxPlayers } }}</strong>
          @if (currentRoom()!.countdownSeconds !== null) {
            <span>{{ 'lobby.battleCountdown' | transloco: { seconds: currentRoom()!.countdownSeconds } }}</span>
          } @else {
            <span>{{ 'lobby.waitingPlayers' | transloco: { current: currentRoom()!.playerCount, min: currentRoom()!.minPlayers } }}</span>
          }
          <button (click)="leaveRoom()">{{ 'lobby.cancel' | transloco }}</button>
        </section>
      } @else {
        <section class="empty">
          <p>{{ 'lobby.emptyQueue' | transloco }}</p>
        </section>
      }

      @if (notice()) { <p class="notice">{{ notice() }}</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #edf4dc; background: #11170f; }
    .lobby { width: min(980px, calc(100% - 40px)); margin: auto; padding: 48px 0; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    .eyebrow { color: #d4ff5f; letter-spacing: .2em; }
    h1 { margin: 4px 0 24px; font-size: 3rem; }
    button { padding: 11px 18px; border: 1px solid #71825c; color: #edf4dc; background: #263223; cursor: pointer; }
    button.primary { color: #10150e; background: #d4ff5f; border-color: #d4ff5f; font-weight: 800; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    .actions { display: flex; gap: 12px; margin-bottom: 28px; }
    .actions .primary { min-width: 220px; min-height: 54px; font-size: 1.05rem; }
    .current { display: grid; gap: 8px; padding: 24px; margin-bottom: 28px; border: 1px solid #d4ff5f; background: #1c281a; }
    .current p, .current h2 { margin: 0; }
    .current button { justify-self: start; margin-top: 10px; }
    .empty { padding-top: 8px; color: #aeb8a6; }
    .pilot { display: flex; gap: 12px; align-items: center; }
    .notice { padding: 12px; color: #d4ff5f; background: #1c281a; border: 1px solid #71825c; }
    .error { color: #ff8a80; }
  `],
})
export class LobbyComponent implements OnInit, OnDestroy {
  readonly rooms = signal<RoomState[]>([]);
  readonly currentRoom = signal<RoomState | null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  private socket!: Socket;

  private readonly transloco = inject(TranslocoService);

  constructor(
    readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.socket = socketManager.connect(this.auth.accessToken()!);
    this.socket.on(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, rooms => this.rooms.set(rooms));
    this.socket.on(SOCKET_EVENTS.ROOM.JOINED, room => this.currentRoom.set(room));
    this.socket.on(SOCKET_EVENTS.ROOM.STATE_UPDATED, room => {
      if (this.currentRoom()?.id === room.id) this.currentRoom.set(room);
    });
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, room => this.currentRoom.set(room));
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, room => this.currentRoom.set(room));
    this.socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, room => this.currentRoom.set(room));
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
    this.socket.on(SOCKET_EVENTS.GAME.ERROR, data =>
      this.error.set(data?.message ?? this.transloco.translate('lobby.errorFallback')));
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

  quickPlay(): void { this.socket.emit(SOCKET_EVENTS.LOBBY.QUICK_PLAY); }
  leaveRoom(): void { this.socket.emit(SOCKET_EVENTS.LOBBY.LEAVE_ROOM); }

  private restoreStoredNotice(): void {
    const key = 'tank-arena:lobby-notice';
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return;
    window.sessionStorage.removeItem(key);
    this.notice.set(this.transloco.translate(stored));
  }

  async logout(): Promise<void> {
    socketManager.disconnect();
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
