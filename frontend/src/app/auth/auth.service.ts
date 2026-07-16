import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import bs58 from 'bs58';
import { environment } from '../../environments/environment';
import { AccountStatus, AuthProvider, AuthUser, EAuth, LoginResponse, PhantomProvider, TutorialStatus } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly onboardingToken = signal<string | null>(null);
  readonly role = computed<EAuth>(() => this.user()?.role ?? EAuth.USER);
  readonly isAdmin = computed(() => this.role() === EAuth.ADMIN);
  readonly tutorialPending = computed(() => this.user()?.tutorialStatus === 'PENDING');
  private sessionRestorePromise: Promise<boolean> | null = null;

  constructor(private readonly http: HttpClient) {}

  async loginGoogle(idToken: string): Promise<LoginResponse> {
    return this.acceptLogin(await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.backendUrl}/auth/google`, { idToken }, {
        withCredentials: true,
      }),
    ));
  }

  async loginPhantom(): Promise<LoginResponse> {
    const { publicKey, message, signature } = await this.signPhantomChallenge();
    return this.acceptLogin(await firstValueFrom(this.http.post<LoginResponse>(
      `${environment.backendUrl}/auth/phantom/verify`,
      { publicKey, message, signature },
      { withCredentials: true },
    )));
  }

  async linkPhantom(): Promise<AccountStatus> {
    const token = this.accessToken();
    if (!token) throw new Error('Missing access token');
    const { publicKey, message, signature } = await this.signPhantomChallenge();
    return firstValueFrom(this.http.post<AccountStatus>(
      `${environment.backendUrl}/wallets/phantom/link`,
      { publicKey, message, signature },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      },
    ));
  }

  async linkGoogle(idToken: string): Promise<AccountStatus> {
    const token = this.accessToken();
    if (!token) throw new Error('Missing access token');
    return firstValueFrom(this.http.post<AccountStatus>(
      `${environment.backendUrl}/account/google/link`,
      { idToken },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      },
    ));
  }

  async completeProfile(username: string): Promise<void> {
    const token = this.onboardingToken();
    if (!token) throw new Error('No onboarding session is active');
    const response = await firstValueFrom(this.http.post<{ accessToken: string; user: AuthUser }>(
      `${environment.backendUrl}/auth/complete-profile`,
      { username },
      {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      },
    ));
    this.onboardingToken.set(null);
    this.accessToken.set(response.accessToken);
    this.user.set(response.user);
  }

  authenticatedHomeUrl(): '/welcome' | '/lobby' {
    return this.tutorialPending() ? '/welcome' : '/lobby';
  }

  async finishTutorial(tutorialStatus: Extract<TutorialStatus, 'COMPLETED' | 'SKIPPED'>): Promise<void> {
    const token = this.accessToken();
    if (environment.devGameMode && !token) {
      this.user.update(user => user ? { ...user, tutorialStatus } : user);
      return;
    }
    if (!token) throw new Error('Missing access token');

    const endpoint = tutorialStatus === 'COMPLETED' ? 'complete' : 'skip';
    const response = await firstValueFrom(this.http.post<{
      tutorialStatus: TutorialStatus;
      tutorialFinishedAt: string;
    }>(`${environment.backendUrl}/tutorial/${endpoint}`, {}, {
      headers: { Authorization: `Bearer ${token}` },
      withCredentials: true,
    }));
    this.user.update(user => user ? { ...user, ...response } : user);
  }

  async ensureSession(): Promise<boolean> {
    if (this.isAccessTokenUsable(this.accessToken())) return true;
    if (this.sessionRestorePromise) return this.sessionRestorePromise;
    this.sessionRestorePromise = this.restoreSession();
    return this.sessionRestorePromise;
  }

  private async restoreSession(): Promise<boolean> {
    try {
      const response = await firstValueFrom(this.http.post<{ accessToken: string }>(
        `${environment.backendUrl}/auth/refresh`,
        {},
        { withCredentials: true },
      ));
      this.accessToken.set(response.accessToken);
      const user = await firstValueFrom(this.http.get<AuthUser>(`${environment.backendUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${response.accessToken}` },
        withCredentials: true,
      }));
      this.user.set(user);
      return true;
    } catch {
      this.accessToken.set(null);
      this.user.set(null);
      return false;
    } finally {
      this.sessionRestorePromise = null;
    }
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post(`${environment.backendUrl}/auth/logout`, {}, {
      withCredentials: true,
    })).catch(() => undefined);
    this.accessToken.set(null);
    this.user.set(null);
    this.onboardingToken.set(null);
    this.sessionRestorePromise = null;
  }

  private acceptLogin(response: LoginResponse): LoginResponse {
    if (response.requiresUsername && response.onboardingToken) {
      this.onboardingToken.set(response.onboardingToken);
    } else if (response.accessToken && response.user) {
      this.accessToken.set(response.accessToken);
      this.user.set(response.user);
    }
    return response;
  }

  currentProvider(): AuthProvider | null {
    const token = this.accessToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(this.decodeJwtPart(token.split('.')[1])) as { provider?: AuthProvider };
      return payload.provider === 'GOOGLE' || payload.provider === 'PHANTOM' ? payload.provider : null;
    } catch {
      return null;
    }
  }

  private isAccessTokenUsable(token: string | null): boolean {
    if (!token) return false;
    try {
      const payload = JSON.parse(this.decodeJwtPart(token.split('.')[1])) as { exp?: number };
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 30_000;
    } catch {
      return false;
    }
  }

  private decodeJwtPart(value: string | undefined): string {
    if (!value) throw new Error('Invalid JWT');
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return decodeURIComponent(
      Array.from(atob(padded))
        .map(character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
  }

  private async signPhantomChallenge(): Promise<{ publicKey: string; message: string; signature: string }> {
    const provider = this.phantomProvider();
    const connection = await provider.connect();
    const publicKey = connection.publicKey.toString();
    const challenge = await firstValueFrom(this.http.post<{ message: string }>(
      `${environment.backendUrl}/auth/phantom/challenge`,
      { publicKey },
      { withCredentials: true },
    ));
    const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), 'utf8');
    return {
      publicKey,
      message: challenge.message,
      signature: bs58.encode(signed.signature),
    };
  }

  private phantomProvider(): PhantomProvider {
    const provider = (window as Window & {
      phantom?: { solana?: PhantomProvider };
      solana?: PhantomProvider;
    }).phantom?.solana ?? (window as Window & { solana?: PhantomProvider }).solana;
    if (!provider?.isPhantom) throw new Error('Phantom Wallet is not installed');
    return provider;
  }

}
