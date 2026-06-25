import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { TokensService } from '../../auth/tokens.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { MatchesService } from '../../matches/matches.service';
import { RoomsService } from '../../rooms/rooms.service';
import { GameLoopService } from './game-loop.service';
import { PlayerInput } from './types/player.types';

type AuthenticatedSocket = Socket & {
  data: Socket['data'] & {
    auth: AuthenticatedUser;
    roomId?: string;
  };
};

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? ['http://localhost:4200'],
    credentials: true,
  },
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: TokensService,
    private readonly rooms: RoomsService,
    private readonly gameLoop: GameLoopService,
    private readonly matches: MatchesService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.gameLoop.setServer(server);
    this.rooms.setServer(server);
    this.gameLoop.onFinished(async roomId => {
      try {
        if (!this.isDevGameMode()) await this.matches.persist(roomId);
      } catch (error) {
        console.error(`[match:persist] room=${roomId}`, error);
      } finally {
        await this.rooms.finish(roomId);
      }
    });
    server.use(async (socket, next) => {
      try {
        if (this.isDevGameMode()) {
          const requestedId = socket.handshake.auth?.guestId;
          const guestId = typeof requestedId === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(requestedId)
            ? `guest-${requestedId}`
            : `guest-${socket.id}`;
          socket.data.auth = {
            userId: guestId,
            sessionId: 'development',
            username: `Guest-${guestId.slice(-6)}`,
            provider: AuthProvider.PHANTOM,
          };
          next();
          return;
        }
        const token = socket.handshake.auth?.token;
        if (typeof token !== 'string') throw new Error('Missing access token');
        socket.data.auth = await this.tokens.authenticateAccess(token);
        next();
      } catch (error) {
        next(new Error(error instanceof Error ? error.message : 'Unauthorized'));
      }
    });
  }

  handleConnection(client: AuthenticatedSocket): void {
    client.join('lobby');
    client.emit('lobby:roomsUpdated', this.rooms.list());
    console.log(`[connect] ${client.id} user=${client.data.auth.userId}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const auth = client.data.auth;
    if (auth) void this.rooms.disconnect(auth.userId, client.id);
  }

  @SubscribeMessage('lobby:listRooms')
  listRooms(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.emit('lobby:roomsUpdated', this.rooms.list());
  }

  @SubscribeMessage('lobby:quickPlay')
  async quickPlay(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    await this.safe(client, async () => {
      const room = await this.rooms.quickPlay(client, client.data.auth);
      client.emit('room:joined', room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage('lobby:createRoom')
  async createRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { name?: string } = {},
  ): Promise<void> {
    await this.safe(client, async () => {
      const room = await this.rooms.create(client, client.data.auth, body?.name);
      client.emit('room:joined', room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage('lobby:joinRoom')
  async joinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string },
  ): Promise<void> {
    await this.safe(client, async () => {
      if (!body?.roomId) throw new Error('roomId is required');
      const room = await this.rooms.join(body.roomId, client, client.data.auth);
      client.emit('room:joined', room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage('lobby:leaveRoom')
  async leaveRoom(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    await this.rooms.leave(client.data.auth.userId);
    client.data.roomId = undefined;
    client.emit('room:left', { ok: true });
  }

  @SubscribeMessage('room:getState')
  getRoomState(@ConnectedSocket() client: AuthenticatedSocket): void {
    const state = this.rooms.reconnectCurrent(client, client.data.auth);
    if (!state) {
      client.emit('room:left', { reason: 'membership_expired' });
      return;
    }
    client.emit('room:joined', state);
    client.emit('room:stateUpdated', state);
  }

  @SubscribeMessage('joinGame')
  async legacyJoinGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string } = {},
  ): Promise<void> {
    if (this.isDevGameMode()) {
      await this.safe(client, async () => {
        const room = await this.rooms.joinDevelopmentRoom(
          body?.roomId ?? 'salatest',
          client,
          client.data.auth,
        );
        client.emit('room:joined', room);
        this.emitDevelopmentWaitingState(client, room);
      });
      return;
    }
    await this.quickPlay(client);
  }

  @SubscribeMessage('watchGame')
  watchGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string },
  ): void {
    if (!body?.roomId || !this.gameLoop.hasSession(body.roomId)) {
      client.emit('game:error', { code: 'ROOM_NOT_FOUND', message: 'Game room not found' });
      return;
    }
    client.join(`game:${body.roomId}:watchers`);
    const state = this.gameLoop.buildState(body.roomId);
    client.emit('watchJoined', { watcherId: client.data.auth.userId, map: state.map, status: state.status });
    client.emit('gameState', state);
  }

  @SubscribeMessage('playerInput')
  playerInput(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: Partial<PlayerInput>,
  ): void {
    const room = this.rooms.roomForUser(client.data.auth.userId);
    if (!room || room.status !== 'in_game' || !this.gameLoop.hasSession(room.id)) return;
    this.gameLoop.applyInput(room.id, client.data.auth.userId, input);
  }

  @SubscribeMessage('startGame')
  startGame(@ConnectedSocket() client: AuthenticatedSocket): void {
    if (this.config.get<boolean>('DEV_MANUAL_START', false)) {
      try {
        this.rooms.startNow(client.data.auth.userId);
      } catch (error) {
        client.emit('game:error', {
          code: 'START_FAILED',
          message: error instanceof Error ? error.message : 'Could not start the game',
        });
      }
      return;
    }
    client.emit('game:error', {
      code: 'COUNTDOWN_AUTHORITATIVE',
      message: 'The room countdown starts the game automatically',
    });
  }

  @SubscribeMessage('restartGame')
  async restartGame(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    if (!this.isDevGameMode() || !this.config.get<boolean>('DEV_MANUAL_START', false)) {
      client.emit('game:error', {
        code: 'RESTART_DEVELOPMENT_ONLY',
        message: 'Manual restart is only available in development mode',
      });
      return;
    }
    await this.rooms.leave(client.data.auth.userId);
    await this.quickPlay(client);
    this.rooms.startNow(client.data.auth.userId);
  }

  private async safe(client: AuthenticatedSocket, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      client.emit('game:error', {
        code: 'REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  private isDevGameMode(): boolean {
    return this.config.get<boolean>('DEV_GAME_MODE', false);
  }

  private emitDevelopmentWaitingState(
    client: AuthenticatedSocket,
    room: { id: string; players: Array<{ userId: string; username: string }> },
  ): void {
    if (!this.isDevGameMode()) return;
    if (!this.gameLoop.hasSession(room.id)) {
      this.gameLoop.prepare(room.id, room.players);
    } else {
      this.gameLoop.addPlayer(
        room.id,
        client.data.auth.userId,
        client.data.auth.username,
      );
    }
    const state = this.gameLoop.buildState(room.id);
    client.emit('gameJoined', {
      playerId: client.data.auth.userId,
      roomId: room.id,
      map: state.map,
      status: state.status,
    });
    client.emit('gameState', state);
  }
}
