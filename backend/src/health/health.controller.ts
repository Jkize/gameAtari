import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @SkipThrottle()
  @Get()
  health() {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }
}
