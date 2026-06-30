import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokensService } from '../auth/tokens.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const header = request.headers['authorization'];
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing access token');

    const user = await this.tokens.authenticateAccess(token);
    request.user = user;

    const adminIds = this.config
      .get<string>('ADMIN_USER_IDS', '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (!adminIds.includes(user.userId)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
