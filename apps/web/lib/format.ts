const nf = new Intl.NumberFormat('ru-RU');

/** Format сом amounts (integer minor-unit-free сом). */
export function som(value: number): string {
  return `${nf.format(value)} с`;
}

/** Derive a human condition label from product attrs (новое / Б/У). */
export function conditionLabel(attrs: Record<string, unknown> | null): string {
  const grade = attrs?.['grade'] ?? attrs?.['condition'];
  if (grade === 'used' || grade === 'B' || grade === 'C') return 'Б/У';
  return 'Новое';
}
