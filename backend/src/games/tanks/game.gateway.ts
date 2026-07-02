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
import { AuthProvider } from '@prisma/client';
import { TokensService } from '../../auth/tokens.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { SOCKET_EVENTS } from '../../common/socket-events';
import { DevelopmentSettingsService } from '../../config/development-settings.service';
import { MatchesService } from '../../matches/matches.service';
import { RoomsService } from '../../rooms/rooms.service';
import { GameLoopService } from './game-loop.service';
import { PlayerInput } from './types/player.types';
import { SocketRateLimiterService } from './socket-rate-limiter.service';

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
    private readonly developmentSettings: DevelopmentSettingsService,
    private readonly rateLimiter: SocketRateLimiterService,
  ) {}

  afterInit(server: Server): void {
    this.gameLoop.setServer(server);
    this.rooms.setServer(server);
    this.gameLoop.onFinished(async roomId => {
      try {
        if (this.developmentSettings.shouldPersistMatches()) await this.matches.persist(roomId);
      } catch (error) {
        console.error(`[match:persist] room=${roomId}`, error);
      } finally {
        await this.rooms.finish(roomId);
      }
    });
    server.use(async (socket, next) => {
      try {
        const ip = socket.handshake.address;
        if (!this.rateLimiter.isConnectionAllowed(ip)) {
          next(new Error('Too many connections from this IP'));
          return;
        }
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
    this.rateLimiter.addConnection(client.handshake.address, client.id);
    client.join('lobby');
    client.emit(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, this.rooms.list());
    console.log(`[connect] ${client.id} user=${client.data.auth.userId}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.rateLimiter.removeConnection(client.handshake.address, client.id);
    const auth = client.data.auth;
    if (auth) void this.rooms.disconnect(auth.userId, client.id);
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.LIST_ROOMS)
  listRooms(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.emit(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, this.rooms.list());
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.QUICK_PLAY)
  async quickPlay(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    if (!this.rateLimiter.checkLobbyAction(client.data.auth.userId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, { code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
      return;
    }
    await this.safe(client, async () => {
      const room = await this.rooms.quickPlay(client, client.data.auth);
      client.emit(SOCKET_EVENTS.ROOM.JOINED, room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.CREATE_ROOM)
  async createRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { name?: string } = {},
  ): Promise<void> {
    if (!this.rateLimiter.checkLobbyAction(client.data.auth.userId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, { code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
      return;
    }
    await this.safe(client, async () => {
      const room = await this.rooms.create(client, client.data.auth, body?.name);
      client.emit(SOCKET_EVENTS.ROOM.JOINED, room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.JOIN_ROOM)
  async joinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string },
  ): Promise<void> {
    if (!this.rateLimiter.checkLobbyAction(client.data.auth.userId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, { code: 'RATE_LIMITED', message: 'Too many requests, slow down' });
      return;
    }
    await this.safe(client, async () => {
      if (!body?.roomId) throw new Error('roomId is required');
      const room = await this.rooms.join(body.roomId, client, client.data.auth);
      client.emit(SOCKET_EVENTS.ROOM.JOINED, room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.LEAVE_ROOM)
  async leaveRoom(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    await this.rooms.leave(client.data.auth.userId);
    client.data.roomId = undefined;
    client.emit(SOCKET_EVENTS.ROOM.LEFT, { ok: true });
  }

  @SubscribeMessage(SOCKET_EVENTS.ROOM.GET_STATE)
  getRoomState(@ConnectedSocket() client: AuthenticatedSocket): void {
    const state = this.rooms.reconnectCurrent(client, client.data.auth);
    if (!state) {
      client.emit(SOCKET_EVENTS.ROOM.LEFT, { reason: 'membership_expired' });
      return;
    }
    client.emit(SOCKET_EVENTS.ROOM.JOINED, state);
    client.emit(SOCKET_EVENTS.ROOM.STATE_UPDATED, state);
  }

  @SubscribeMessage(SOCKET_EVENTS.GAME.JOIN)
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
        client.emit(SOCKET_EVENTS.ROOM.JOINED, room);
        this.emitDevelopmentWaitingState(client, room);
      });
      return;
    }
    await this.quickPlay(client);
  }

  @SubscribeMessage(SOCKET_EVENTS.GAME.WATCH)
  watchGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string },
  ): void {
    if (!body?.roomId || !this.gameLoop.hasSession(body.roomId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, { code: 'ROOM_NOT_FOUND', message: 'Game room not found' });
      return;
    }
    client.join(`game:${body.roomId}:watchers`);
    const initial = this.gameLoop.buildInitialState(body.roomId);
    client.emit(SOCKET_EVENTS.GAME.WATCH_JOINED, {
      watcherId: client.data.auth.userId,
      map: initial.map,
      status: initial.state.status,
    });
    client.emit(SOCKET_EVENTS.GAME.STATE, initial.state);
  }

  @SubscribeMessage(SOCKET_EVENTS.GAME.PLAYER_INPUT)
  playerInput(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() input: Partial<PlayerInput>,
  ): void {
    if (!this.rateLimiter.checkPlayerInput(client.data.auth.userId)) return;
    const room = this.rooms.roomForUser(client.data.auth.userId);
    if (!room || room.status !== 'in_game' || !this.gameLoop.hasSession(room.id)) return;
    this.gameLoop.applyInput(room.id, client.data.auth.userId, input);
  }

  @SubscribeMessage(SOCKET_EVENTS.GAME.START)
  startGame(@ConnectedSocket() client: AuthenticatedSocket): void {
    if (this.developmentSettings.isManualStartEnabled()) {
      try {
        this.rooms.startNow(client.data.auth.userId);
      } catch (error) {
        client.emit(SOCKET_EVENTS.GAME.ERROR, {
          code: 'START_FAILED',
          message: error instanceof Error ? error.message : 'Could not start the game',
        });
      }
      return;
    }
    client.emit(SOCKET_EVENTS.GAME.ERROR, {
      code: 'COUNTDOWN_AUTHORITATIVE',
      message: 'The room countdown starts the game automatically',
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.GAME.RESTART)
  async restartGame(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    if (!this.isDevGameMode() || !this.developmentSettings.isManualStartEnabled()) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'RESTART_DEVELOPMENT_ONLY',
        message: 'Manual restart is only available in development mode',
      });
      return;
    }
    await this.rooms.leave(client.data.auth.userId);
    await this.quickPlay(client);
    this.rooms.startNow(client.data.auth.userId);
  }

  @SubscribeMessage(SOCKET_EVENTS.NETWORK.PING)
  networkPing(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { sentAt?: number } = {},
  ): void {
    if (typeof body.sentAt !== 'number') return;
    client.emit(SOCKET_EVENTS.NETWORK.PONG, { sentAt: body.sentAt });
  }

  private async safe(client: AuthenticatedSocket, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  private isDevGameMode(): boolean {
    return this.developmentSettings.isDevGameMode();
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
    const initial = this.gameLoop.buildInitialState(room.id);
    client.emit(SOCKET_EVENTS.GAME.JOINED, {
      playerId: client.data.auth.userId,
      roomId: room.id,
      map: initial.map,
      status: initial.state.status,
    });
    client.emit(SOCKET_EVENTS.GAME.STATE, initial.state);
  }
}
