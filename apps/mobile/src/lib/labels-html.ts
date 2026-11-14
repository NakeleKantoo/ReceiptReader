import {
  A4,
  chunkPages,
  gridSizeMm,
  isLargeLabel,
  labelLayout,
  perSheet,
  type LabelPreset,
} from '@quanto/core';
import { qrSvg } from './qr-svg';

export type LabelData = {
  /** conteúdo do QR (`quanto://...`) */
  uri: string;
  title: string;
  /** linha secundária: categoria, local, série... */
  subtitle?: string | null;
  /** código legível impresso embaixo */
  code: string;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const PX_PER_MM = 96 / 25.4;

/**
 * HTML da folha. O `expo-print` recebe string e o WebView imprime em mm.
 *
 * `previewScale` gera o MESMO html com a grade recortada (sem as margens da
 * folha) e já reduzida para a largura da tela — prévia fiel e sem espaço morto.
 */
export async function buildSheetHtml(
  labels: LabelData[],
  preset: LabelPreset,
  options: { previewScale?: number; maxPages?: number } = {},
): Promise<{ html: string; pages: number }> {
  const layout = labelLayout(preset);
  const pages = chunkPages(labels, preset);
  const visible = options.maxPages ? pages.slice(0, options.maxPages) : pages;
  const isPreview = typeof options.previewScale === 'number';
  const large = isLargeLabel(preset);

  const renderedPages = await Promise.all(
    visible.map(async (pageLabels) => {
      const cells = await Promise.all(
        pageLabels.map(async (label) => {
          const svg = await qrSvg(label.uri, layout.qrMm, 1);

          return `<div class="label ${layout.orientation}${large ? ' large' : ''}">
  <div class="qrbox">${svg}</div>
  <div class="meta">
    <div class="head">
      <div class="accent"></div>
      <div class="name">${escapeHtml(label.title)}</div>
      ${label.subtitle ? `<div class="sub">${escapeHtml(label.subtitle)}</div>` : ''}
    </div>
    <div class="code">${escapeHtml(label.code)}</div>
  </div>
</div>`;
        }),
      );

      return `<section class="sheet">${cells.join('')}</section>`;
    }),
  );

  const grid = gridSizeMm(preset);
  const scale = options.previewScale ?? 1;

  const previewCss = isPreview
    ? `
  body { background: #fff; }
  /* prévia: mostra só a grade de etiquetas, sem as margens do papel */
  .sheet { padding: 0; width: ${grid.widthMm}mm; height: ${grid.heightMm}mm; box-shadow: none; }
  html { transform: scale(${scale}); transform-origin: top left; }
  html, body { width: ${grid.widthMm}mm; }
`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Roboto', 'Segoe UI', sans-serif;
    color: #101A18;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet {
    width: ${A4.widthMm}mm;
    height: ${A4.heightMm}mm;
    padding: ${preset.marginYMm}mm ${preset.marginXMm}mm;
    display: grid;
    grid-template-columns: repeat(${preset.columns}, ${preset.widthMm}mm);
    grid-auto-rows: ${preset.heightMm}mm;
    column-gap: ${preset.gapXMm}mm;
    row-gap: ${preset.gapYMm}mm;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }

  /* fundo branco e QR em fundo branco: sem emenda visual */
  .label {
    width: ${preset.widthMm}mm;
    height: ${preset.heightMm}mm;
    background: #ffffff;
    border: 0.2mm solid #D6DEDC;
    border-radius: 1.2mm;
    padding: 1.6mm;
    display: flex;
    align-items: center;
    gap: 2mm;
    overflow: hidden;
    break-inside: avoid;
  }
  .label.vertical {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8mm;
    padding: 1.2mm;
  }

  .qrbox {
    flex: 0 0 auto;
    display: flex;
    background: #ffffff;
    border: 0.2mm solid #E9EEED;
    border-radius: 0.8mm;
    padding: 0.55mm;
  }
  .qrbox svg, .qrbox img { display: block; }

  .meta {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .head { min-width: 0; }
  .vertical .meta {
    justify-content: center;
    align-items: center;
    text-align: center;
    width: 100%;
    flex: 0 0 auto;
    gap: 0;
  }
  .vertical .sub { font-size: 1.85mm; margin-top: 0.3mm; }

  .accent {
    width: 6mm;
    height: 0.6mm;
    border-radius: 0.3mm;
    background: #0F4C4C;
    margin-bottom: 0.8mm;
  }
  .vertical .accent { margin: 0 auto 0.4mm; width: 4mm; height: 0.5mm; }

  .name {
    font-size: 3.3mm;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.03mm;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .vertical .name { font-size: 2.5mm; line-height: 1.08; -webkit-line-clamp: 1; }

  .sub {
    font-size: 2.05mm;
    color: #5C6B68;
    margin-top: 0.5mm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .code {
    align-self: flex-start;
    font-family: ui-monospace, 'Roboto Mono', monospace;
    font-size: 2.2mm;
    font-weight: 600;
    letter-spacing: 0.4mm;
    color: #1D2B28;
    background: #F1F5F4;
    border-radius: 0.6mm;
    padding: 0.3mm 1mm;
    margin-top: 0.8mm;
  }
  .vertical .code { align-self: center; font-size: 1.9mm; padding: 0.2mm 0.8mm; margin-top: 0.4mm; }

  .large .name { font-size: 4.2mm; -webkit-line-clamp: 3; }
  .large .sub { font-size: 3mm; }
  .large .code { font-size: 3.2mm; padding: 0.5mm 1.4mm; }
  .large .accent { width: 14mm; height: 1mm; }
  .large { padding: 3mm; gap: 3mm; }

  ${previewCss}
</style>
</head>
<body>
${renderedPages.join('\n')}
</body>
</html>`;

  return { html, pages: Math.max(pages.length, 1) };
}

export { perSheet, gridSizeMm, PX_PER_MM };
