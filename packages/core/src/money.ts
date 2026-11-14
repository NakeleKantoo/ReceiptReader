/** Dinheiro é sempre INTEIRO em centavos. */

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "1.234,56" | "R$ 12" → 123456 · 1200 */
export function parseBRL(input: string): number {
  const clean = input.replace(/[^\d,.-]/g, '').trim();
  if (!clean) return 0;

  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  let normalized = clean;

  if (lastComma > lastDot) {
    // formato brasileiro: 1.234,56
    normalized = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // formato 1,234.56
    normalized = clean.replace(/,/g, '');
  } else {
    normalized = clean.replace(',', '.');
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}
