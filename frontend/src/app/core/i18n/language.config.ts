export const APP_LANGUAGES = [
  { code: 'en', shortLabel: 'EN', direction: 'ltr' },
  { code: 'es', shortLabel: 'ES', direction: 'ltr' },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'tank-arena:lang';

export function resolveInitialLanguage(
  storedLanguage: string | null = readStoredLanguage(),
  browserLanguages: readonly string[] = readBrowserLanguages(),
): AppLanguage {
  const saved = matchSupportedLanguage(storedLanguage);
  if (saved) return saved;

  for (const browserLanguage of browserLanguages) {
    const exact = matchSupportedLanguage(browserLanguage);
    if (exact) return exact;

    const baseLanguage = normalizeLanguage(browserLanguage).split('-')[0];
    const baseMatch = matchSupportedLanguage(baseLanguage);
    if (baseMatch) return baseMatch;
  }

  return DEFAULT_LANGUAGE;
}

export function isSupportedLanguage(language: string): language is AppLanguage {
  return matchSupportedLanguage(language) !== null;
}

export function applyDocumentLanguage(language: AppLanguage): void {
  if (typeof document === 'undefined') return;
  const config = APP_LANGUAGES.find(item => item.code === language);
  document.documentElement.lang = language;
  document.documentElement.dir = config?.direction ?? 'ltr';
}

export function persistLanguage(language: AppLanguage): void {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

function matchSupportedLanguage(language: string | null | undefined): AppLanguage | null {
  if (!language) return null;
  const normalized = normalizeLanguage(language);
  return APP_LANGUAGES.find(item => normalizeLanguage(item.code) === normalized)?.code ?? null;
}

function normalizeLanguage(language: string): string {
  return language.trim().replace(/_/g, '-').toLowerCase();
}

function readStoredLanguage(): string | null {
  try {
    return globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function readBrowserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}
