/**
 * Folhas de etiqueta. A4 = 210 × 297 mm.
 * Presets reais (Pimaco A4260 é o mais comum no Brasil: 3 × 7 = 21 por folha).
 */

export type LabelPreset = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows: number;
  /** margem da folha até a grade */
  marginXMm: number;
  marginYMm: number;
  gapXMm: number;
  gapYMm: number;
};

export const A4 = { widthMm: 210, heightMm: 297 } as const;

export const LABEL_PRESETS: readonly LabelPreset[] = [
  {
    id: 'a4260',
    name: 'Pimaco A4260 · 63,5 × 38,1',
    widthMm: 63.5,
    heightMm: 38.1,
    columns: 3,
    rows: 7,
    marginXMm: 9.75,
    marginYMm: 15.15,
    gapXMm: 0,
    gapYMm: 0,
  },
  {
    id: 'small',
    name: 'Pequena · 40 × 30',
    widthMm: 40,
    heightMm: 30,
    columns: 4,
    rows: 8,
    marginXMm: 9,
    marginYMm: 10,
    gapXMm: 3,
    gapYMm: 3,
  },
  {
    id: 'medium',
    name: 'Média · 50 × 30',
    widthMm: 50,
    heightMm: 30,
    columns: 3,
    rows: 8,
    marginXMm: 12,
    marginYMm: 10,
    gapXMm: 3,
    gapYMm: 3,
  },
  {
    id: 'card',
    name: 'Cartão · 90 × 50',
    widthMm: 90,
    heightMm: 50,
    columns: 2,
    rows: 5,
    marginXMm: 10,
    marginYMm: 10,
    gapXMm: 4,
    gapYMm: 4,
  },
  {
    id: 'full',
    name: 'A4 cheio · 190 × 277',
    widthMm: 190,
    heightMm: 277,
    columns: 1,
    rows: 1,
    marginXMm: 10,
    marginYMm: 10,
    gapXMm: 0,
    gapYMm: 0,
  },
] as const;

export function getPreset(id: string): LabelPreset {
  return LABEL_PRESETS.find((preset) => preset.id === id) ?? LABEL_PRESETS[0]!;
}

export function perSheet(preset: LabelPreset): number {
  return preset.columns * preset.rows;
}

/** Cabe na folha? Devolve o erro em mm, para avisar antes de imprimir torto. */
export function presetFits(preset: LabelPreset): boolean {
  const usedWidth = (preset.columns - 1) * preset.gapXMm + preset.columns * preset.widthMm;
  const usedHeight = (preset.rows - 1) * preset.gapYMm + preset.rows * preset.heightMm;
  return usedWidth + 2 * preset.marginXMm <= A4.widthMm && usedHeight + 2 * preset.marginYMm <= A4.heightMm;
}

/**
 * QR ao lado do texto (etiqueta larga) ou QR em cima (etiqueta estreita).
 * Larga demais e o texto fica espremido; estreita demais e o QR fica ilegível.
 */
export function labelLayout(preset: LabelPreset): {
  orientation: 'horizontal' | 'vertical';
  qrMm: number;
} {
  if (preset.widthMm >= 55) {
    return {
      orientation: 'horizontal',
      qrMm: Math.max(17, Math.min(preset.heightMm - 12, preset.widthMm * 0.3)),
    };
  }

  return {
    orientation: 'vertical',
    // vertical: o texto embaixo precisa de ~9 mm; o QR fica com o resto
    qrMm: Math.max(15, Math.min(preset.widthMm - 8, preset.heightMm * 0.5)),
  };
}

export function qrSizeMm(preset: LabelPreset): number {
  return labelLayout(preset).qrMm;
}

/** Largura/altura reais da grade (sem as margens da folha) — usada na prévia. */
export function gridSizeMm(preset: LabelPreset): { widthMm: number; heightMm: number } {
  return {
    widthMm: preset.columns * preset.widthMm + (preset.columns - 1) * preset.gapXMm,
    heightMm: preset.rows * preset.heightMm + (preset.rows - 1) * preset.gapYMm,
  };
}

/** A partir daqui o texto pode ser maior (cartão / folha cheia). */
export function isLargeLabel(preset: LabelPreset): boolean {
  return preset.widthMm >= 80;
}

export function chunkPages<T>(items: readonly T[], preset: LabelPreset): T[][] {
  const size = perSheet(preset);
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}
