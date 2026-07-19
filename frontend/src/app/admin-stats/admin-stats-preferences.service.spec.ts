import { TestBed } from '@angular/core/testing';
import { AdminStatsPreferencesService } from './admin-stats-preferences.service';

describe('AdminStatsPreferencesService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('keeps a selected series hidden and restores it from storage', () => {
    const service = TestBed.inject(AdminStatsPreferencesService);
    service.setVisible('realtime.cpu', false);

    expect(service.isVisible('realtime.cpu')).toBe(false);

    TestBed.resetTestingModule();
    const restored = TestBed.inject(AdminStatsPreferencesService);
    expect(restored.isVisible('realtime.cpu')).toBe(false);
  });

  it('migrates visibility stored under the previous display label', () => {
    localStorage.setItem(
      'tank-arena:admin-stats:series-visibility',
      JSON.stringify({ 'CPU %': false }),
    );
    TestBed.resetTestingModule();

    const service = TestBed.inject(AdminStatsPreferencesService);

    expect(service.isVisible('realtime.cpu')).toBe(false);
  });
});
