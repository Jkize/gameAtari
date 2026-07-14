import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { PagedResult } from '../rewards/rewards.models';
import { AdminUserItem } from './users.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  getUsers(cursor?: string | null): Observable<PagedResult<AdminUserItem>> {
    return this.http.get<PagedResult<AdminUserItem>>(`${environment.backendUrl}/users`, {
      headers: this.authHeaders(),
      params: this.cursorParams(cursor),
      withCredentials: true,
    });
  }

  private cursorParams(cursor?: string | null): HttpParams {
    return cursor ? new HttpParams().set('cursor', cursor) : new HttpParams();
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
