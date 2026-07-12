import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
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
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  getConfig(): Observable<RewardsConfig> {
    return this.http.get<RewardsConfig>(`${environment.backendUrl}/rewards/config`);
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
      params: this.cursorParams(cursor),
    });
  }

  getMatchDetail(matchId: string): Observable<PublicMatchDetail> {
    return this.http.get<PublicMatchDetail>(`${environment.backendUrl}/rewards/matches/${encodeURIComponent(matchId)}`);
  }

  private cursorParams(cursor?: string | null): HttpParams {
    return cursor ? new HttpParams().set('cursor', cursor) : new HttpParams();
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
