import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { socketManager } from '@core/realtime/socket';

@Injectable({ providedIn: 'root' })
export class SessionExitService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    socketManager.disconnect();
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
