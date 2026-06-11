export function parseDelimited(value: any, delimiter: string = '|'): string[] {
  if (!value) return [];
  
  const parsed = String(value)
    .split(delimiter)
    .map(item => item.trim())
    .filter(item => item.length > 0);

  return Array.from(new Set(parsed));
}
