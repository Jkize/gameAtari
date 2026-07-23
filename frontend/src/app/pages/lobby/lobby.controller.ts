import { Directive, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Socket } from 'socket.io-client';
import { AuthService } from '@core/auth/auth.service';
import { socketManager } from '@core/realtime/socket';
import { SOCKET_EVENTS } from '@core/realtime/socket-events';
import { GameErrorPayload, RoomState } from '@core/realtime/room-state';
import { environment } from '@env/environment';
import { AccountRefreshService } from '@features/account/account-refresh.service';
import { GameAssetPreloaderService } from '@game/assets/game-asset-preloader.service';
import {
  RoomCredentials,
  RoomDialogMode,
} from './room-access-dialog/room-access-dialog.component';

@Directive()
export abstract class LobbyController implements OnInit, OnDestroy {
  readonly rooms = signal<RoomState[]>([]);
  readonly currentRoom = signal<RoomState | null>(null);
  readonly notice = signal('');
  readonly error = signal('');
  readonly preparing = signal(false);
  readonly searching = signal(false);
  readonly roomDialogMode = signal<RoomDialogMode | null>(null);
  readonly roomActionPending = signal(false);
  readonly roomActionError = signal('');
  readonly startingPrivateRoom = signal(false);
  readonly showPrivateRoomActions = computed(
    () =>
      !this.currentRoom() &&
      !this.preparing() &&
      !this.searching() &&
      !this.roomActionPending() &&
      !this.error(),
  );
  private readonly gameAssets = inject(GameAssetPreloaderService);
  private socket!: Socket;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly socketListeners: Array<[string, (...args: any[]) => void]> = [];
  private destroyed = false;
  private preparationCancelled = false;

  private readonly transloco = inject(TranslocoService);

  constructor(
    readonly auth: AuthService,
    readonly accountRefresh: AccountRefreshService,
    private readonly router: Router,
  ) {}

  readonly preparationProgress = this.gameAssets.progress;
  readonly reconnectEnabled = !environment.devGameMode;

  ngOnInit(): void {
    this.socket = socketManager.connect(this.auth.accessToken()!);
    this.listen(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, (rooms: RoomState[]) => this.rooms.set(rooms));
    this.listen(SOCKET_EVENTS.ROOM.JOINED, (room: RoomState) => {
      this.currentRoom.set(room);
      this.searching.set(false);
      this.roomActionPending.set(false);
      this.roomActionError.set('');
      this.roomDialogMode.set(null);
      void this.gameAssets.prepare().catch(() => undefined);
    });
    this.listen(SOCKET_EVENTS.ROOM.STATE_UPDATED, (room: RoomState) => {
      if (this.currentRoom()?.id === room.id) {
        this.currentRoom.set(room);
        this.searching.set(false);
        if (room.status === 'countdown') this.startingPrivateRoom.set(false);
      }
    });
    this.listen(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, (room: RoomState) => {
      this.currentRoom.set(room);
      this.searching.set(false);
      this.startingPrivateRoom.set(false);
    });
    this.listen(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, (room: RoomState) => {
      this.currentRoom.set(room);
      this.searching.set(false);
      this.startingPrivateRoom.set(false);
    });
    this.listen(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, (room: RoomState) => {
      this.currentRoom.set(room);
      this.searching.set(false);
      this.startingPrivateRoom.set(false);
    });
    this.listen(SOCKET_EVENTS.ROOM.CLOSED, () => {
      this.currentRoom.set(null);
      this.startingPrivateRoom.set(false);
      this.notice.set(this.transloco.translate('lobby.privateRooms.closedByInactivity'));
    });
    this.listen(SOCKET_EVENTS.ROOM.RETURNED_TO_LOBBY, () => this.currentRoom.set(null));
    this.listen(SOCKET_EVENTS.ROOM.LEFT, () => this.currentRoom.set(null));
    this.listen(SOCKET_EVENTS.SESSION.CLAIMED, (data: { message?: string }) =>
      this.notice.set(this.transloco.translate(data?.message ?? 'session.claimed')),
    );
    this.listen(SOCKET_EVENTS.SESSION.REPLACED, (data: { message?: string }) => {
      this.currentRoom.set(null);
      this.error.set('');
      this.notice.set(this.transloco.translate(data?.message ?? 'session.replaced'));
    });
    this.listen(SOCKET_EVENTS.GAME.STARTED, (data: { roomId?: string }) => {
      // Production navigation is handled globally by MatchStartRedirectService,
      // so it also fires when the user is on another route.
      if (!environment.devGameMode) return;
      if (data?.roomId) {
        const slug = data.roomId.replace(/^dev-/, '');
        void this.router.navigate(['/game', slug]);
        return;
      }
      void this.router.navigateByUrl('/game');
    });
    this.listen(SOCKET_EVENTS.GAME.ERROR, (data: GameErrorPayload) => {
      const message = this.translateSocketError(data);
      if (this.roomDialogMode() && this.roomActionPending()) {
        this.roomActionError.set(message);
        this.roomActionPending.set(false);
      } else {
        this.error.set(message);
      }
      this.startingPrivateRoom.set(false);
      this.searching.set(false);
    });
    this.restoreStoredNotice();
    this.socket.emit(SOCKET_EVENTS.LOBBY.LIST_ROOMS);
    this.socket.emit(SOCKET_EVENTS.ROOM.GET_STATE);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.gameAssets.cancel();
    // Remove only this component's handlers. socket.off(event) without a
    // reference would also strip global listeners such as the
    // MatchStartRedirectService gameStarted redirect.
    for (const [event, handler] of this.socketListeners) {
      this.socket?.off(event, handler);
    }
    this.socketListeners.length = 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listen(event: string, handler: (...args: any[]) => void): void {
    this.socket.on(event, handler);
    this.socketListeners.push([event, handler]);
  }

  async quickPlay(): Promise<void> {
    if (this.preparing() || this.searching() || this.currentRoom()) return;
    this.preparationCancelled = false;
    this.preparing.set(true);
    this.error.set('');
    try {
      await this.gameAssets.prepare();
      if (this.destroyed) return;
      this.preparing.set(false);
      this.searching.set(true);
      this.socket.emit(SOCKET_EVENTS.LOBBY.QUICK_PLAY);
    } catch {
      if (this.destroyed || this.preparationCancelled) return;
      this.preparing.set(false);
      this.error.set(this.transloco.translate('lobby.prepareFailed'));
    }
  }

  openRoomDialog(mode: RoomDialogMode): void {
    if (!this.showPrivateRoomActions()) return;
    this.roomActionError.set('');
    this.roomDialogMode.set(mode);
  }

  closeRoomDialog(): void {
    if (this.roomActionPending()) return;
    this.roomActionError.set('');
    this.roomDialogMode.set(null);
  }

  submitRoomAction(credentials: RoomCredentials): void {
    const mode = this.roomDialogMode();
    if (!mode || this.roomActionPending()) return;
    this.roomActionPending.set(true);
    this.roomActionError.set('');
    this.error.set('');
    this.socket.emit(
      mode === 'create' ? SOCKET_EVENTS.LOBBY.CREATE_ROOM : SOCKET_EVENTS.LOBBY.JOIN_ROOM,
      credentials,
    );
  }

  startPrivateRoom(): void {
    const room = this.currentRoom();
    if (
      !room ||
      room.type !== 'private' ||
      room.adminUserId !== this.auth.user()?.id ||
      room.status !== 'waiting' ||
      this.startingPrivateRoom()
    )
      return;
    this.error.set('');
    this.startingPrivateRoom.set(true);
    this.socket.emit(SOCKET_EVENTS.GAME.START);
  }

  canReconnect(): boolean {
    if (environment.devGameMode) return false;
    const room = this.currentRoom();
    if (room?.status !== 'in_game') return false;
    const myId = this.auth.user()?.id;
    if (!myId) return false;
    const me = room.players?.find((player) => player.userId === myId);
    return me ? me.alive !== false : true;
  }

  reconnectToMatch(): void {
    // GameScene emits room:getState on connect; the backend restores the
    // membership and replays gameJoined with the map and current state.
    void this.router.navigateByUrl('/game');
  }

  leaveRoom(): void {
    if (this.preparing()) {
      this.preparationCancelled = true;
      this.gameAssets.cancel();
      this.preparing.set(false);
      return;
    }
    this.socket.emit(SOCKET_EVENTS.LOBBY.LEAVE_ROOM);
    this.searching.set(false);
    this.startingPrivateRoom.set(false);
  }

  private translateSocketError(error: GameErrorPayload): string {
    if (error.messageKey) {
      const translated = this.transloco.translate(error.messageKey, error.messageParams ?? {});
      if (translated !== error.messageKey) return translated;
    }
    return error.message ?? this.transloco.translate('lobby.errorFallback');
  }

  private restoreStoredNotice(): void {
    const key = 'tank-arena:lobby-notice';
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return;
    window.sessionStorage.removeItem(key);
    this.notice.set(this.transloco.translate(stored));
  }
}
