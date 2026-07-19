import { ConflictException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { Server, Socket } from 'socket.io';
import { promisify } from 'util';
import { SESSION_MESSAGES, SESSION_REASONS, SOCKET_EVENTS } from '../common/socket-events';
import { DevelopmentSettingsService } from '../config/development-settings.service';
import {
  COUNTDOWN_TIERS,
  MAX_PLAYERS,
  PRIVATE_ROOM_CLOSING_WARNING_MS,
  PRIVATE_ROOM_COUNTDOWN_SECONDS,
  PRIVATE_ROOM_INACTIVITY_MS,
  PRIVATE_ROOM_NAME_MAX_LENGTH,
  PRIVATE_ROOM_NAME_MIN_LENGTH,
  PRIVATE_ROOM_PASSWORD_MAX_LENGTH,
  PRIVATE_ROOM_PASSWORD_MIN_LENGTH,
  PROD_MIN_PLAYERS,
  RECONNECT_GRACE_MS,
  ROUND_RESET_MS,
} from '../games/tanks/config/room.config';
import { GameLoopService } from '../games/tanks/game-loop.service';
import { WatcherPresenceService } from '../games/tanks/events/watcher-presence.service';
import { RedisService } from '../redis/redis.service';
import { RoomRequestError } from './room.errors';
import { displayRoomName, normalizeRoomName } from './room-name.util';
import { GameRoom, RoomMember, RoomPublicState } from './room.types';
import { RuntimeActivityService } from '../runtime/runtime-activity.service';

const scryptAsync = promisify(scrypt);

@Injectable()
export class RoomsService implements OnModuleDestroy {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly userRoom = new Map<string, string>();
  private readonly privateRoomsByName = new Map<string, string>();
  private readonly pendingPrivateRoomNames = new Set<string>();
  private readonly usersCreatingPrivateRooms = new Set<string>();
  private server!: Server;

  constructor(
    private readonly gameLoop: GameLoopService,
    private readonly redis: RedisService,
    private readonly watcherPresence: WatcherPresenceService,
    private readonly runtimeActivity: RuntimeActivityService,
    private readonly developmentSettings?: DevelopmentSettingsService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  getSocketCount(): number {
    return this.server?.sockets?.sockets?.size ?? 0;
  }

  list(): RoomPublicState[] {
    return [...this.rooms.values()]
      .filter(room => room.status !== 'finished')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(room => this.publicState(room));
  }

  listLobby(): RoomPublicState[] {
    return this.list().filter(room => room.type === 'public');
  }

  onModuleDestroy(): void {
    for (const room of this.rooms.values()) this.clearRoomTimers(room);
  }

  roomForUser(userId: string): GameRoom | undefined {
    const roomId = this.userRoom.get(userId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  stateForUser(userId: string): RoomPublicState | null {
    const room = this.roomForUser(userId);
    return room ? this.publicState(room) : null;
  }

  reconnectCurrent(
    socket: Socket,
    auth: { userId: string; username: string },
  ): RoomPublicState | null {
    const room = this.roomForUser(auth.userId);
    if (!room) return null;
    return this.reconnect(room, socket, auth.userId);
  }

  async quickPlay(socket: Socket, auth: { userId: string; username: string }): Promise<RoomPublicState> {
    const existing = this.roomForUser(auth.userId);
    if (existing) return this.reconnect(existing, socket, auth.userId);
    const room = [...this.rooms.values()]
      .filter(candidate =>
        candidate.type === 'public' &&
        (candidate.status === 'waiting' || candidate.status === 'countdown') &&
        candidate.players.size < MAX_PLAYERS,
      )
      .sort((a, b) => b.players.size - a.players.size || a.createdAt - b.createdAt)[0] ?? this.createRoomInternal();
    return this.join(room.id, socket, auth);
  }

  async joinDevelopmentRoom(
    roomSlug: string,
    socket: Socket,
    auth: { userId: string; username: string },
  ): Promise<RoomPublicState> {
    const safeSlug = roomSlug.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 40) || 'salatest';
    const roomId = `dev-${safeSlug}`;
    if (!this.rooms.has(roomId)) {
      this.createRoomInternal(`Sala ${safeSlug}`, roomId);
    }
    const current = this.roomForUser(auth.userId);
    if (current?.id === roomId) return this.reconnect(current, socket, auth.userId);
    if (current) throw new ConflictException('Leave the current room before joining another');

    const room = this.rooms.get(roomId)!;
    if (room.status === 'finished') {
      this.destroy(roomId);
      this.createRoomInternal(`Sala ${safeSlug}`, roomId);
      return this.join(roomId, socket, auth);
    }
    if (room.players.size >= MAX_PLAYERS) throw new ConflictException('Room is full');

    room.players.set(auth.userId, {
      userId: auth.userId,
      username: auth.username,
      socketId: socket.id,
    });
    this.runtimeActivity.playerConnected(auth.userId);
    this.watcherPresence.stopWatching(socket);
    this.userRoom.set(auth.userId, room.id);
    socket.join(this.playerSocketRoom(room.id));
    socket.data.roomId = room.id;
    await this.redis.set(`presence:${auth.userId}`, room.id, 'EX', 60);
    if (room.status !== 'in_game') this.updateCountdown(room);
    this.emitRoom(room);
    return this.publicState(room);
  }

  async createPrivate(
    socket: Socket,
    auth: { userId: string; username: string },
    name: string,
    password: string,
  ): Promise<RoomPublicState> {
    if (this.roomForUser(auth.userId)) {
      throw new RoomRequestError('ROOM_ALREADY_JOINED', 'Leave the current room before creating another');
    }
    const displayName = displayRoomName(name ?? '');
    const normalizedName = this.validatePrivateRoomName(displayName);
    this.validatePrivateRoomPassword(password);
    if (
      this.privateRoomsByName.has(normalizedName)
      || this.pendingPrivateRoomNames.has(normalizedName)
    ) {
      throw new RoomRequestError('ROOM_NAME_TAKEN', 'A room with that name already exists');
    }
    if (this.usersCreatingPrivateRooms.has(auth.userId)) {
      throw new RoomRequestError('ROOM_CREATE_IN_PROGRESS', 'A room creation request is already in progress');
    }

    this.pendingPrivateRoomNames.add(normalizedName);
    this.usersCreatingPrivateRooms.add(auth.userId);
    try {
      const passwordSalt = randomBytes(16).toString('hex');
      const passwordHash = await this.hashPassword(password, passwordSalt);
      const room = this.createRoomInternal(displayName, undefined, {
        type: 'private',
        adminUserId: auth.userId,
        normalizedName,
        passwordSalt,
        passwordHash,
      });
      this.privateRoomsByName.set(normalizedName, room.id);
      this.schedulePrivateRoomExpiration(room);
      try {
        return await this.join(room.id, socket, auth);
      } catch (error) {
        this.destroy(room.id);
        throw error;
      }
    } finally {
      this.pendingPrivateRoomNames.delete(normalizedName);
      this.usersCreatingPrivateRooms.delete(auth.userId);
    }
  }

  async joinPrivate(
    name: string,
    password: string,
    socket: Socket,
    auth: { userId: string; username: string },
  ): Promise<RoomPublicState> {
    const current = this.roomForUser(auth.userId);
    const normalizedName = normalizeRoomName(name ?? '');
    const roomId = this.privateRoomsByName.get(normalizedName);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room || room.type !== 'private' || !room.passwordSalt || !room.passwordHash) {
      throw new RoomRequestError('ROOM_NOT_FOUND_OR_INVALID_PASSWORD', 'Room not found or password is incorrect');
    }
    if (current?.id === room.id) return this.reconnect(room, socket, auth.userId);
    if (current) {
      throw new RoomRequestError('ROOM_ALREADY_JOINED', 'Leave the current room before joining another');
    }
    if (!await this.passwordMatches(password ?? '', room.passwordSalt, room.passwordHash)) {
      throw new RoomRequestError('ROOM_NOT_FOUND_OR_INVALID_PASSWORD', 'Room not found or password is incorrect');
    }
    return this.join(room.id, socket, auth);
  }

  async join(
    roomId: string,
    socket: Socket,
    auth: { userId: string; username: string },
  ): Promise<RoomPublicState> {
    const current = this.roomForUser(auth.userId);
    if (current?.id === roomId) return this.reconnect(current, socket, auth.userId);
    if (current) throw new ConflictException('Leave the current room before joining another');
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (
      room.status === 'in_game'
      || room.status === 'finished'
      || (room.type === 'private' && room.status === 'countdown')
    ) {
      if (room.type === 'private') {
        throw new RoomRequestError('ROOM_ALREADY_STARTED', 'The room is not accepting players');
      }
      throw new ConflictException('Room is not accepting players');
    }
    if (room.players.size >= MAX_PLAYERS) {
      if (room.type === 'private') throw new RoomRequestError('ROOM_FULL', 'Room is full');
      throw new ConflictException('Room is full');
    }

    const member: RoomMember = {
      userId: auth.userId,
      username: auth.username,
      socketId: socket.id,
    };
    room.players.set(auth.userId, member);
    this.runtimeActivity.playerConnected(auth.userId);
    this.watcherPresence.stopWatching(socket);
    this.userRoom.set(auth.userId, room.id);
    socket.join(this.playerSocketRoom(room.id));
    socket.data.roomId = room.id;
    await this.redis.set(`presence:${auth.userId}`, room.id, 'EX', 60);
    this.updateCountdown(room);
    this.emitRoom(room);
    return this.publicState(room);
  }

  async leave(userId: string, reason = 'left'): Promise<void> {
    const room = this.roomForUser(userId);
    if (!room) return;
    const member = room.players.get(userId);
    if (member?.socketId) {
      this.server.sockets.sockets.get(member.socketId)?.leave(this.playerSocketRoom(room.id));
    }
    room.players.delete(userId);
    this.runtimeActivity.playerDisconnected(userId);
    if (room.type === 'private' && room.adminUserId === userId) {
      room.adminUserId = room.players.keys().next().value ?? null;
    }
    this.userRoom.delete(userId);
    await this.redis.del(`presence:${userId}`);
    if (this.gameLoop.hasSession(room.id)) this.gameLoop.removePlayer(room.id, userId);
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.GAME.PLAYER_DISCONNECTED, { playerId: userId, reason });
    if (room.players.size === 0 && room.status !== 'in_game') this.destroy(room.id);
    else {
      if (
        room.type === 'private'
        && room.status === 'countdown'
        && this.connectedPlayerCount(room) < this.activeMinPlayers()
      ) {
        this.cancelPrivateCountdown(room);
      } else {
        this.updateCountdown(room);
      }
      this.emitRoom(room);
    }
  }

  async disconnect(userId: string, socketId: string): Promise<void> {
    const room = this.roomForUser(userId);
    const member = room?.players.get(userId);
    if (!room || !member || member.socketId !== socketId) return;
    member.socketId = null;
    member.disconnectedAt = Date.now();
    this.runtimeActivity.playerDisconnected(userId);
    await this.redis.del(`presence:${userId}`);
    if (room.type === 'private') {
      if (
        room.status === 'countdown'
        && this.connectedPlayerCount(room) < this.activeMinPlayers()
      ) {
        this.cancelPrivateCountdown(room);
      }
      this.emitRoom(room);
      this.scheduleDisconnectedMemberRemoval(room, member);
      return;
    }
    if (room.status !== 'in_game') {
      await this.leave(userId, 'disconnect');
      return;
    }
    this.emitRoom(room);
    this.scheduleDisconnectedMemberRemoval(room, member);
  }

  async finish(roomId: string): Promise<RoomPublicState | null> {
    const room = this.rooms.get(roomId);
    if (!room || room.status === 'finished') return room ? this.publicState(room) : null;
    room.status = 'finished';
    room.countdownEndsAt = undefined;
    this.emitRoom(room);
    const gameState = this.gameLoop.buildState(roomId);
    const winner = gameState.players.find(player => player.alive);
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.GAME.ENDED, {
      roomId,
      winnerUserId: winner?.id ?? null,
      state: gameState,
      returnToLobbyInMs: ROUND_RESET_MS,
    });
    room.roundResetTimer = setTimeout(() => this.resetRound(room.id), ROUND_RESET_MS);
    return this.publicState(room);
  }

  startNow(userId: string): RoomPublicState {
    const room = this.roomForUser(userId);
    if (!room) throw new NotFoundException('Join a room before starting');
    if (room.status === 'in_game') return this.publicState(room);
    if (room.status === 'finished') throw new ConflictException('The room has already finished');
    if (room.type === 'private') {
      if (room.status === 'countdown') return this.publicState(room);
      if (room.adminUserId !== userId) {
        throw new RoomRequestError('ROOM_START_FORBIDDEN', 'Only the room administrator can start the game');
      }
      const connectedPlayers = this.connectedPlayerCount(room);
      if (connectedPlayers < this.activeMinPlayers()) {
        throw new RoomRequestError(
          'ROOM_MIN_PLAYERS',
          `At least ${this.activeMinPlayers()} connected players are required to start`,
          { minPlayers: this.activeMinPlayers() },
        );
      }
      this.startPrivateCountdown(room);
      return this.publicState(room);
    }
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    room.countdownTimer = undefined;
    room.countdownEndsAt = undefined;
    this.startGame(room);
    return this.publicState(room);
  }

  private createRoomInternal(
    name?: string,
    requestedId?: string,
    options: {
      type?: 'public' | 'private';
      adminUserId?: string | null;
      normalizedName?: string;
      passwordSalt?: string;
      passwordHash?: string;
    } = {},
  ): GameRoom {
    const id = requestedId ?? randomUUID();
    const type = options.type ?? 'public';
    const room: GameRoom = {
      id,
      name: name?.trim().slice(0, 40) || `Arena ${this.rooms.size + 1}`,
      normalizedName: options.normalizedName,
      type,
      adminUserId: options.adminUserId ?? null,
      rewardsEligible: type === 'public',
      passwordSalt: options.passwordSalt,
      passwordHash: options.passwordHash,
      status: 'waiting',
      createdAt: Date.now(),
      players: new Map(),
    };
    this.rooms.set(id, room);
    this.emitLobby();
    return room;
  }

  private reconnect(room: GameRoom, socket: Socket, userId: string): RoomPublicState {
    const member = room.players.get(userId);
    if (!member) throw new NotFoundException('Room membership not found');
    const previousSocketId = member.socketId;
    member.socketId = socket.id;
    this.runtimeActivity.playerConnected(userId);
    this.watcherPresence.stopWatching(socket);
    member.disconnectedAt = undefined;
    socket.data.roomId = room.id;
    socket.join(this.playerSocketRoom(room.id));
    if (previousSocketId && previousSocketId !== socket.id) {
      const previousSocket = this.server.sockets.sockets.get(previousSocketId);
      previousSocket?.emit(SOCKET_EVENTS.SESSION.REPLACED, {
        reason: SESSION_REASONS.DUPLICATE_TAB,
        message: SESSION_MESSAGES.REPLACED,
      });
      previousSocket?.disconnect(true);
      socket.emit(SOCKET_EVENTS.SESSION.CLAIMED, {
        reason: SESSION_REASONS.DUPLICATE_TAB,
        message: SESSION_MESSAGES.CLAIMED,
      });
    }
    void this.redis.set(`presence:${userId}`, room.id, 'EX', 60);
    if (room.status === 'in_game' && this.gameLoop.hasSession(room.id)) {
      const initial = this.gameLoop.buildInitialState(room.id);
      socket.emit(SOCKET_EVENTS.GAME.JOINED, {
        playerId: userId,
        map: initial.map,
        status: initial.state.status,
        roomId: room.id,
      });
      socket.emit(SOCKET_EVENTS.GAME.STATE, initial.state);
      this.watcherPresence.sendCurrent(socket, room.id);
    }
    this.emitRoom(room);
    return this.publicState(room);
  }

  private updateCountdown(room: GameRoom): void {
    if (room.status === 'in_game' || room.status === 'finished') return;
    if (room.type === 'private') return;
    const minPlayers = this.activeMinPlayers();
    if (room.players.size < minPlayers) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      room.countdownTimer = undefined;
      room.countdownEndsAt = undefined;
      if (room.status === 'countdown') {
        room.status = 'waiting';
        this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED, this.publicState(room));
      }
      return;
    }
    const desiredSeconds = this.countdownSecondsFor(room.players.size);
    const desiredEnd = Date.now() + desiredSeconds * 1000;
    if (room.status !== 'countdown') {
      room.status = 'countdown';
      room.countdownEndsAt = desiredEnd;
      this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED, this.publicState(room));
      room.countdownTimer = setInterval(() => this.tickCountdown(room.id), 1000);
    } else if ((room.countdownEndsAt ?? desiredEnd) > desiredEnd) {
      room.countdownEndsAt = desiredEnd;
      this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, this.publicState(room));
    }
  }

  private tickCountdown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'countdown' || !room.countdownEndsAt) return;
    const playerCount = room.type === 'private'
      ? this.connectedPlayerCount(room)
      : room.players.size;
    if (playerCount < this.activeMinPlayers()) {
      if (room.type === 'private') this.cancelPrivateCountdown(room);
      else this.updateCountdown(room);
      this.emitRoom(room);
      return;
    }
    if (room.countdownEndsAt <= Date.now()) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      room.countdownTimer = undefined;
      this.startGame(room);
      return;
    }
    const state = this.publicState(room);
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED, state);
    this.emitRoom(room);
  }

  private startGame(room: GameRoom): void {
    this.clearInactivityTimers(room);
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    room.countdownTimer = undefined;
    if (room.type === 'private') this.removeDisconnectedMembers(room);
    room.status = 'in_game';
    room.countdownEndsAt = undefined;
    const players = [...room.players.values()].map(member => ({
      userId: member.userId,
      username: member.username,
    }));
    this.gameLoop.prepare(room.id, players, room.rewardsEligible);
    this.gameLoop.start(room.id);
    const initial = this.gameLoop.buildInitialState(room.id);
    for (const member of room.players.values()) {
      if (!member.socketId) continue;
      const socket = this.server.sockets.sockets.get(member.socketId);
      socket?.emit(SOCKET_EVENTS.GAME.JOINED, {
        playerId: member.userId,
        roomId: room.id,
        map: initial.map,
        status: initial.state.status,
      });
      if (socket) this.watcherPresence.sendCurrent(socket, room.id);
    }
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.GAME.STARTED, { status: 'playing', roomId: room.id });
    this.emitRoom(room);
  }

  private publicState(room: GameRoom): RoomPublicState {
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      adminUserId: room.adminUserId,
      rewardsEligible: room.rewardsEligible,
      status: room.status,
      playerCount: room.players.size,
      minPlayers: this.activeMinPlayers(),
      maxPlayers: MAX_PLAYERS,
      countdownSeconds: room.countdownEndsAt
        ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
        : null,
      expiresAt: room.expiresAt ?? null,
      players: [...room.players.values()].map(member => ({
        userId: member.userId,
        username: member.username,
        connected: member.socketId !== null,
        alive: room.status === 'in_game'
          ? this.gameLoop.isPlayerAlive(room.id, member.userId)
          : true,
      })),
    };
  }

  private emitRoom(room: GameRoom): void {
    const state = this.publicState(room);
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.ROOM.STATE_UPDATED, state);
    void this.redis.set(`room:${room.id}`, JSON.stringify(state), 'EX', 180);
    this.emitLobby();
  }

  private emitLobby(): void {
    if (this.server) this.server.to('lobby').emit(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, this.listLobby());
  }

  private resetRound(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'finished') return;
    room.roundResetTimer = undefined;
    if (room.type === 'private') this.resetPrivateRound(room);
    else this.releaseFinishedRoom(room);
  }

  private destroy(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.clearRoomTimers(room);
    if (room.normalizedName) this.privateRoomsByName.delete(room.normalizedName);
    for (const userId of room.players.keys()) {
      this.runtimeActivity.playerDisconnected(userId);
      this.userRoom.delete(userId);
      void this.redis.del(`presence:${userId}`);
    }
    this.gameLoop.remove(roomId);
    this.rooms.delete(roomId);
    void this.redis.del(`room:${roomId}`);
    this.emitLobby();
  }

  private playerSocketRoom(roomId: string): string {
    return `game:${roomId}:players`;
  }

  private releaseFinishedRoom(room: GameRoom): void {
    const socketRoom = this.playerSocketRoom(room.id);
    for (const member of room.players.values()) {
      this.runtimeActivity.playerDisconnected(member.userId);
      this.userRoom.delete(member.userId);
      void this.redis.del(`presence:${member.userId}`);
      if (!member.socketId) continue;
      const socket = this.server.sockets.sockets.get(member.socketId);
      socket?.leave(socketRoom);
      socket?.emit(SOCKET_EVENTS.ROOM.LEFT, { reason: 'round_finished' });
    }
    this.gameLoop.remove(room.id);
    this.clearRoomTimers(room);
    if (room.normalizedName) this.privateRoomsByName.delete(room.normalizedName);
    this.rooms.delete(room.id);
    void this.redis.del(`room:${room.id}`);
    this.emitLobby();
  }

  private resetPrivateRound(room: GameRoom): void {
    this.gameLoop.remove(room.id);
    room.status = 'waiting';
    room.countdownEndsAt = undefined;
    room.countdownTimer = undefined;
    for (const member of room.players.values()) {
      if (member.socketId) {
        void this.redis.set(`presence:${member.userId}`, room.id, 'EX', 60);
      }
    }
    this.schedulePrivateRoomExpiration(room);
    this.emitRoom(room);
  }

  private startPrivateCountdown(room: GameRoom): void {
    this.clearInactivityTimers(room);
    room.status = 'countdown';
    room.countdownEndsAt = Date.now() + PRIVATE_ROOM_COUNTDOWN_SECONDS * 1000;
    this.server.to(this.playerSocketRoom(room.id)).emit(
      SOCKET_EVENTS.ROOM.COUNTDOWN_STARTED,
      this.publicState(room),
    );
    room.countdownTimer = setInterval(() => this.tickCountdown(room.id), 1000);
    this.emitRoom(room);
  }

  private cancelPrivateCountdown(room: GameRoom): void {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    room.countdownTimer = undefined;
    room.countdownEndsAt = undefined;
    room.status = 'waiting';
    this.schedulePrivateRoomExpiration(room);
    this.server.to(this.playerSocketRoom(room.id)).emit(
      SOCKET_EVENTS.ROOM.COUNTDOWN_CANCELLED,
      this.publicState(room),
    );
  }

  private connectedPlayerCount(room: GameRoom): number {
    return [...room.players.values()].filter(member => member.socketId !== null).length;
  }

  private scheduleDisconnectedMemberRemoval(room: GameRoom, member: RoomMember): void {
    const disconnectedAt = member.disconnectedAt;
    setTimeout(() => {
      const currentRoom = this.rooms.get(room.id);
      const latest = currentRoom?.players.get(member.userId);
      if (latest?.socketId === null && latest.disconnectedAt === disconnectedAt) {
        void this.leave(member.userId, 'reconnect_timeout');
      }
    }, RECONNECT_GRACE_MS);
  }

  private removeDisconnectedMembers(room: GameRoom): void {
    for (const [userId, member] of room.players) {
      if (member.socketId !== null) continue;
      room.players.delete(userId);
      this.runtimeActivity.playerDisconnected(userId);
      this.userRoom.delete(userId);
      void this.redis.del(`presence:${userId}`);
    }
    if (room.adminUserId && !room.players.has(room.adminUserId)) {
      room.adminUserId = room.players.keys().next().value ?? null;
    }
  }

  private validatePrivateRoomName(name: string): string {
    if (name.length < PRIVATE_ROOM_NAME_MIN_LENGTH || name.length > PRIVATE_ROOM_NAME_MAX_LENGTH) {
      throw new RoomRequestError(
        'ROOM_NAME_INVALID',
        `Room name must be between ${PRIVATE_ROOM_NAME_MIN_LENGTH} and ${PRIVATE_ROOM_NAME_MAX_LENGTH} characters`,
        {
          minLength: PRIVATE_ROOM_NAME_MIN_LENGTH,
          maxLength: PRIVATE_ROOM_NAME_MAX_LENGTH,
        },
      );
    }
    const normalizedName = normalizeRoomName(name);
    if (!normalizedName) {
      throw new RoomRequestError('ROOM_NAME_INVALID', 'Room name must contain letters or numbers');
    }
    return normalizedName;
  }

  private validatePrivateRoomPassword(password: string): void {
    if (
      typeof password !== 'string'
      || password.length < PRIVATE_ROOM_PASSWORD_MIN_LENGTH
      || password.length > PRIVATE_ROOM_PASSWORD_MAX_LENGTH
    ) {
      throw new RoomRequestError(
        'ROOM_PASSWORD_INVALID',
        `Password must be between ${PRIVATE_ROOM_PASSWORD_MIN_LENGTH} and ${PRIVATE_ROOM_PASSWORD_MAX_LENGTH} characters`,
        {
          minLength: PRIVATE_ROOM_PASSWORD_MIN_LENGTH,
          maxLength: PRIVATE_ROOM_PASSWORD_MAX_LENGTH,
        },
      );
    }
  }

  private async hashPassword(password: string, salt: string): Promise<string> {
    const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
    return derivedKey.toString('hex');
  }

  private async passwordMatches(password: string, salt: string, expectedHash: string): Promise<boolean> {
    const actual = Buffer.from(await this.hashPassword(password, salt), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private schedulePrivateRoomExpiration(room: GameRoom): void {
    this.clearInactivityTimers(room);
    room.expiresAt = Date.now() + PRIVATE_ROOM_INACTIVITY_MS;
    room.closingWarningTimer = setTimeout(() => {
      const current = this.rooms.get(room.id);
      if (!current || current.status === 'in_game' || current.status === 'finished') return;
      this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.ROOM.CLOSING, {
        roomId: room.id,
        closesAt: room.expiresAt,
        remainingSeconds: PRIVATE_ROOM_CLOSING_WARNING_MS / 1000,
        reason: 'not_started',
      });
    }, PRIVATE_ROOM_INACTIVITY_MS - PRIVATE_ROOM_CLOSING_WARNING_MS);
    room.inactivityTimer = setTimeout(() => this.closeInactivePrivateRoom(room.id), PRIVATE_ROOM_INACTIVITY_MS);
  }

  private closeInactivePrivateRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.type !== 'private' || room.status === 'in_game' || room.status === 'finished') return;
    const socketRoom = this.playerSocketRoom(room.id);
    for (const member of room.players.values()) {
      if (!member.socketId) continue;
      const socket = this.server.sockets.sockets.get(member.socketId);
      if (!socket) continue;
      socket.data.roomId = undefined;
      void socket.leave(socketRoom);
      socket.emit(SOCKET_EVENTS.ROOM.CLOSED, {
        roomId: room.id,
        reason: 'inactivity',
      });
    }
    this.destroy(room.id);
  }

  private clearInactivityTimers(room: GameRoom): void {
    if (room.closingWarningTimer) clearTimeout(room.closingWarningTimer);
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    room.closingWarningTimer = undefined;
    room.inactivityTimer = undefined;
    room.expiresAt = undefined;
  }

  private clearRoomTimers(room: GameRoom): void {
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.roundResetTimer) clearTimeout(room.roundResetTimer);
    this.clearInactivityTimers(room);
  }

  private activeMinPlayers(): number {
    return this.developmentSettings?.rooms()?.minPlayers ?? PROD_MIN_PLAYERS;
  }

  private countdownSecondsFor(playerCount: number): number {
    const devRooms = this.developmentSettings?.rooms();
    if (devRooms) return devRooms.countdownSeconds;
    return COUNTDOWN_TIERS.find(tier => playerCount >= tier.minPlayers)?.seconds
      ?? COUNTDOWN_TIERS[COUNTDOWN_TIERS.length - 1].seconds;
  }
}
