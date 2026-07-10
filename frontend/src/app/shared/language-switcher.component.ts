import { Component, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  template: `
    <select
      class="lang-select"
      [attr.aria-label]="'Select language'"
      [value]="activeLang()"
      (change)="select($event)"
    >
      <option value="en">EN</option>
      <option value="es">ES</option>
    </select>
  `,
  styles: [`
    .lang-select {
      appearance: none;
      -webkit-appearance: none;
      padding: 6px 28px 6px 12px;
      border: 1px solid #71825c;
      border-radius: 2px;
      background:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23d4ff5f'/%3E%3C/svg%3E")
        no-repeat right 10px center / 10px 6px,
        #1c281a;
      color: #edf4dc;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: .1em;
      cursor: pointer;
      opacity: .85;
      transition: opacity .15s, border-color .15s;
    }
    .lang-select:hover { opacity: 1; }
    .lang-select:focus {
      opacity: 1;
      outline: none;
      border-color: #d4ff5f;
    }
    .lang-select option {
      background: #1c281a;
      color: #edf4dc;
    }
  `],
})
export class LanguageSwitcherComponent {
  private readonly transloco = inject(TranslocoService);
  readonly activeLang = signal(this.transloco.getActiveLang());

  select(event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    this.transloco.setActiveLang(next);
    this.activeLang.set(next);
    localStorage.setItem('tank-arena:lang', next);
  }
}
