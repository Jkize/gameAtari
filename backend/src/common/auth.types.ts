import { AuthProvider } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  username: string;
  provider: AuthProvider;
  type: 'access';
}

export interface OnboardingTokenPayload {
  sub: string;
  provider: AuthProvider;
  type: 'onboarding';
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  username: string;
  provider: AuthProvider;
}
