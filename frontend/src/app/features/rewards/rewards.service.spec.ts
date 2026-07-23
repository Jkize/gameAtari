import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '@core/auth/auth.service';
import { RewardsService } from './rewards.service';
import { environment } from '@env/environment';

describe('RewardsService', () => {
  let service: RewardsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken: () => 'token-1' } },
      ],
    });
    service = TestBed.inject(RewardsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads personal history with auth header', () => {
    service.getMyMatches().subscribe();
    const req = http.expectOne(`${environment.backendUrl}/rewards/me/history`);

    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush({ items: [] });
  });

  it('loads public history', () => {
    service.getRecentMatches().subscribe();
    const req = http.expectOne(`${environment.backendUrl}/rewards/matches/recent`);

    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ items: [] });
  });
});
