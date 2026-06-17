import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GameLoopService } from './game-loop.service';
import { MapService } from './map.service';
import { CollisionService } from './collision.service';

@Module({
  providers: [GameGateway, GameService, GameLoopService, MapService, CollisionService],
})
export class GameModule {}
