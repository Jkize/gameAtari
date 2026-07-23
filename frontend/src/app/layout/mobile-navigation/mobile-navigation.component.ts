import { Component, ElementRef, HostListener, ViewChild, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { LanguageSwitcherComponent } from '@shared/ui/language-switcher/language-switcher.component';
import { MobileNavStateService } from '../mobile-nav-state.service';
import { NavigationService } from '../navigation.service';
import { SessionExitService } from '../session-exit.service';
import { AccountModalStateService } from '@features/account/account-modal-state.service';
import { ThemeService } from '@core/theme/theme.service';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, LanguageSwitcherComponent],
  templateUrl: './mobile-navigation.component.html',
  styleUrl: './mobile-navigation.component.css',
})
export class MobileNavigationComponent {
  @ViewChild('closeButton') private readonly closeButton?: ElementRef<HTMLButtonElement>;

  private readonly sessionExit = inject(SessionExitService);
  private readonly accountModal = inject(AccountModalStateService);
  readonly theme = inject(ThemeService);
  readonly nav = inject(NavigationService);

  constructor(
    readonly mobileNavState: MobileNavStateService,
    readonly auth: AuthService,
  ) {
    effect(() => {
      if (this.mobileNavState.open()) {
        setTimeout(() => this.closeButton?.nativeElement.focus());
      }
    });
  }

  close(): void {
    this.mobileNavState.hide();
  }

  openAccount(): void {
    this.close();
    this.accountModal.show();
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  async logout(): Promise<void> {
    this.close();
    await this.sessionExit.signOut();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileNavState.open()) this.close();
  }
}
