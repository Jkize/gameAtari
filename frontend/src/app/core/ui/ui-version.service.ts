import { Injectable, signal } from '@angular/core';
import { environment } from '@env/environment';
import { isUiVersion, UiVersion } from './ui-version';

const UI_VERSION_STORAGE_KEY = 'tank-arena:admin-ui-version';

@Injectable({ providedIn: 'root' })
export class UiVersionService {
  readonly current = signal<UiVersion>(this.storedVersion());

  select(version: UiVersion): void {
    this.current.set(version);
    this.storage()?.setItem(UI_VERSION_STORAGE_KEY, version.toString());
  }

  clearOverride(): void {
    this.storage()?.removeItem(UI_VERSION_STORAGE_KEY);
    this.current.set(environment.uiVersion);
  }

  private storedVersion(): UiVersion {
    const stored = Number(this.storage()?.getItem(UI_VERSION_STORAGE_KEY));
    return isUiVersion(stored) ? stored : environment.uiVersion;
  }

  private storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    if (typeof sessionStorage === 'undefined') return null;
    if (
      typeof sessionStorage.getItem !== 'function' ||
      typeof sessionStorage.setItem !== 'function' ||
      typeof sessionStorage.removeItem !== 'function'
    )
      return null;
    return sessionStorage;
  }
}
