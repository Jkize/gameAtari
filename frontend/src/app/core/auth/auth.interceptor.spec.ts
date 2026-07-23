import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;
  let accessToken: string | null;
  let auth: {
    accessToken: ReturnType<typeof vi.fn>;
    ensureSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    accessToken = 'expired-token';
    auth = {
      accessToken: vi.fn(() => accessToken),
      ensureSession: vi.fn(async () => {
        accessToken = 'refreshed-token';
        return true;
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('adds the current access token to backend requests', () => {
    httpClient.get(`${environment.backendUrl}/wallets/me`).subscribe();
    const request = httpTesting.expectOne(`${environment.backendUrl}/wallets/me`);

    expect(request.request.headers.get('Authorization')).toBe('Bearer expired-token');
    request.flush({});
  });

  it('refreshes after a 401 and retries once with the new access token', async () => {
    const responsePromise = firstValueFrom(
      httpClient.get<{ ok: boolean }>(`${environment.backendUrl}/wallets/me`),
    );
    const initialRequest = httpTesting.expectOne(`${environment.backendUrl}/wallets/me`);
    initialRequest.flush({}, { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();
    const retriedRequest = httpTesting.expectOne(`${environment.backendUrl}/wallets/me`);
    expect(auth.ensureSession).toHaveBeenCalledTimes(1);
    expect(auth.ensureSession).toHaveBeenCalledWith(true);
    expect(retriedRequest.request.headers.get('Authorization')).toBe('Bearer refreshed-token');
    retriedRequest.flush({ ok: true });

    await expect(responsePromise).resolves.toEqual({ ok: true });
  });

  it('reuses a token already refreshed by another request', async () => {
    const responsePromise = firstValueFrom(
      httpClient.get<{ ok: boolean }>(`${environment.backendUrl}/wallets/me`),
    );
    const initialRequest = httpTesting.expectOne(`${environment.backendUrl}/wallets/me`);
    accessToken = 'already-refreshed-token';
    initialRequest.flush({}, { status: 401, statusText: 'Unauthorized' });

    const retriedRequest = httpTesting.expectOne(`${environment.backendUrl}/wallets/me`);
    expect(auth.ensureSession).not.toHaveBeenCalled();
    expect(retriedRequest.request.headers.get('Authorization')).toBe('Bearer already-refreshed-token');
    retriedRequest.flush({ ok: true });

    await expect(responsePromise).resolves.toEqual({ ok: true });
  });

  it('does not intercept a failed authentication endpoint', async () => {
    const responsePromise = firstValueFrom(
      httpClient.post(`${environment.backendUrl}/auth/refresh`, {}, { withCredentials: true }),
    ).catch(error => error);
    const request = httpTesting.expectOne(`${environment.backendUrl}/auth/refresh`);

    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(responsePromise).resolves.toBeInstanceOf(HttpErrorResponse);
    expect(auth.ensureSession).not.toHaveBeenCalled();
  });
});
