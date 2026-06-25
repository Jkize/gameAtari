export interface AuthUser {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface LoginResponse {
  requiresUsername: boolean;
  accessToken?: string;
  onboardingToken?: string;
  user?: AuthUser;
}

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string };
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array }>;
}
