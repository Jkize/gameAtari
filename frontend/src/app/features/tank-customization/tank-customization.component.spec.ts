import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TankCustomizationComponent } from './tank-customization.component';

describe('TankCustomizationComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    });
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('applies a selected color only to the active tank part', () => {
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.selectPart('turret');
    component.updateSelectedColor('#3478f6');

    expect(component.activePart()).toBe('turret');
    expect(component.draft().colors).toEqual({
      body: '#db3a2c',
      turret: '#3478f6',
      tracks: '#db3a2c',
    });
    expect(component.selectedRgb()).toEqual({ red: 52, green: 120, blue: 246 });
  });

  it('closes the editor instead of navigating away when the browser goes back', () => {
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.openEditor();
    component.onBrowserBack();

    expect(pushState).toHaveBeenCalledOnce();
    expect(component.editorOpen()).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('removes the modal history entry when closed from the interface', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.openEditor();
    component.closeEditor();

    expect(component.editorOpen()).toBe(false);
    expect(back).toHaveBeenCalledOnce();
  });
});
