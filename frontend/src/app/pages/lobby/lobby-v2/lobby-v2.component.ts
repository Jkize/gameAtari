import { Component, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { AccountRefreshService } from '@features/account/account-refresh.service';
import { PwaInstallPromptComponent } from '@features/pwa/pwa-install-prompt/pwa-install-prompt.component';
import { TankAppearancePreviewComponent } from '@features/tank-customization/tank-appearance-preview/tank-appearance-preview.component';
import { TankCustomizationComponent } from '@features/tank-customization/tank-customization.component';
import { TankCustomizationStore } from '@features/tank-customization/tank-customization.store';
import { PrivateRoomPanelComponent } from '../private-room-panel/private-room-panel.component';
import { RoomAccessDialogComponent } from '../room-access-dialog/room-access-dialog.component';
import { LobbyController } from '../lobby.controller';

@Component({
  selector: 'app-lobby-v2',
  standalone: true,
  imports: [
    TranslocoPipe,
    PwaInstallPromptComponent,
    TankAppearancePreviewComponent,
    TankCustomizationComponent,
    PrivateRoomPanelComponent,
    RoomAccessDialogComponent,
  ],
  templateUrl: './lobby-v2.component.html',
  styleUrl: './lobby-v2.component.css',
})
export class LobbyV2Component extends LobbyController {
  @ViewChild(TankCustomizationComponent)
  private customizationEditor?: TankCustomizationComponent;

  readonly tankCustomization = inject(TankCustomizationStore);

  constructor(auth: AuthService, accountRefresh: AccountRefreshService, router: Router) {
    super(auth, accountRefresh, router);
  }

  openTankCustomization(): void {
    this.customizationEditor?.openEditor();
  }
}
