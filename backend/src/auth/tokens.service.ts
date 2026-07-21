import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AccessTokenPayload, AuthenticatedUser, OnboardingTokenPayload } from '../common/auth.types';
import { LAST_CONNECTION_REFRESH_THROTTLE_MS } from '../config/auth.config';

interface RedisAuthSession {
  refreshHash: string;
  userId: string;
  provider: AuthProvider;
}

const ROTATE_SESSION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return { 0 }
end

local decoded, session = pcall(cjson.decode, raw)
if not decoded or type(session) ~= 'table' or session.refreshHash ~= ARGV[1] then
  redis.call('DEL', KEYS[1])
  return { -1 }
end

session.refreshHash = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(session), 'EX', ARGV[3])
return { 1, session.userId, session.provider }
`;

export interface RefreshCookieDescriptor {
  value: string;
  maxAge: number;
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
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
    const session: RedisAuthSession = {
      refreshHash: this.hash(refresh),
      userId: user.id,
      provider,
    };
    await this.redis.client.set(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      'EX',
      this.refreshTtlSeconds,
    );
    this.recordLastConnection(user.id);
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
    const nextRefresh = randomBytes(48).toString('base64url');
    const result = await this.redis.client.eval(
      ROTATE_SESSION_SCRIPT,
      1,
      this.sessionKey(sessionId),
      this.hash(provided),
      this.hash(nextRefresh),
      this.refreshTtlSeconds,
    );
    const [status, userId, rawProvider] = this.rotationResult(result);
    if (status !== 1) {
      throw new UnauthorizedException('Session expired or invalid');
    }
    if (!userId || !this.isAuthProvider(rawProvider)) {
      await this.revoke(sessionId);
      throw new UnauthorizedException('Session expired or invalid');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, active: true, lastConnectionAt: true },
    });
    if (!user?.username || !user.active) {
      await this.revoke(sessionId);
      throw new UnauthorizedException('Session expired or invalid');
    }
    // Access tokens are refreshed every ~15min while the app is open, so only
    // touch lastConnectionAt when it's actually gone stale to avoid a DB write per refresh.
    if (!user.lastConnectionAt || Date.now() - user.lastConnectionAt.getTime() >= LAST_CONNECTION_REFRESH_THROTTLE_MS) {
      this.recordLastConnection(user.id);
    }
    const accessToken = await this.signAccess(
      user.id,
      user.username,
      rawProvider,
      user.role,
      sessionId,
    );
    return {
      accessToken,
      refreshCookie: {
        value: `${sessionId}.${nextRefresh}`,
        maxAge: this.refreshTtlSeconds * 1000,
      },
    };
  }

  async authenticateAccess(token: string): Promise<AuthenticatedUser> {
    const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid access token');
    const active = await this.redis.client.exists(this.sessionKey(payload.sid));
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
    await this.redis.client.del(this.sessionKey(sessionId));
  }

  // Bookkeeping only — fire-and-forget, must never fail the caller.
  private recordLastConnection(userId: string): void {
    this.prisma.user.update({
      where: { id: userId },
      data: { lastConnectionAt: new Date() },
    }).catch(error => this.logger.warn(`Failed to record lastConnectionAt for user ${userId}: ${error}`));
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

  private sessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private rotationResult(result: unknown): [number, string?, string?] {
    if (!Array.isArray(result)) return [0];
    const status = Number(result[0]);
    const userId = typeof result[1] === 'string' ? result[1] : undefined;
    const provider = typeof result[2] === 'string' ? result[2] : undefined;
    return [status, userId, provider];
  }

  private isAuthProvider(value?: string): value is AuthProvider {
    return value != null && Object.values(AuthProvider).includes(value as AuthProvider);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
