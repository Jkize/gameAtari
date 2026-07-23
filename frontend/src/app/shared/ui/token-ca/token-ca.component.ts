import { Component, Input, signal } from '@angular/core';
import { environment } from '@env/environment';

@Component({
  selector: 'app-token-ca',
  standalone: true,
  templateUrl: './token-ca.component.html',
  styleUrl: './token-ca.component.css',
})
export class TokenCaComponent {
  @Input() compact = false;

  readonly address = environment.tokenContractAddress;
  readonly copied = signal(false);
  private resetTimer?: ReturnType<typeof setTimeout>;

  async copyAddress(): Promise<void> {
    if (!this.address) return;
    await navigator.clipboard.writeText(this.address);
    this.copied.set(true);
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.copied.set(false), 1800);
  }
}
