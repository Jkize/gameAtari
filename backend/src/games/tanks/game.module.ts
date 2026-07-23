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
import { MatchResultsRepository } from '../../matches/match-results.repository';
import { MatchesService } from '../../matches/matches.service';
import { RewardsModule } from '../../rewards/rewards.module';
import { SocketRateLimiterService } from './socket-rate-limiter.service';
import { PowerUpSpawnService } from './power-up-spawn.service';
import { DangerZoneService } from './danger-zone.service';
import { EliminationService } from './events/elimination.service';
import { GameEventPublisherService } from './events/game-event-publisher.service';
import { WatcherPresenceService } from './events/watcher-presence.service';
import { RuntimeModule } from '../../runtime/runtime.module';
import { TankCustomizationModule } from '../../tank-customization/tank-customization.module';

@Module({
  imports: [AuthModule, UsersModule, RewardsModule, RuntimeModule, TankCustomizationModule],
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
    MatchResultsRepository,
    MatchesService,
    SocketRateLimiterService,
    PowerUpSpawnService,
    DangerZoneService,
    EliminationService,
    GameEventPublisherService,
    WatcherPresenceService,
  ],
  exports: [GameSessionsService, GameLoopService, RoomsService],
})
export class GameModule {}
