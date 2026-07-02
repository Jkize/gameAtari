import { Component, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  template: `
    <button type="button" class="lang-btn" (click)="toggle()" [attr.aria-label]="'Switch language'">
      {{ activeLang() === 'en' ? 'ES' : 'EN' }}
    </button>
  `,
  styles: [`
    .lang-btn {
      padding: 4px 10px;
      border: 1px solid currentColor;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: .1em;
      cursor: pointer;
      opacity: .7;
      transition: opacity .15s;
    }
    .lang-btn:hover { opacity: 1; }
  `],
})
export class LanguageSwitcherComponent {
  private readonly transloco = inject(TranslocoService);
  readonly activeLang = signal(this.transloco.getActiveLang());

  toggle(): void {
    const next = this.activeLang() === 'en' ? 'es' : 'en';
    this.transloco.setActiveLang(next);
    this.activeLang.set(next);
    localStorage.setItem('tank-arena:lang', next);
  }
}
