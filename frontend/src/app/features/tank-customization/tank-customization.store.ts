import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import {
  DEFAULT_TANK_CUSTOMIZATION,
  TankCustomization,
  normalizeTankCustomization,
} from '@game/contracts/tank-customization.types';

const STORAGE_KEY = 'tank-arena:tank-customization:v1';

@Injectable({ providedIn: 'root' })
export class TankCustomizationStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly current = signal<TankCustomization>(this.load());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const token = this.auth.accessToken();
      if (token) void this.reload(token);
    });
  }

  async save(customization: TankCustomization): Promise<boolean> {
    const normalized = normalizeTankCustomization(customization);
    const token = this.auth.accessToken();
    if (!token) return false;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.http.patch<TankCustomization>(
        `${environment.backendUrl}/tank-customization`,
        { paint: normalized.paint },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        },
      ));
      this.store(normalizeTankCustomization(saved));
      return true;
    } catch {
      this.error.set('tankCustomization.saveError');
      return false;
    } finally {
      this.saving.set(false);
    }
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

  private async reload(token: string): Promise<void> {
    this.loading.set(true);
    try {
      const customization = await firstValueFrom(this.http.get<TankCustomization>(
        `${environment.backendUrl}/tank-customization`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        },
      ));
      this.store(normalizeTankCustomization(customization));
    } catch {
      // Keep the last local snapshot available while the API is temporarily unavailable.
    } finally {
      this.loading.set(false);
    }
  }

  private store(customization: TankCustomization): void {
    this.current.set(customization);
    this.storage()?.setItem(STORAGE_KEY, JSON.stringify(customization));
  }
}
