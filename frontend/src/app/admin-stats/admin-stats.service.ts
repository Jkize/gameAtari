import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { HistoricalRuntimeMetric } from './admin-stats.types';

@Injectable({ providedIn: 'root' })
export class AdminStatsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  history(hours = 24): Promise<HistoricalRuntimeMetric[]> {
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    return firstValueFrom(this.http.get<HistoricalRuntimeMetric[]>(
      `${environment.backendUrl}/admin/stats/history`,
      { params: { from: from.toISOString(), to: to.toISOString() }, headers: this.headers() },
    ));
  }

  flush(): Promise<{ inserted: number }> {
    return firstValueFrom(this.http.post<{ inserted: number }>(
      `${environment.backendUrl}/admin/stats/flush`, {}, { headers: this.headers() },
    ));
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.accessToken() ?? ''}` });
  }
}
