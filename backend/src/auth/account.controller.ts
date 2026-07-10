import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { RequestUser } from '../common/request-user.decorator';
import { AuthenticatedUser } from '../common/auth.types';
import { UsersService } from '../users/users.service';
import { AccessTokenGuard } from './access-token.guard';
import { GoogleAuthService } from './google-auth.service';
import { GoogleLoginDto } from './dto/auth.dto';
import { WalletsService } from './wallets.service';

@Controller('account')
@UseGuards(AccessTokenGuard)
export class AccountController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly users: UsersService,
    private readonly wallets: WalletsService,
  ) {}

  @Post('google/link')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: seconds(60) } })
  async linkGoogle(@Body() dto: GoogleLoginDto, @RequestUser() auth: AuthenticatedUser) {
    const identity = await this.google.verifyIdentity(dto.idToken);
    await this.users.linkGoogleAccount(auth.userId, {
      subject: identity.sub,
      email: identity.email,
      avatarUrl: identity.picture,
    });
    return this.wallets.statusForUser(auth.userId, auth.provider);
  }
}
