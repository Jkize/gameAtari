import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { AccountModalStateService } from '@features/account/account-modal-state.service';
import { AccountRefreshService } from '@features/account/account-refresh.service';
import { AccountSettingsComponent } from '@features/account/account-settings/account-settings.component';
import { PublicStatsComponent } from '@features/public-stats/public-stats/public-stats.component';
import { RewardEligibilityNoticeComponent } from '@features/rewards/reward-eligibility-notice/reward-eligibility-notice.component';
import { QueueStatusService } from '@features/matchmaking/queue-status.service';
import { APP_AUTHOR, APP_VERSION } from '@shared/config/app-version';
import { LanguageSwitcherComponent } from '@shared/ui/language-switcher/language-switcher.component';
import { TokenCaComponent } from '@shared/ui/token-ca/token-ca.component';
import { NavigationService } from '../navigation.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';

@Component({
  selector: 'app-game-shell-v2',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    LanguageSwitcherComponent,
    UserMenuComponent,
    TokenCaComponent,
    PublicStatsComponent,
    RewardEligibilityNoticeComponent,
    AccountSettingsComponent,
  ],
  templateUrl: './game-shell-v2.component.html',
  styleUrl: './game-shell-v2.component.css',
})
export class GameShellV2Component {
  readonly auth = inject(AuthService);
  readonly nav = inject(NavigationService);
  readonly accountModal = inject(AccountModalStateService);
  readonly accountRefresh = inject(AccountRefreshService);
  readonly queueStatus = inject(QueueStatusService);

  readonly appVersion = APP_VERSION;
  readonly appAuthor = APP_AUTHOR;
}
