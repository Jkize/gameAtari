import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, inject, signal } from '@angular/core';
import { UiVersionService } from '@core/ui/ui-version.service';

export type Theme = 'light' | 'dark' | 'light_v2' | 'dark_v2';

const THEME_STORAGE_KEY = 'tank-arena:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly uiVersion = inject(UiVersionService);
  readonly current = signal<Theme>(this.storedTheme());

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.apply(this.current());
  }

  toggle(): void {
    this.set(this.isDark() ? this.themeForMode('light') : this.themeForMode('dark'));
  }

  set(theme: Theme): void {
    const compatibleTheme = this.compatibleTheme(theme);
    this.current.set(compatibleTheme);
    this.apply(compatibleTheme);
    this.storage()?.setItem(THEME_STORAGE_KEY, compatibleTheme);
  }

  isDark(): boolean {
    return this.current() === 'dark' || this.current() === 'dark_v2';
  }

  private apply(theme: Theme): void {
    this.document.documentElement.dataset['theme'] = theme;
    this.document.documentElement.dataset['uiVersion'] = this.uiVersion.current().toString();
  }

  private storedTheme(): Theme {
    const stored = this.storage()?.getItem(THEME_STORAGE_KEY);
    const mode = stored === 'light' || stored === 'light_v2' ? 'light' : 'dark';
    return this.themeForMode(mode);
  }

  private compatibleTheme(theme: Theme): Theme {
    return this.themeForMode(theme === 'light' || theme === 'light_v2' ? 'light' : 'dark');
  }

  private themeForMode(mode: 'light' | 'dark'): Theme {
    return this.uiVersion.current() === 2 ? `${mode}_v2` : mode;
  }

  private storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    if (typeof localStorage === 'undefined') return null;
    if (typeof localStorage.getItem !== 'function' || typeof localStorage.setItem !== 'function')
      return null;
    return localStorage;
  }
}
