import {
  DEFAULT_LANGUAGE,
  applyDocumentLanguage,
  resolveInitialLanguage,
} from './language.config';

describe('language configuration', () => {
  it('prefers a supported saved language over the browser language', () => {
    expect(resolveInitialLanguage('es', ['en-US'])).toBe('es');
  });

  it('matches a regional browser locale to its supported base language', () => {
    expect(resolveInitialLanguage(null, ['es-CO', 'en-US'])).toBe('es');
  });

  it('uses navigator language priority and skips unsupported locales', () => {
    expect(resolveInitialLanguage(null, ['fr-FR', 'es-MX', 'en-US'])).toBe('es');
  });

  it('falls back to English when no language is supported', () => {
    expect(resolveInitialLanguage('pt-BR', ['fr-FR'])).toBe(DEFAULT_LANGUAGE);
  });

  it('updates the document language and direction', () => {
    applyDocumentLanguage('es');

    expect(document.documentElement.lang).toBe('es');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
