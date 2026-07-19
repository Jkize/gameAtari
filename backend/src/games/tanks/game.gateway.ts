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
import { AuthProvider, UserRole } from '@prisma/client';
import { TokensService } from '../../auth/tokens.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { SOCKET_EVENTS } from '../../common/socket-events';
import { DevelopmentSettingsService } from '../../config/development-settings.service';
import { MatchesService } from '../../matches/matches.service';
import { RoomsService } from '../../rooms/rooms.service';
import { RoomRequestError } from '../../rooms/room.errors';
import { GameLoopService } from './game-loop.service';
import { PlayerInput } from './types/player.types';
import { SocketRateLimiterService } from './socket-rate-limiter.service';
import { GameEventPublisherService } from './events/game-event-publisher.service';
import { WatcherPresenceService } from './events/watcher-presence.service';

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
    private readonly eventPublisher: GameEventPublisherService,
    private readonly watcherPresence: WatcherPresenceService,
  ) {}

  afterInit(server: Server): void {
    this.gameLoop.setServer(server);
    this.rooms.setServer(server);
    this.eventPublisher.setServer(server);
    this.watcherPresence.setServer(server);
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
        const ip = this.clientIp(socket);
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
    this.rateLimiter.addConnection(this.clientIp(client), client.id);
    client.join('lobby');
    client.emit(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, this.rooms.listLobby());
    console.log(`[connect] ${client.id} user=${client.data.auth.userId}`);
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.rateLimiter.removeConnection(this.clientIp(client), client.id);
    this.watcherPresence.disconnected(client);
    const auth = client.data.auth;
    if (auth) {
      const roomId = this.rooms.roomForUser(auth.userId)?.id;
      void this.rooms.disconnect(auth.userId, client.id)
        .finally(() => {
          if (roomId) this.watcherPresence.refresh(roomId);
        });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.LIST_ROOMS)
  listRooms(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.emit(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, this.rooms.listLobby());
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.QUICK_PLAY)
  async quickPlay(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    if (!this.rateLimiter.checkLobbyAction(client.data.auth.userId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'RATE_LIMITED',
        messageKey: 'common.errors.rateLimited',
        messageParams: {},
        message: 'Too many requests, slow down',
      });
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
    @MessageBody() body: { name?: string; password?: string } = {},
  ): Promise<void> {
    if (!this.rateLimiter.checkLobbyAction(client.data.auth.userId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'RATE_LIMITED',
        messageKey: 'common.errors.rateLimited',
        messageParams: {},
        message: 'Too many requests, slow down',
      });
      return;
    }
    await this.safe(client, async () => {
      if (typeof body?.name !== 'string' || typeof body?.password !== 'string') {
        throw new RoomRequestError('ROOM_CREATE_INVALID', 'Room name and password are required');
      }
      const room = await this.rooms.createPrivate(
        client,
        client.data.auth,
        body.name,
        body.password,
      );
      client.emit(SOCKET_EVENTS.ROOM.JOINED, room);
      this.emitDevelopmentWaitingState(client, room);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.LOBBY.JOIN_ROOM)
  async joinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { name?: string; password?: string },
  ): Promise<void> {
    if (!this.rateLimiter.checkLobbyAction(client.data.auth.userId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'RATE_LIMITED',
        messageKey: 'common.errors.rateLimited',
        messageParams: {},
        message: 'Too many requests, slow down',
      });
      return;
    }
    await this.safe(client, async () => {
      if (typeof body?.name !== 'string' || typeof body?.password !== 'string') {
        throw new RoomRequestError('ROOM_JOIN_INVALID', 'Room name and password are required');
      }
      const room = await this.rooms.joinPrivate(body.name, body.password, client, client.data.auth);
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
  async watchGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { roomId?: string },
  ): Promise<void> {
    if (client.data.auth.role !== UserRole.ADMIN) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'WATCH_ADMIN_ONLY',
        messageKey: 'game.errors.watchAdminOnly',
        messageParams: {},
        message: 'Watching games is currently restricted to administrators',
      });
      return;
    }
    if (!body?.roomId || !this.gameLoop.hasSession(body.roomId)) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'ROOM_NOT_FOUND',
        messageKey: 'game.errors.roomNotFound',
        messageParams: {},
        message: 'Game room not found',
      });
      return;
    }
    await this.watcherPresence.join(client, body.roomId);
    const initial = this.gameLoop.buildInitialState(body.roomId);
    client.emit(SOCKET_EVENTS.GAME.WATCH_JOINED, {
      watcherId: client.data.auth.userId,
      roomId: body.roomId,
      map: initial.map,
      status: initial.state.status,
    });
    client.emit(SOCKET_EVENTS.GAME.STATE, initial.state);
    this.watcherPresence.sendCurrent(client, body.roomId);
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
    const room = this.rooms.roomForUser(client.data.auth.userId);
    if (room?.type === 'private' || this.developmentSettings.isManualStartEnabled()) {
      try {
        this.rooms.startNow(client.data.auth.userId);
      } catch (error) {
        client.emit(SOCKET_EVENTS.GAME.ERROR, {
          code: error instanceof RoomRequestError ? error.code : 'START_FAILED',
          messageKey: error instanceof RoomRequestError ? error.messageKey : 'game.errors.startFailed',
          messageParams: error instanceof RoomRequestError ? error.messageParams : {},
          message: error instanceof Error ? error.message : 'Could not start the game',
        });
      }
      return;
    }
    client.emit(SOCKET_EVENTS.GAME.ERROR, {
      code: 'COUNTDOWN_AUTHORITATIVE',
      messageKey: 'game.errors.countdownAuthoritative',
      messageParams: {},
      message: 'The room countdown starts the game automatically',
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.GAME.RESTART)
  async restartGame(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    if (!this.isDevGameMode() || !this.developmentSettings.isManualStartEnabled()) {
      client.emit(SOCKET_EVENTS.GAME.ERROR, {
        code: 'RESTART_DEVELOPMENT_ONLY',
        messageKey: 'game.errors.restartDevelopmentOnly',
        messageParams: {},
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
        code: error instanceof RoomRequestError ? error.code : 'REQUEST_FAILED',
        messageKey: error instanceof RoomRequestError ? error.messageKey : 'common.errors.requestFailed',
        messageParams: error instanceof RoomRequestError ? error.messageParams : {},
        message: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }

  private isDevGameMode(): boolean {
    return this.developmentSettings.isDevGameMode();
  }

  private clientIp(client: Socket): string {
    const forwardedFor = client.handshake.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = forwardedValue?.split(',')[0]?.trim();
    return forwardedIp || client.handshake.address;
  }

  private emitDevelopmentWaitingState(
    client: AuthenticatedSocket,
    room: {
      id: string;
      rewardsEligible: boolean;
      players: Array<{ userId: string; username: string }>;
    },
  ): void {
    if (!this.isDevGameMode()) return;
    if (!this.gameLoop.hasSession(room.id)) {
      this.gameLoop.prepare(room.id, room.players, room.rewardsEligible);
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
