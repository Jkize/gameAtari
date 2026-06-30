import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PublicStats {
  playersOnline: number;
  activeMatches: number;
  availableRooms: number;
}

@Injectable({ providedIn: 'root' })
export class PublicStatsService {
  constructor(private readonly http: HttpClient) {}

  getPublicStats(): Observable<PublicStats> {
    return this.http.get<PublicStats>(`${environment.backendUrl}/stats/public`);
  }
}
