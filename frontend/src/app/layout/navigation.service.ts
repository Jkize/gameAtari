import { Injectable, computed, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { EAuth } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';

export interface NavTab {
  path: string;
  labelKey: string;
  roles: EAuth[];
}

const NAV_TABS: NavTab[] = [
  { path: '/lobby', labelKey: 'nav.play', roles: [EAuth.USER] },
  { path: '/tutorial', labelKey: 'nav.tutorial', roles: [EAuth.USER] },
  { path: '/matches/me', labelKey: 'nav.myMatches', roles: [EAuth.USER] },
  { path: '/matches/recent', labelKey: 'nav.recentMatches', roles: [EAuth.USER] },
  { path: '/users', labelKey: 'nav.users', roles: [EAuth.ADMIN] },
];

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly auth = inject(AuthService);

  readonly visibleTabs = computed<NavTab[]>(() => {
    if (environment.devGameMode) return NAV_TABS;
    if (this.auth.isAdmin()) return NAV_TABS;
    const role = this.auth.role();
    return NAV_TABS.filter(tab => tab.roles.includes(role));
  });
}
