import { Module } from '@nestjs/common';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisService } from '../redis/redis.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: async (redis: RedisService) => {
        await redis.ensureConnected();
        return {
          throttlers: [
            { name: 'default', limit: 120, ttl: seconds(60) },
            { name: 'burst', limit: 30, ttl: seconds(20) },
            { name: 'sustained', limit: 300, ttl: seconds(600) },
          ],
          storage: new ThrottlerStorageRedisService(redis.client),
          errorMessage: 'Too many requests',
        };
      },
    }),
  ],
})
export class ThrottlerRedisModule {}
