import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AccessTokenPayload, AuthenticatedUser, OnboardingTokenPayload } from '../common/auth.types';

export interface RefreshCookieDescriptor {
  value: string;
  maxAge: number;
}

@Injectable()
export class TokensService {
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.refreshTtlSeconds = this.config.get<number>('AUTH_REFRESH_TTL_SECONDS', 604800);
  }

  async issueOnboarding(userId: string, provider: AuthProvider): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, provider, type: 'onboarding' } satisfies OnboardingTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ONBOARDING_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  async verifyOnboarding(token: string): Promise<OnboardingTokenPayload> {
    const payload = await this.jwt.verifyAsync<OnboardingTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ONBOARDING_SECRET'),
    });
    if (payload.type !== 'onboarding') throw new UnauthorizedException('Invalid onboarding token');
    return payload;
  }

  async issueSession(
    user: { id: string; username: string | null; role: UserRole },
    provider: AuthProvider,
    sessionId: string = randomUUID(),
  ): Promise<{ accessToken: string; refreshCookie: RefreshCookieDescriptor }> {
    if (!user.username) throw new UnauthorizedException('Profile is incomplete');
    const refresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);
    await this.prisma.authSession.upsert({
      where: { id: sessionId },
      create: { id: sessionId, userId: user.id, provider, expiresAt },
      update: { expiresAt, revokedAt: null, provider },
    });
    await this.redis.client.set(
      this.refreshKey(sessionId),
      this.hash(refresh),
      'EX',
      this.refreshTtlSeconds,
    );
    const accessToken = await this.signAccess(user.id, user.username, provider, user.role, sessionId);
    return {
      accessToken,
      refreshCookie: {
        value: `${sessionId}.${refresh}`,
        maxAge: this.refreshTtlSeconds * 1000,
      },
    };
  }

  async rotate(rawCookie: string): Promise<{
    accessToken: string;
    refreshCookie: RefreshCookieDescriptor;
  }> {
    const [sessionId, provided] = rawCookie.split('.');
    if (!sessionId || !provided) throw new UnauthorizedException('Invalid refresh token');
    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.username) {
      throw new UnauthorizedException('Session expired');
    }
    const stored = await this.redis.client.get(this.refreshKey(sessionId));
    if (!stored || stored !== this.hash(provided)) {
      await this.revoke(sessionId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return this.issueSession(session.user, session.provider, sessionId);
  }

  async authenticateAccess(token: string): Promise<AuthenticatedUser> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid access token');
    const active = await this.redis.client.exists(this.refreshKey(payload.sid));
    if (!active) throw new UnauthorizedException('Session is no longer active');
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      username: payload.username,
      provider: payload.provider,
      role: payload.role ?? UserRole.USER,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await Promise.all([
      this.redis.client.del(this.refreshKey(sessionId)),
      this.prisma.authSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private signAccess(userId: string, username: string, provider: AuthProvider, role: UserRole, sid: string) {
    return this.jwt.signAsync(
      { sub: userId, username, provider, role, sid, type: 'access' } satisfies AccessTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as never,
      },
    );
  }

  private refreshKey(sessionId: string): string {
    return `auth:refresh:${sessionId}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
