import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '@core/auth/auth.service';
import { TankCustomizationComponent } from './tank-customization.component';

describe('TankCustomizationComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: AuthService, useValue: { accessToken: signal(null) } },
      ],
    });
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
    expect(component.draft().paint).toEqual({
      hull: { base: '#db3a2c' },
      turret: { base: '#3478f6' },
      tracks: { treadShadow: '#db3a2c' },
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

  it('closes without stepping through history when lobby navigation will replace the modal entry', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.openEditor();
    component.closeEditorForNavigation();

    expect(component.editorOpen()).toBe(false);
    expect(back).not.toHaveBeenCalled();
  });

  it('keeps the editor open until unsaved changes are explicitly discarded', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.openEditor();
    component.updateColor('hull', '#3478f6');
    component.closeEditor();

    expect(component.isDirty()).toBe(true);
    expect(component.editorOpen()).toBe(true);
    expect(component.discardConfirmationOpen()).toBe(true);
    expect(back).not.toHaveBeenCalled();

    component.continueEditing();
    expect(component.editorOpen()).toBe(true);
    expect(component.discardConfirmationOpen()).toBe(false);

    component.closeEditor();
    component.discardChanges();
    expect(component.editorOpen()).toBe(false);
    expect(back).toHaveBeenCalledOnce();
  });

  it('reverts the draft to the last saved appearance instead of the base color', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());
    component.store.current.set({
      version: 1,
      baseColor: '#db3a2c',
      paint: {
        hull: { base: '#3478f6' },
        turret: { base: '#f3d33b' },
        tracks: { treadShadow: '#24c7d9' },
      },
    });

    component.openEditor();
    component.updateColor('turret', '#9b5de5');
    expect(component.isDirty()).toBe(true);

    component.reset();

    expect(component.draft()).toEqual(component.store.current());
    expect(component.draft().paint.hull.base).toBe('#3478f6');
    expect(component.isDirty()).toBe(false);
  });

  it('delays embedded navigation until dirty changes are discarded', () => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const proceed = vi.fn();
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.openEditor();
    component.updateColor('trackTreadShadow', '#24c7d9');
    component.closeEditorForNavigation({ proceed });

    expect(proceed).not.toHaveBeenCalled();
    expect(component.editorOpen()).toBe(true);

    component.discardChanges();

    expect(proceed).toHaveBeenCalledOnce();
    expect(component.editorOpen()).toBe(false);
  });

  it('restores the modal history entry when browser back finds unsaved changes', () => {
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);
    const component = TestBed.runInInjectionContext(() => new TankCustomizationComponent());

    component.openEditor();
    component.updateColor('hull', '#3478f6');
    component.onBrowserBack();

    expect(pushState).toHaveBeenCalledTimes(2);
    expect(component.editorOpen()).toBe(true);
    expect(component.discardConfirmationOpen()).toBe(true);
  });
});
