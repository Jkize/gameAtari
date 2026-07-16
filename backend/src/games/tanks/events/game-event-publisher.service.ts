import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '../../../common/socket-events';
import type { PlayerEliminatedEvent } from './elimination-event.types';

@Injectable()
export class GameEventPublisherService {
  private server?: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  publishEliminations(roomId: string, events: readonly PlayerEliminatedEvent[]): void {
    if (!this.server || events.length === 0) return;
    const audience = this.server
      .to(`game:${roomId}:players`)
      .to(`game:${roomId}:watchers`);
    for (const event of events) {
      audience.emit(SOCKET_EVENTS.GAME.PLAYER_ELIMINATED, event);
    }
  }
}
