import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser, EAuth } from '../common/auth.types';
import { ALLOW_ROLES_KEY } from './decorators/allow.decorator';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { TokensService } from './tokens.service';

const JWT_VERIFICATION_ERROR_NAMES = new Set([
  'JsonWebTokenError',
  'NotBeforeError',
  'TokenExpiredError',
]);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing access token');

    let user: AuthenticatedUser;
    try {
      user = await this.tokens.authenticateAccess(token);
    } catch (error) {
      if (error instanceof Error && JWT_VERIFICATION_ERROR_NAMES.has(error.name)) {
        throw new UnauthorizedException('Invalid or expired access token');
      }
      throw error;
    }
    request.user = user;

    const requiredRoles = this.reflector.getAllAndOverride<EAuth[]>(ALLOW_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [EAuth.USER];

    if (!this.satisfies(user, requiredRoles)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }

  private satisfies(user: AuthenticatedUser, requiredRoles: EAuth[]): boolean {
    // ADMIN satisfies every requirement; USER satisfies only USER.
    if (user.role === EAuth.ADMIN) return true;
    return requiredRoles.includes(user.role);
  }
}
