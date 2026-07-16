import { Controller, HttpCode, Post } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { TutorialStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/auth.types';
import { RequestUser } from '../common/request-user.decorator';
import { UsersService } from './users.service';

@Controller('tutorial')
export class TutorialController {
  constructor(private readonly users: UsersService) {}

  @Post('complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  complete(@RequestUser() auth: AuthenticatedUser) {
    return this.users.finishTutorial(auth.userId, TutorialStatus.COMPLETED);
  }

  @Post('skip')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  skip(@RequestUser() auth: AuthenticatedUser) {
    return this.users.finishTutorial(auth.userId, TutorialStatus.SKIPPED);
  }
}
