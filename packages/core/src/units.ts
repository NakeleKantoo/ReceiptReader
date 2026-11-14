/**
 * Quantidades são sempre INTEIRO na unidade base do item.
 * A conversão para a unidade "bonita" (kg, L, m) só acontece na exibição/entrada.
 */

export const BASE_UNITS = ['g', 'ml', 'un', 'mm'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export type DisplayUnit = { suffix: string; factor: number };

export const DISPLAY_UNITS: Record<BaseUnit, DisplayUnit[]> = {
  g: [
    { suffix: 'g', factor: 1 },
    { suffix: 'kg', factor: 1000 },
  ],
  ml: [
    { suffix: 'ml', factor: 1 },
    { suffix: 'L', factor: 1000 },
  ],
  un: [{ suffix: 'un', factor: 1 }],
  mm: [
    { suffix: 'mm', factor: 1 },
    { suffix: 'm', factor: 1000 },
  ],
};

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
  g: 'grama',
  ml: 'mililitro',
  un: 'unidade',
  mm: 'milímetro',
};

/** "1500 g" → "1,5 kg" · "0 g" → "0 g" */
export function formatQty(base: number, unit: BaseUnit): string {
  const options = DISPLAY_UNITS[unit];
  let chosen = options[0]!;
  for (const option of options) {
    if (Math.abs(base) >= option.factor) chosen = option;
  }

  const value = base / chosen.factor;
  const text = Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

  return `${text.replace('.', ',')} ${chosen.suffix}`;
}

/** "1,5" + "kg" → 1500 (na base) */
export function toBaseQty(value: number, unit: BaseUnit, suffix: string): number {
  const option = DISPLAY_UNITS[unit].find((u) => u.suffix === suffix) ?? DISPLAY_UNITS[unit][0]!;
  return Math.round(value * option.factor);
}

/** "1,5" → 1.5 */
export function parseDecimal(input: string): number {
  return Number(input.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
}
