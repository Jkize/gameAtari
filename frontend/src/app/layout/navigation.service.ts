import { Injectable, computed, inject } from '@angular/core';
import { environment } from '@env/environment';
import { EAuth } from '@core/auth/auth.models';
import { AuthService } from '@core/auth/auth.service';
import { UiVersionService } from '@core/ui/ui-version.service';

export interface NavTab {
  path: string;
  labelKey: string;
  icon: string;
  roles: EAuth[];
  v2Only?: boolean;
}

const NAV_TABS: NavTab[] = [
  { path: '/lobby', labelKey: 'nav.play', icon: 'ti-device-gamepad-2', roles: [EAuth.USER] },
  {
    path: '/garage',
    labelKey: 'nav.garage',
    icon: 'ti-settings-automation',
    roles: [EAuth.USER],
    v2Only: true,
  },
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
  private readonly uiVersion = inject(UiVersionService);

  readonly visibleTabs = computed<NavTab[]>(() => {
    const versionTabs = NAV_TABS.filter((tab) => !tab.v2Only || this.uiVersion.current() === 2);
    if (environment.devGameMode) return versionTabs;
    if (this.auth.isAdmin()) return versionTabs;
    const role = this.auth.role();
    return versionTabs.filter((tab) => tab.roles.includes(role));
  });
}
