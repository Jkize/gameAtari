import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthProvider } from '@prisma/client';
import { AuthenticatedUser, EAuth } from '../common/auth.types';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { RolesGuard } from './roles.guard';
import { TokensService } from './tokens.service';

describe('RolesGuard', () => {
  const createContext = (headers: Record<string, string> = {}) => {
    const request: { headers: Record<string, string>; user?: AuthenticatedUser } = { headers };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  const createHarness = (options: {
    isPublic?: boolean;
    allowRoles?: EAuth[];
    role?: EAuth;
  } = {}) => {
    const authenticatedUser: AuthenticatedUser = {
      userId: 'user-1',
      sessionId: 'session-1',
      username: 'Pilot_1',
      provider: AuthProvider.GOOGLE,
      role: options.role ?? EAuth.USER,
    };
    const tokens = { authenticateAccess: jest.fn(async () => authenticatedUser) };
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === IS_PUBLIC_KEY ? options.isPublic : options.allowRoles,
      ),
    };
    const guard = new RolesGuard(tokens as unknown as TokensService, reflector as unknown as Reflector);
    return { guard, tokens, authenticatedUser };
  };

  it('allows a @Public endpoint without a token', async () => {
    const { guard, tokens } = createHarness({ isPublic: true });
    const { context } = createContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokens.authenticateAccess).not.toHaveBeenCalled();
  });

  it('allows an authenticated USER on a default endpoint and populates request.user', async () => {
    const { guard, authenticatedUser } = createHarness();
    const { context, request } = createContext({ authorization: 'Bearer token-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(authenticatedUser);
  });

  it('rejects a missing Authorization header', async () => {
    const { guard } = createHarness();
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed Authorization header', async () => {
    const { guard } = createHarness();
    const { context } = createContext({ authorization: 'Basic token-1' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a USER on an @Allow(ADMIN) endpoint', async () => {
    const { guard } = createHarness({ allowRoles: [EAuth.ADMIN], role: EAuth.USER });
    const { context } = createContext({ authorization: 'Bearer token-1' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an ADMIN on an @Allow(ADMIN) endpoint', async () => {
    const { guard } = createHarness({ allowRoles: [EAuth.ADMIN], role: EAuth.ADMIN });
    const { context } = createContext({ authorization: 'Bearer token-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows an ADMIN on a default USER endpoint', async () => {
    const { guard } = createHarness({ role: EAuth.ADMIN });
    const { context } = createContext({ authorization: 'Bearer token-1' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
