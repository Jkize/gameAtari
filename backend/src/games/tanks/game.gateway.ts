import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { GameLoopService } from './game-loop.service';
import { MapService } from './maps/map.service';
import { PlayerInput } from './types/player.types';
import { PLAYER_ROOM, WATCHER_ROOM } from './socket-rooms';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gameService: GameService,
    private readonly gameLoopService: GameLoopService,
    private readonly mapService: MapService,
  ) {}

  afterInit(server: Server): void {
    this.gameLoopService.setServer(server);
    if (!this.gameService.map) {
      this.gameService.map = this.mapService.createMap();
    }
  }

  handleConnection(client: Socket): void {
    console.log(`[connect] ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    console.log(`[disconnect] ${client.id}`);
    const wasPlayer = this.gameService.players.has(client.id);
    this.gameService.removePlayer(client.id);
    if (wasPlayer) {
      this.server.to(PLAYER_ROOM).to(WATCHER_ROOM).emit('playerDisconnected', { playerId: client.id });
    }
  }

  @SubscribeMessage('joinGame')
  handleJoinGame(@ConnectedSocket() client: Socket): void {
    client.leave(WATCHER_ROOM);
    client.join(PLAYER_ROOM);

    const player = this.gameService.addPlayer(client.id);
    client.emit('gameJoined', {
      playerId: player.id,
      map: this.gameService.map,
      status: this.gameService.status,
    });
    console.log(`[joinGame] ${client.id}`);
  }

  @SubscribeMessage('watchGame')
  handleWatchGame(@ConnectedSocket() client: Socket): void {
    const wasPlayer = this.gameService.players.has(client.id);
    if (wasPlayer) {
      this.gameService.removePlayer(client.id);
      this.server.to(PLAYER_ROOM).to(WATCHER_ROOM).emit('playerDisconnected', { playerId: client.id });
    }

    client.leave(PLAYER_ROOM);
    client.join(WATCHER_ROOM);

    client.emit('watchJoined', {
      watcherId: client.id,
      map: this.gameService.map,
      status: this.gameService.status,
    });
    client.emit('gameState', this.gameLoopService.buildState());
    console.log(`[watchGame] ${client.id}`);
  }

  @SubscribeMessage('playerInput')
  handlePlayerInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: Partial<PlayerInput>,
  ): void {
    this.gameService.applyInput(client.id, input);
  }

  @SubscribeMessage('startGame')
  handleStartGame(): void {
    if (this.gameService.status !== 'waiting') return;
    this.gameLoopService.start();
    this.server.emit('gameStarted', { status: 'playing' });
    console.log('[startGame] Game started');
  }

  @SubscribeMessage('restartGame')
  async handleRestartGame(): Promise<void> {
    if (this.gameService.status !== 'finished') return;

    this.gameLoopService.stop();
    this.gameService.reset();
    this.gameService.map = this.mapService.createMap();

    const playerSockets = await this.server.in(PLAYER_ROOM).fetchSockets();
    for (const client of playerSockets) {
      const player = this.gameService.addPlayer(client.id);
      client.emit('gameJoined', {
        playerId: player.id,
        map: this.gameService.map,
        status: this.gameService.status,
      });
    }

    this.server.to(WATCHER_ROOM).emit('watchJoined', {
      map: this.gameService.map,
      status: this.gameService.status,
    });
    this.server.to(WATCHER_ROOM).emit('gameState', this.gameLoopService.buildState());

    console.log('[restartGame] Game reset');
  }
}
