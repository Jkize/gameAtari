import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { UiVersionService } from './ui-version.service';

describe('UiVersionService', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the environment version when there is no admin override', () => {
    expect(TestBed.inject(UiVersionService).current()).toBe(2);
  });

  it('restores and updates the session-scoped admin override', () => {
    values.set('tank-arena:admin-ui-version', '1');
    const service = TestBed.inject(UiVersionService);

    expect(service.current()).toBe(1);

    service.select(2);

    expect(service.current()).toBe(2);
    expect(values.get('tank-arena:admin-ui-version')).toBe('2');
  });

  it('clears the override and returns to the environment version', () => {
    const service = TestBed.inject(UiVersionService);
    service.select(1);

    service.clearOverride();

    expect(service.current()).toBe(2);
    expect(values.has('tank-arena:admin-ui-version')).toBe(false);
  });
});
