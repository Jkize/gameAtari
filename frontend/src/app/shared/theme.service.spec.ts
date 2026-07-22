import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
  });

  it('toggles the document theme and persists the selection', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.current()).toBe('dark');
    service.toggle();

    expect(service.current()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(values.get('tank-arena:theme')).toBe('light');
  });
});
