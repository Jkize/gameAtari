import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_TANK_CUSTOMIZATION,
  TankCustomization,
  normalizeTankCustomization,
} from '@game/contracts/tank-customization.types';

const STORAGE_KEY = 'tank-arena:tank-customization:v1';

@Injectable({ providedIn: 'root' })
export class TankCustomizationStore {
  readonly current = signal<TankCustomization>(this.load());

  save(customization: TankCustomization): void {
    const normalized = normalizeTankCustomization(customization);
    this.current.set(normalized);
    this.storage()?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  reset(): void {
    this.save(DEFAULT_TANK_CUSTOMIZATION);
  }

  private load(): TankCustomization {
    const stored = this.storage()?.getItem(STORAGE_KEY);
    if (!stored) return normalizeTankCustomization(DEFAULT_TANK_CUSTOMIZATION);

    try {
      return normalizeTankCustomization(JSON.parse(stored));
    } catch {
      return normalizeTankCustomization(DEFAULT_TANK_CUSTOMIZATION);
    }
  }

  private storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    if (typeof localStorage === 'undefined') return null;
    if (typeof localStorage.getItem !== 'function' || typeof localStorage.setItem !== 'function') {
      return null;
    }
    return localStorage;
  }
}
