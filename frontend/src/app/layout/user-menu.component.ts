import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { AccountModalStateService } from '../account/account-modal-state.service';
import { SessionExitService } from './session-exit.service';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.css',
})
export class UserMenuComponent {
  readonly menuOpen = signal(false);

  private readonly accountModal = inject(AccountModalStateService);
  private readonly sessionExit = inject(SessionExitService);

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
