import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { LANGUAGE_STORAGE_KEY } from '@core/i18n/language.config';
import { LanguageSwitcherComponent } from './language-switcher.component';

describe('LanguageSwitcherComponent', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [
        LanguageSwitcherComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: { nav: { selectLanguage: 'Select language' } },
            es: { nav: { selectLanguage: 'Seleccionar idioma' } },
          },
          translocoConfig: {
            availableLangs: ['en', 'es'],
            defaultLang: 'es',
          },
        }),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows Spanish when it is the active language on initial render', async () => {
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.value).toBe('es');
    expect(select.selectedOptions[0]?.textContent).toBe('ES');
  });

  it('keeps Transloco, the document, and local storage synchronized', () => {
    const fixture = TestBed.createComponent(LanguageSwitcherComponent);
    const transloco = TestBed.inject(TranslocoService);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(transloco.getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(select.value).toBe('en');
  });
});
