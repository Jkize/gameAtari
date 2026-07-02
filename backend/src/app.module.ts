import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DevelopmentSettingsModule } from './config/development-settings.module';
import { envValidationSchema } from './config/env.validation';
import { GameModule } from './games/tanks/game.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: envValidationSchema,
    }),
    DevelopmentSettingsModule,
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    GameModule,
    StatsModule,
  ],
})
export class AppModule {}
