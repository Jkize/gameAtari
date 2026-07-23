import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from '@shared/ui/language-switcher/language-switcher.component';
import { UserMenuComponent } from '../user-menu/user-menu.component';
import { MobileNavigationComponent } from '../mobile-navigation/mobile-navigation.component';
import { MobileNavStateService } from '../mobile-nav-state.service';
import { AccountSettingsComponent } from '@features/account/account-settings/account-settings.component';
import { AccountModalStateService } from '@features/account/account-modal-state.service';
import { AccountRefreshService } from '@features/account/account-refresh.service';
import { NavigationService } from '../navigation.service';
import { TokenCaComponent } from '@shared/ui/token-ca/token-ca.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    LanguageSwitcherComponent,
    UserMenuComponent,
    MobileNavigationComponent,
    AccountSettingsComponent,
    TokenCaComponent,
  ],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css',
})
export class AppHeaderComponent {
  readonly accountModal = inject(AccountModalStateService);
  readonly accountRefresh = inject(AccountRefreshService);
  readonly nav = inject(NavigationService);

  constructor(readonly mobileNavState: MobileNavStateService) {}
}
