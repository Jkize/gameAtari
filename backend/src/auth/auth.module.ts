import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { PhantomAuthService } from './phantom-auth.service';
import { AuthRateLimitService } from './rate-limit.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    TokensService,
    GoogleAuthService,
    PhantomAuthService,
    AuthRateLimitService,
    AccessTokenGuard,
  ],
  exports: [TokensService, AccessTokenGuard],
})
export class AuthModule {}
