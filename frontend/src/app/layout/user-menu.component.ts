import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { SessionExitService } from './session-exit.service';
import { AccountModalStateService } from '../account/account-modal-state.service';
import { ThemeService } from '../shared/theme.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
})
export class UserMenuComponent {
  readonly menuOpen = signal(false);
  readonly theme = inject(ThemeService);

  private readonly sessionExit = inject(SessionExitService);
  private readonly accountModal = inject(AccountModalStateService);

  constructor(
    readonly auth: AuthService,
    private readonly elementRef: ElementRef<HTMLElement>,
  ) {}

  toggleMenu(): void {
    this.menuOpen.update(value => !value);
  }

  openAccount(): void {
    this.menuOpen.set(false);
    this.accountModal.show();
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.sessionExit.signOut();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
  }
}
