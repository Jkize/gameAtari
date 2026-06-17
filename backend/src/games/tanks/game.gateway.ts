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
import { MapService } from './map.service';
import { PlayerInput } from './types/player.types';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

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
    this.gameService.removePlayer(client.id);
    this.server.emit('playerDisconnected', { id: client.id });
  }

  @SubscribeMessage('joinGame')
  handleJoinGame(@ConnectedSocket() client: Socket): void {
    const player = this.gameService.addPlayer(client.id);
    client.emit('gameJoined', {
      playerId: player.id,
      map: this.gameService.map,
      status: this.gameService.status,
    });
    console.log(`[joinGame] ${client.id}`);
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
}
