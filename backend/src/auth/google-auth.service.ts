import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';
import { TokensService } from './tokens.service';

@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {
    this.clientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId);
  }

  async login(idToken: string) {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account is not verified');
    }
    const user = await this.users.upsertGoogle({
      subject: payload.sub,
      email: payload.email,
      avatarUrl: payload.picture,
    });
    if (!user.username) {
      return {
        requiresUsername: true,
        onboardingToken: await this.tokens.issueOnboarding(user.id, AuthProvider.GOOGLE),
      };
    }
    return {
      requiresUsername: false,
      ...(await this.tokens.issueSession(user, AuthProvider.GOOGLE)),
      user,
    };
  }
}
