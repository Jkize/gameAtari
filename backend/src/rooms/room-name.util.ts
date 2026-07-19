export function normalizeRoomName(value: string): string {
  const words = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(word => word.toLowerCase());

  return words
    .map((word, index) => index === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join('');
}

export function displayRoomName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
