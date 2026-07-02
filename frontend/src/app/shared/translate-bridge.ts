type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

let translateFn: TranslateFn = (key) => key;

export function registerTranslate(fn: TranslateFn): void {
  translateFn = fn;
}

export function t(key: string, params?: Record<string, unknown>): string {
  return translateFn(key, params);
}
