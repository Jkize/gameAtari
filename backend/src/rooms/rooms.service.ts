import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { GameLoopService } from '../games/tanks/game-loop.service';
import { RedisService } from '../redis/redis.service';
import { GameRoom, RoomMember, RoomPublicState } from './room.types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 15;
const COUNTDOWN_SECONDS = 45;
const FULL_COUNTDOWN_SECONDS = 10;
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
  ) {}

  setServer(server: Server): void {
    this.server = server;
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
      .sort((a, b) => a.createdAt - b.createdAt)[0] ?? this.createRoomInternal();
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
    this.server.to(this.playerSocketRoom(room.id)).emit('playerDisconnected', { playerId: userId, reason });
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
    this.server.to(this.playerSocketRoom(room.id)).emit('game:ended', {
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
    if (member.socketId && member.socketId !== socket.id) {
      this.server.sockets.sockets.get(member.socketId)?.disconnect(true);
    }
    member.socketId = socket.id;
    member.disconnectedAt = undefined;
    socket.data.roomId = room.id;
    socket.join(this.playerSocketRoom(room.id));
    void this.redis.set(`presence:${userId}`, room.id, 'EX', 60);
    if (room.status === 'in_game' && this.gameLoop.hasSession(room.id)) {
      const state = this.gameLoop.buildState(room.id);
      socket.emit('gameJoined', { playerId: userId, map: state.map, status: state.status, roomId: room.id });
      socket.emit('gameState', state);
    }
    this.emitRoom(room);
    return this.publicState(room);
  }

  private updateCountdown(room: GameRoom): void {
    if (room.status === 'in_game' || room.status === 'finished') return;
    if (room.players.size < MIN_PLAYERS) {
      if (room.countdownTimer) clearInterval(room.countdownTimer);
      room.countdownTimer = undefined;
      room.countdownEndsAt = undefined;
      if (room.status === 'countdown') {
        room.status = 'waiting';
        this.server.to(this.playerSocketRoom(room.id)).emit('room:countdownCancelled', this.publicState(room));
      }
      return;
    }
    const desiredSeconds = room.players.size >= MAX_PLAYERS ? FULL_COUNTDOWN_SECONDS : COUNTDOWN_SECONDS;
    const desiredEnd = Date.now() + desiredSeconds * 1000;
    if (room.status !== 'countdown') {
      room.status = 'countdown';
      room.countdownEndsAt = desiredEnd;
      this.server.to(this.playerSocketRoom(room.id)).emit('room:countdownStarted', this.publicState(room));
      room.countdownTimer = setInterval(() => this.tickCountdown(room.id), 1000);
    } else if (room.players.size >= MAX_PLAYERS && (room.countdownEndsAt ?? desiredEnd) > desiredEnd) {
      room.countdownEndsAt = desiredEnd;
    }
  }

  private tickCountdown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'countdown' || !room.countdownEndsAt) return;
    if (room.players.size < MIN_PLAYERS) {
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
    this.server.to(this.playerSocketRoom(room.id)).emit('room:countdownUpdated', state);
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
    const state = this.gameLoop.buildState(room.id);
    for (const member of room.players.values()) {
      if (!member.socketId) continue;
      const socket = this.server.sockets.sockets.get(member.socketId);
      socket?.emit('gameJoined', {
        playerId: member.userId,
        roomId: room.id,
        map: state.map,
        status: state.status,
      });
    }
    this.server.to(this.playerSocketRoom(room.id)).emit('gameStarted', { status: 'playing', roomId: room.id });
    this.emitRoom(room);
  }

  private publicState(room: GameRoom): RoomPublicState {
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      playerCount: room.players.size,
      minPlayers: MIN_PLAYERS,
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
    this.server.to(this.playerSocketRoom(room.id)).emit('room:stateUpdated', state);
    void this.redis.set(`room:${room.id}`, JSON.stringify(state), 'EX', 180);
    this.emitLobby();
  }

  private emitLobby(): void {
    if (this.server) this.server.to('lobby').emit('lobby:roomsUpdated', this.list());
  }

  private resetRound(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'finished') return;
    room.roundResetTimer = undefined;
    if (room.players.size === 0) {
      this.destroy(roomId);
      return;
    }

    this.gameLoop.stop(room.id);
    room.status = 'waiting';
    room.countdownEndsAt = undefined;
    const players = [...room.players.values()].map(member => ({
      userId: member.userId,
      username: member.username,
    }));
    this.gameLoop.prepare(room.id, players);
    this.updateCountdown(room);
    this.emitRoom(room);
    this.server.to(this.playerSocketRoom(room.id)).emit('room:returnedToLobby', this.publicState(room));
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
}
