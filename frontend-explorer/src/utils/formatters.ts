export function parseDelimited(value: string | null | undefined, delimiter: string = '|'): string[] {
  if (!value) return [];
  
  return String(value)
    .split(delimiter)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}
