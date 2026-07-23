import { Injectable, computed, inject } from '@angular/core';
import { environment } from '@env/environment';
import { EAuth } from '@core/auth/auth.models';
import { AuthService } from '@core/auth/auth.service';

export interface NavTab {
  path: string;
  labelKey: string;
  icon: string;
  roles: EAuth[];
}

const NAV_TABS: NavTab[] = [
  { path: '/lobby', labelKey: 'nav.play', icon: 'ti-device-gamepad-2', roles: [EAuth.USER] },
  { path: '/matches/me', labelKey: 'nav.myMatches', icon: 'ti-history', roles: [EAuth.USER] },
  {
    path: '/matches/recent',
    labelKey: 'nav.recentMatches',
    icon: 'ti-trophy',
    roles: [EAuth.USER],
  },
  { path: '/users', labelKey: 'nav.users', icon: 'ti-users', roles: [EAuth.ADMIN] },
  { path: '/stats', labelKey: 'nav.serverStats', icon: 'ti-activity', roles: [EAuth.ADMIN] },
];

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly auth = inject(AuthService);

  readonly visibleTabs = computed<NavTab[]>(() => {
    if (environment.devGameMode) return NAV_TABS;
    if (this.auth.isAdmin()) return NAV_TABS;
    const role = this.auth.role();
    return NAV_TABS.filter((tab) => tab.roles.includes(role));
  });
}
