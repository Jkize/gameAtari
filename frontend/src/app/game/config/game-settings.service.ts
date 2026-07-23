import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import {
  GameSettings,
  normalizeGameSettings,
  readStoredGameSettings,
  SETTINGS_KEY,
  SETTINGS_STORAGE_KEY,
} from './game-settings.types';

@Injectable({ providedIn: 'root' })
export class GameSettingsService {
  constructor(private readonly http: HttpClient) {}

  async load(accessToken: string | null): Promise<GameSettings> {
    const localSettings = readStoredGameSettings();
    if (!accessToken) return localSettings;

    try {
      const response = await firstValueFrom(this.http.get<{ key: string; data: unknown }>(
        `${environment.backendUrl}/settings/${SETTINGS_KEY}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          withCredentials: true,
        },
      ));
      const settings = normalizeGameSettings(response.data);
      this.storeLocal(settings);
      return settings;
    } catch {
      return localSettings;
    }
  }

  async save(settings: GameSettings, accessToken: string | null): Promise<void> {
    const normalized = normalizeGameSettings(settings);
    this.storeLocal(normalized);
    if (!accessToken) return;

    await firstValueFrom(this.http.put(
      `${environment.backendUrl}/settings/${SETTINGS_KEY}`,
      { data: normalized },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        withCredentials: true,
      },
    ));
  }

  storeLocal(settings: GameSettings): void {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeGameSettings(settings)));
  }
}
