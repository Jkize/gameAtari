import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
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
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('saves the exact backend-facing payload locally', () => {
    const store = TestBed.inject(TankCustomizationStore);
    const customization: TankCustomization = {
      version: 1,
      skinId: 'classic',
      colors: { body: '#3478f6', turret: '#f3d33b', tracks: '#9b5de5' },
    };

    store.save(customization);

    expect(store.current()).toEqual(customization);
    expect(JSON.parse(values.get('tank-arena:tank-customization:v1') ?? '')).toEqual(customization);
  });
});
