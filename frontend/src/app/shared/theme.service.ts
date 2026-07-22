import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'tank-arena:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly current = signal<Theme>(this.storedTheme());

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.apply(this.current());
  }

  toggle(): void {
    this.set(this.current() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.current.set(theme);
    this.apply(theme);
    this.storage()?.setItem(THEME_STORAGE_KEY, theme);
  }

  private apply(theme: Theme): void {
    this.document.documentElement.dataset['theme'] = theme;
  }

  private storedTheme(): Theme {
    return this.storage()?.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  }

  private storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    if (typeof localStorage === 'undefined') return null;
    if (typeof localStorage.getItem !== 'function' || typeof localStorage.setItem !== 'function') return null;
    return localStorage;
  }
}
