import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class PublicRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();
  private static readonly LIMIT = 30;
  private static readonly WINDOW_MS = 60_000;

  check(ip: string): void {
    const now = Date.now();
    const bucket = this.buckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(ip, { count: 1, resetAt: now + PublicRateLimiterService.WINDOW_MS });
      this.evictStale(now);
      return;
    }

    bucket.count++;
    if (bucket.count > PublicRateLimiterService.LIMIT) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private evictStale(now: number): void {
    if (this.buckets.size < 5_000) return;
    for (const [ip, bucket] of this.buckets) {
      if (now > bucket.resetAt) this.buckets.delete(ip);
    }
  }
}
