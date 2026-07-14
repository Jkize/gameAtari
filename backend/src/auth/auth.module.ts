import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { SolanaModule } from '../solana/solana.module';
import { UsersModule } from '../users/users.module';
import { AccountController } from './account.controller';
import { AuthController } from './auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { PhantomAuthService } from './phantom-auth.service';
import { RolesGuard } from './roles.guard';
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
    WalletsService,
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokensService],
})
export class AuthModule {}
