import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GameLoopService } from './game-loop.service';
import { MapService } from './map.service';
import { CollisionService } from './collision.service';
import { WeaponService } from './weapons/weapon.service';
import { WeaponLaserService } from './weapons/weapon-laser.service';
import { WeaponGrenadeService } from './weapons/weapon-grenade.service';

@Module({
  providers: [
    GameGateway,
    GameService,
    GameLoopService,
    MapService,
    CollisionService,
    WeaponService,
    WeaponLaserService,
    WeaponGrenadeService,
  ],
})
export class GameModule {}
