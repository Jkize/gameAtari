import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  APP_LANGUAGES,
  applyDocumentLanguage,
  isSupportedLanguage,
  persistLanguage,
} from '@core/i18n/language.config';

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.css',
})
export class LanguageSwitcherComponent {
  private readonly transloco = inject(TranslocoService);
  readonly activeLang = this.transloco.activeLang;
  readonly languages = APP_LANGUAGES;

  select(next: string): void {
    if (!isSupportedLanguage(next)) return;
    this.transloco.setActiveLang(next);
    applyDocumentLanguage(next);
    persistLanguage(next);
  }
}
