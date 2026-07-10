import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SolanaModule } from '../solana/solana.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from './access-token.guard';
import { AccountController } from './account.controller';
import { AuthController } from './auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { PhantomAuthService } from './phantom-auth.service';
import { TokensService } from './tokens.service';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [JwtModule.register({}), UsersModule, SolanaModule],
  controllers: [AuthController, WalletsController, AccountController],
  providers: [
    TokensService,
    GoogleAuthService,
    PhantomAuthService,
    AccessTokenGuard,
    WalletsService,
  ],
  exports: [TokensService, AccessTokenGuard],
})
export class AuthModule {}
