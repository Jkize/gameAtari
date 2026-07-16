import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { SOCKET_EVENTS } from '../../../common/socket-events';
import type { ViewerCountChangedEvent } from './elimination-event.types';
import { GameSessionsService } from '../runtime/game-sessions.service';

type WatcherSocket = Socket & {
  data: Socket['data'] & { watchingRoomId?: string };
};

@Injectable()
export class WatcherPresenceService {
  private server?: Server;

  constructor(private readonly sessions: GameSessionsService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async join(socket: WatcherSocket, roomId: string): Promise<void> {
    const previousRoomId = socket.data.watchingRoomId;
    if (previousRoomId && previousRoomId !== roomId) {
      await socket.leave(this.watcherRoom(previousRoomId));
      this.broadcast(previousRoomId);
    }

    await socket.join(this.watcherRoom(roomId));
    socket.data.watchingRoomId = roomId;
    this.broadcast(roomId);
  }

  stopWatching(socket: WatcherSocket): void {
    const roomId = socket.data.watchingRoomId;
    if (!roomId) return;
    socket.data.watchingRoomId = undefined;
    void Promise.resolve(socket.leave(this.watcherRoom(roomId)))
      .then(() => this.broadcast(roomId));
  }

  disconnected(socket: WatcherSocket): void {
    const roomId = socket.data.watchingRoomId;
    if (!roomId) return;
    socket.data.watchingRoomId = undefined;
    this.broadcast(roomId);
  }

  sendCurrent(socket: Socket, roomId: string): void {
    socket.emit(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, this.payload(roomId));
  }

  count(roomId: string): number {
    if (!this.server) return 0;
    const viewerSocketIds = new Set(
      this.server.sockets.adapter.rooms.get(this.watcherRoom(roomId)) ?? [],
    );
    const session = this.sessions.get(roomId);
    const playerSocketIds = this.server.sockets.adapter.rooms.get(this.playerRoom(roomId));

    if (session && playerSocketIds) {
      for (const socketId of playerSocketIds) {
        const socket = this.server.sockets.sockets.get(socketId);
        const userId = socket?.data?.auth?.userId;
        if (userId && session.players.get(userId)?.alive === false) {
          viewerSocketIds.add(socketId);
        }
      }
    }

    return viewerSocketIds.size;
  }

  refresh(roomId: string): void {
    this.broadcast(roomId);
  }

  private broadcast(roomId: string): void {
    if (!this.server) return;
    this.server
      .to(`game:${roomId}:players`)
      .to(this.watcherRoom(roomId))
      .emit(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, this.payload(roomId));
  }

  private payload(roomId: string): ViewerCountChangedEvent {
    return { roomId, count: this.count(roomId) };
  }

  private watcherRoom(roomId: string): string {
    return `game:${roomId}:watchers`;
  }

  private playerRoom(roomId: string): string {
    return `game:${roomId}:players`;
  }
}
