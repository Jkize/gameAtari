import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(scope: string, identity: string, limit: number, windowSeconds: number): Promise<void> {
    const key = `rate:${scope}:${identity}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, windowSeconds);
    if (count > limit) {
      throw new HttpException('Too many authentication attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
