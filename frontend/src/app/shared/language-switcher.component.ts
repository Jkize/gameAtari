import { Component, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  APP_LANGUAGES,
  applyDocumentLanguage,
  isSupportedLanguage,
  persistLanguage,
} from './language.config';

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
  readonly languages = APP_LANGUAGES;

  select(event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    if (!isSupportedLanguage(next)) return;
    this.transloco.setActiveLang(next);
    this.activeLang.set(next);
    applyDocumentLanguage(next);
    persistLanguage(next);
  }
}
