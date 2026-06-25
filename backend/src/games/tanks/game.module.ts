import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GameLoopService } from './game-loop.service';
import { MapService } from './maps/map.service';
import { CollisionService } from './collision.service';
import { WeaponService } from './weapons/weapon.service';
import { WeaponLaserService } from './weapons/weapon-laser.service';
import { WeaponGrenadeService } from './weapons/weapon-grenade.service';
import { AuthModule } from '../../auth/auth.module';
import { UsersModule } from '../../users/users.module';
import { GameRuntimeContext } from './runtime/game-runtime-context.service';
import { GameSessionsService } from './runtime/game-sessions.service';
import { RoomsService } from '../../rooms/rooms.service';
import { MatchesService } from '../../matches/matches.service';
import { RewardsService } from '../../rewards/rewards.service';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [
    GameGateway,
    GameService,
    GameLoopService,
    MapService,
    CollisionService,
    WeaponService,
    WeaponLaserService,
    WeaponGrenadeService,
    GameRuntimeContext,
    GameSessionsService,
    RoomsService,
    MatchesService,
    RewardsService,
  ],
  exports: [GameSessionsService],
})
export class GameModule {}
