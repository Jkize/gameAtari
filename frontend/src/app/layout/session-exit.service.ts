import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { socketManager } from '@core/realtime/socket';
import { ThemeService } from '@core/theme/theme.service';
import { UiVersionService } from '@core/ui/ui-version.service';

@Injectable({ providedIn: 'root' })
export class SessionExitService {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly uiVersion = inject(UiVersionService);

  async signOut(): Promise<void> {
    socketManager.disconnect();
    await this.auth.logout();
    this.uiVersion.clearOverride();
    this.theme.set(this.theme.current());
    await this.router.navigateByUrl('/login');
  }
}
