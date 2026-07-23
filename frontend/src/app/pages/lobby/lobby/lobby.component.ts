import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { AccountRefreshService } from '@features/account/account-refresh.service';
import { PublicStatsComponent } from '@features/public-stats/public-stats/public-stats.component';
import { PwaInstallPromptComponent } from '@features/pwa/pwa-install-prompt/pwa-install-prompt.component';
import { RewardEligibilityNoticeComponent } from '@features/rewards/reward-eligibility-notice/reward-eligibility-notice.component';
import { PrivateRoomPanelComponent } from '../private-room-panel/private-room-panel.component';
import { QuickPlayCardComponent } from '../quick-play-card/quick-play-card.component';
import { RoomAccessDialogComponent } from '../room-access-dialog/room-access-dialog.component';
import { LobbyController } from '../lobby.controller';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    PublicStatsComponent,
    TranslocoPipe,
    RewardEligibilityNoticeComponent,
    QuickPlayCardComponent,
    PwaInstallPromptComponent,
    RoomAccessDialogComponent,
    PrivateRoomPanelComponent,
  ],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
})
export class LobbyComponent extends LobbyController {
  constructor(auth: AuthService, accountRefresh: AccountRefreshService, router: Router) {
    super(auth, accountRefresh, router);
  }
}
