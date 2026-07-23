import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService } from '@core/auth/auth.service';
import { PagedResult } from '@features/rewards/rewards.models';
import { AdminUserItem } from './users.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  getUsers(
    cursor?: string | null,
    sortBy?: 'createdAt' | 'lastConnectionAt',
    order?: 'asc' | 'desc',
  ): Observable<PagedResult<AdminUserItem>> {
    return this.http.get<PagedResult<AdminUserItem>>(`${environment.backendUrl}/users`, {
      headers: this.authHeaders(),
      params: this.listParams(cursor, sortBy, order),
      withCredentials: true,
    });
  }

  private listParams(
    cursor?: string | null,
    sortBy?: 'createdAt' | 'lastConnectionAt',
    order?: 'asc' | 'desc',
  ): HttpParams {
    let params = new HttpParams();
    if (cursor) params = params.set('cursor', cursor);
    if (sortBy) params = params.set('sortBy', sortBy);
    if (order) params = params.set('order', order);
    return params;
  }

  private authHeaders(): HttpHeaders {
    const token = this.auth.accessToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
