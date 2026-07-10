import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { socketManager } from '../network/socket';

@Injectable({ providedIn: 'root' })
export class SessionExitService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    socketManager.disconnect();
    await this.auth.logout();
    await this.router.navigateByUrl('/auth');
  }
}
