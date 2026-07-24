import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService } from '@core/auth/auth.service';
import {
  PagedResult,
  PersonalMatchHistoryItem,
  PublicMatchDetail,
  PublicMatchHistoryItem,
  RewardsConfig,
  WalletStatus,
} from './rewards.models';

@Injectable({ providedIn: 'root' })
export class RewardsService {
  private configRequest?: Observable<RewardsConfig>;

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  getConfig(): Observable<RewardsConfig> {
    this.configRequest ??= this.http
      .get<RewardsConfig>(`${environment.backendUrl}/rewards/config`)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.configRequest;
  }

  getWalletStatus(): Observable<WalletStatus> {
    return this.http.get<WalletStatus>(`${environment.backendUrl}/wallets/me`, {
      headers: this.authHeaders(),
      withCredentials: true,
    });
  }

  getMyMatches(cursor?: string | null): Observable<PagedResult<PersonalMatchHistoryItem>> {
    return this.http.get<PagedResult<PersonalMatchHistoryItem>>(`${environment.backendUrl}/rewards/me/history`, {
      headers: this.authHeaders(),
      params: this.cursorParams(cursor),
      withCredentials: true,
    });
  }

  getRecentMatches(cursor?: string | null): Observable<PagedResult<PublicMatchHistoryItem>> {
    return this.http.get<PagedResult<PublicMatchHistoryItem>>(`${environment.backendUrl}/rewards/matches/recent`, {
      headers: this.authHeaders(),
      params: this.cursorParams(cursor),
      withCredentials: true,
    });
  }

  getMatchDetail(matchId: string): Observable<PublicMatchDetail> {
    return this.http.get<PublicMatchDetail>(
      `${environment.backendUrl}/rewards/me/matches/${encodeURIComponent(matchId)}`,
      {
        headers: this.authHeaders(),
        withCredentials: true,
      },
    );
  }

  private cursorParams(cursor?: string | null): HttpParams {
    return cursor ? new HttpParams().set('cursor', cursor) : new HttpParams();
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
