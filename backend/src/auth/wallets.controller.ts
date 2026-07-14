import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { RequestUser } from '../common/request-user.decorator';
import { AuthenticatedUser } from '../common/auth.types';
import { UsersService } from '../users/users.service';
import { PhantomAuthService } from './phantom-auth.service';
import { PhantomVerifyDto } from './dto/auth.dto';
import { WalletsService } from './wallets.service';

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly phantom: PhantomAuthService,
    private readonly users: UsersService,
  ) {}

  @Get('me')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  me(@RequestUser() auth: AuthenticatedUser) {
    return this.wallets.statusForUser(auth.userId, auth.provider);
  }

  @Post('phantom/link')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async linkPhantom(@Body() dto: PhantomVerifyDto, @RequestUser() auth: AuthenticatedUser) {
    await this.phantom.verifyChallenge(dto.publicKey, dto.message, dto.signature);
    await this.users.linkPhantomWallet(auth.userId, dto.publicKey, dto.message);
    return this.wallets.statusForUser(auth.userId, auth.provider);
  }
}
