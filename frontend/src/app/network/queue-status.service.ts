import { Injectable, computed, signal } from '@angular/core';
import type { Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { socketManager } from './socket';
import { SOCKET_EVENTS } from './socket-events';
import { RoomState } from './room-state';

@Injectable({ providedIn: 'root' })
export class QueueStatusService {
  readonly currentRoom = signal<RoomState | null>(null);
  readonly countdownRoom = computed(() => {
    const room = this.currentRoom();
    return room?.status === 'countdown' && room.countdownSeconds !== null ? room : null;
  });

  private started = false;
  private readonly attachedSockets = new WeakSet<Socket>();

  start(): void {
    if (environment.devGameMode || this.started) return;
    this.started = true;
    socketManager.onCreated(socket => this.attach(socket));
  }

  private attach(socket: Socket): void {
    if (this.attachedSockets.has(socket)) return;
    this.attachedSockets.add(socket);

    const updateRoom = (room: RoomState): void => this.currentRoom.set(room);
    const clearRoom = (): void => this.currentRoom.set(null);
    const requestCurrentRoom = (): void => {
      socket.emit(SOCKET_EVENTS.ROOM.GET_STATE);
    };

    socket.on(SOCKET_EVENTS.ROOM.JOINED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.STATE_UPDATED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, updateRoom);
    socket.on(SOCKET_EVENTS.ROOM.LEFT, clearRoom);
    socket.on(SOCKET_EVENTS.ROOM.RETURNED_TO_LOBBY, clearRoom);
    socket.on(SOCKET_EVENTS.SESSION.REPLACED, clearRoom);
    socket.on(SOCKET_EVENTS.GAME.STARTED, clearRoom);
    socket.on(SOCKET_EVENTS.TRANSPORT.CONNECT, requestCurrentRoom);

    if (socket.connected) requestCurrentRoom();
  }
}
