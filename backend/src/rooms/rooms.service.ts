import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { SESSION_MESSAGES, SESSION_REASONS, SOCKET_EVENTS } from '../common/socket-events';
import { DevelopmentSettingsService } from '../config/development-settings.service';
import { GameLoopService } from '../games/tanks/game-loop.service';
import { RedisService } from '../redis/redis.service';
import { GameRoom, RoomMember, RoomPublicState } from './room.types';

export const PROD_MIN_PLAYERS = 2;
export const MAX_PLAYERS = 15;
const COUNTDOWN_TIERS = [
  { minPlayers: 15, seconds: 10 },
  { minPlayers: 8, seconds: 20 },
  { minPlayers: 4, seconds: 40 },
];
const RECONNECT_GRACE_MS = 15_000;
const ROUND_RESET_MS = 5_000;

@Injectable()
export class RoomsService {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly userRoom = new Map<string, string>();
  private server!: Server;

  constructor(
    private readonly gameLoop: GameLoopService,
    private readonly redis: RedisService,
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
    this.userRoom.set(auth.userId, room.id);
    socket.join(this.playerSocketRoom(room.id));
    socket.data.roomId = room.id;
    await this.redis.set(`presence:${auth.userId}`, room.id, 'EX', 60);
    if (room.status !== 'in_game') this.updateCountdown(room);
    this.emitRoom(room);
    return this.publicState(room);
  }

  async create(socket: Socket, auth: { userId: string; username: string }, name?: string) {
    if (this.roomForUser(auth.userId)) throw new ConflictException('You are already in a room');
    const room = this.createRoomInternal(name);
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
    if (room.status === 'in_game' || room.status === 'finished') {
      throw new ConflictException('Room is not accepting players');
    }
    if (room.players.size >= MAX_PLAYERS) throw new ConflictException('Room is full');

    const member: RoomMember = {
      userId: auth.userId,
      username: auth.username,
      socketId: socket.id,
    };
    room.players.set(auth.userId, member);
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
    this.userRoom.delete(userId);
    await this.redis.del(`presence:${userId}`);
    if (this.gameLoop.hasSession(room.id)) this.gameLoop.removePlayer(room.id, userId);
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.GAME.PLAYER_DISCONNECTED, { playerId: userId, reason });
    if (room.players.size === 0 && room.status !== 'in_game') this.destroy(room.id);
    else {
      this.updateCountdown(room);
      this.emitRoom(room);
    }
  }

  async disconnect(userId: string, socketId: string): Promise<void> {
    const room = this.roomForUser(userId);
    const member = room?.players.get(userId);
    if (!room || !member || member.socketId !== socketId) return;
    member.socketId = null;
    member.disconnectedAt = Date.now();
    await this.redis.del(`presence:${userId}`);
    if (room.status !== 'in_game') {
      await this.leave(userId, 'disconnect');
      return;
    }
    this.emitRoom(room);
    setTimeout(() => {
      const latest = room.players.get(userId);
      if (latest?.socketId === null && latest.disconnectedAt === member.disconnectedAt) {
        void this.leave(userId, 'reconnect_timeout');
      }
    }, RECONNECT_GRACE_MS);
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
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    room.countdownTimer = undefined;
    room.countdownEndsAt = undefined;
    this.startGame(room);
    return this.publicState(room);
  }

  private createRoomInternal(name?: string, requestedId?: string): GameRoom {
    const id = requestedId ?? randomUUID();
    const room: GameRoom = {
      id,
      name: name?.trim().slice(0, 40) || `Arena ${this.rooms.size + 1}`,
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
    }
    this.emitRoom(room);
    return this.publicState(room);
  }

  private updateCountdown(room: GameRoom): void {
    if (room.status === 'in_game' || room.status === 'finished') return;
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
    if (room.players.size < this.activeMinPlayers()) {
      this.updateCountdown(room);
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
    room.status = 'in_game';
    room.countdownEndsAt = undefined;
    const players = [...room.players.values()].map(member => ({
      userId: member.userId,
      username: member.username,
    }));
    this.gameLoop.prepare(room.id, players);
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
    }
    this.server.to(this.playerSocketRoom(room.id)).emit(SOCKET_EVENTS.GAME.STARTED, { status: 'playing', roomId: room.id });
    this.emitRoom(room);
  }

  private publicState(room: GameRoom): RoomPublicState {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      playerCount: room.players.size,
      minPlayers: this.activeMinPlayers(),
      maxPlayers: MAX_PLAYERS,
      countdownSeconds: room.countdownEndsAt
        ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000))
        : null,
      players: [...room.players.values()].map(member => ({
        userId: member.userId,
        username: member.username,
        connected: member.socketId !== null,
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
    if (this.server) this.server.to('lobby').emit(SOCKET_EVENTS.LOBBY.ROOMS_UPDATED, this.list());
  }

  private resetRound(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'finished') return;
    room.roundResetTimer = undefined;
    this.releaseFinishedRoom(room);
  }

  private destroy(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.countdownTimer) clearInterval(room.countdownTimer);
    if (room.roundResetTimer) clearTimeout(room.roundResetTimer);
    for (const userId of room.players.keys()) {
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
      this.userRoom.delete(member.userId);
      void this.redis.del(`presence:${member.userId}`);
      if (!member.socketId) continue;
      const socket = this.server.sockets.sockets.get(member.socketId);
      socket?.leave(socketRoom);
      socket?.emit(SOCKET_EVENTS.ROOM.LEFT, { reason: 'round_finished' });
    }
    this.gameLoop.remove(room.id);
    this.rooms.delete(room.id);
    void this.redis.del(`room:${room.id}`);
    this.emitLobby();
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
