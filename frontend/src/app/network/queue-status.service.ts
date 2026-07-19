import { Injectable, computed, signal } from '@angular/core';
import type { Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { socketManager } from './socket';
import { SOCKET_EVENTS } from './socket-events';
import { RoomState } from './room-state';

@Injectable({ providedIn: 'root' })
export class QueueStatusService {
  readonly currentRoom = signal<RoomState | null>(null);
  readonly floatingRoom = computed(() => {
    const room = this.currentRoom();
    if (!room) return null;
    if (room.status === 'countdown' && room.countdownSeconds !== null) return room;
    return room.type === 'private' && room.status === 'waiting' ? room : null;
  });
  readonly countdownRoom = computed(() => {
    const room = this.currentRoom();
    return room?.status === 'countdown' && room.countdownSeconds !== null ? room : null;
  });
  readonly startingPrivateRoom = signal(false);
  readonly startPrivateRoomFailed = signal(false);

  private started = false;
  private readonly attachedSockets = new WeakSet<Socket>();

  start(): void {
    if (environment.devGameMode || this.started) return;
    this.started = true;
    socketManager.onCreated(socket => this.attach(socket));
  }

  startPrivateRoom(userId: string): void {
    const room = this.currentRoom();
    const connectedPlayers = room?.players?.filter(player => player.connected).length ?? room?.playerCount ?? 0;
    const socket = socketManager.get();
    if (
      !socket
      || !room
      || room.type !== 'private'
      || room.status !== 'waiting'
      || room.adminUserId !== userId
      || connectedPlayers < room.minPlayers
      || this.startingPrivateRoom()
    ) return;
    this.startPrivateRoomFailed.set(false);
    this.startingPrivateRoom.set(true);
    socket.emit(SOCKET_EVENTS.GAME.START);
  }

  private attach(socket: Socket): void {
    if (this.attachedSockets.has(socket)) return;
    this.attachedSockets.add(socket);

    const updateRoom = (room: RoomState): void => {
      this.currentRoom.set(room);
      if (room.status !== 'waiting') this.startingPrivateRoom.set(false);
    };
    const clearRoom = (): void => {
      this.currentRoom.set(null);
      this.startingPrivateRoom.set(false);
      this.startPrivateRoomFailed.set(false);
    };
    const requestCurrentRoom = (): void => {
      socket.emit(SOCKET_EVENTS.ROOM.GET_STATE);
    };

    socket.on(SOCKET_EVENTS.ROOM.JOINED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.STATE_UPDATED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, updateRoom);
    socket.on(SOCKET_EVENTS.GAME.ERROR, () => {
      if (!this.startingPrivateRoom()) return;
      this.startingPrivateRoom.set(false);
      this.startPrivateRoomFailed.set(true);
    });
    socket.on(SOCKET_EVENTS.ROOM.LEFT, clearRoom);
    socket.on(SOCKET_EVENTS.ROOM.CLOSED, clearRoom);
    socket.on(SOCKET_EVENTS.ROOM.RETURNED_TO_LOBBY, clearRoom);
    socket.on(SOCKET_EVENTS.SESSION.REPLACED, clearRoom);
    socket.on(SOCKET_EVENTS.GAME.STARTED, clearRoom);
    socket.on(SOCKET_EVENTS.TRANSPORT.CONNECT, requestCurrentRoom);

    if (socket.connected) requestCurrentRoom();
  }
}
