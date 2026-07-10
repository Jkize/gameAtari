import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcherComponent } from '../shared/language-switcher.component';
import { UserMenuComponent } from './user-menu.component';
import { MobileNavigationComponent } from './mobile-navigation.component';
import { MobileNavStateService } from './mobile-nav-state.service';
import { AccountSettingsComponent } from '../account/account-settings.component';
import { AccountModalStateService } from '../account/account-modal-state.service';
import { AccountRefreshService } from '../account/account-refresh.service';

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
  ],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css',
})
export class AppHeaderComponent {
  readonly accountModal = inject(AccountModalStateService);
  readonly accountRefresh = inject(AccountRefreshService);

  constructor(readonly mobileNavState: MobileNavStateService) {}
}
