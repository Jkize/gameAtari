export type AuthProvider = 'GOOGLE' | 'PHANTOM';

export interface AuthUser {
  id: string;
  username: string;
  avatarUrl?: string;
  wallet?: {
    linked: boolean;
    verified: boolean;
  };
}

export interface LoginResponse {
  requiresUsername: boolean;
  accessToken?: string;
  onboardingToken?: string;
  user?: AuthUser;
}

export interface AccountStatus {
  currentProvider: AuthProvider;
  phantom: {
    linked: boolean;
    verified: boolean;
    addressPreview?: string;
  };
  google: {
    linked: boolean;
  };
  holder: {
    status: 'unknown' | 'eligible' | 'insufficient' | 'unavailable';
    requiredTokens: number;
    balance?: string;
    checkedAt?: string;
    message: string;
  };
}

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array }>;
}
