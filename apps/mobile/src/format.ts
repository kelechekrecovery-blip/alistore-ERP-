export function formatSom(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} сом`;
}

export function shortId(id: string): string {
  if (id.length <= 8) return id;
  return id.slice(-6).toUpperCase();
}

export function productInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'A';
}
