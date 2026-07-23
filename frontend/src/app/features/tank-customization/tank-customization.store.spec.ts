import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import { TankCustomization } from '@game/contracts/tank-customization.types';
import { TankCustomizationStore } from './tank-customization.store';

describe('TankCustomizationStore', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { accessToken: signal('test-token') } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('persists semantic paint slots through the dedicated backend endpoint', async () => {
    const store = TestBed.inject(TankCustomizationStore);
    const http = TestBed.inject(HttpTestingController);
    TestBed.flushEffects();
    http.expectOne(`${environment.backendUrl}/tank-customization`).flush({
      version: 1,
      baseColor: '#3478f6',
      paint: {
        hull: { base: '#3478f6' },
        turret: { base: '#3478f6' },
        tracks: { treadShadow: '#3478f6' },
      },
    });
    const customization: TankCustomization = {
      version: 1,
      baseColor: '#3478f6',
      paint: {
        hull: { base: '#3478f6' },
        turret: { base: '#f3d33b' },
        tracks: { treadShadow: '#9b5de5' },
      },
    };

    const saving = store.save(customization);
    const request = http.expectOne(`${environment.backendUrl}/tank-customization`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ paint: customization.paint });
    request.flush(customization);
    expect(await saving).toBe(true);

    expect(store.current()).toEqual(customization);
    expect(JSON.parse(values.get('tank-arena:tank-customization:v1') ?? '')).toEqual(customization);
    http.verify();
  });
});
