import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.css',
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
