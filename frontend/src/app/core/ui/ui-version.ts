export type UiVersion = 1 | 2;

export function isUiVersion(value: unknown): value is UiVersion {
  return value === 1 || value === 2;
}
