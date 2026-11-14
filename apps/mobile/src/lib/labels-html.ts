import {
  A4,
  chunkPages,
  perSheet,
  qrSizeMm,
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

/**
 * HTML de impressão: `expo-print` recebe uma string e o WebView do Android
 * imprime em mm. O preview usa o MESMO html, só com escala aplicada.
 */
export async function buildSheetHtml(
  labels: LabelData[],
  preset: LabelPreset,
  options: { preview?: boolean; maxPages?: number } = {},
): Promise<{ html: string; pages: number }> {
  const qrSize = qrSizeMm(preset);
  const pages = chunkPages(labels, preset);
  const visible = options.maxPages ? pages.slice(0, options.maxPages) : pages;

  const renderedPages = await Promise.all(
    visible.map(async (pageLabels) => {
      const cells = await Promise.all(
        pageLabels.map(async (label) => {
          const svg = await qrSvg(label.uri, qrSize);

          return `<div class="label">
  <div class="qr">${svg}</div>
  <div class="meta">
    <div class="name">${escapeHtml(label.title)}</div>
    ${label.subtitle ? `<div class="sub">${escapeHtml(label.subtitle)}</div>` : ''}
    <div class="code">${escapeHtml(label.code)}</div>
  </div>
</div>`;
        }),
      );

      return `<section class="sheet">${cells.join('')}</section>`;
    }),
  );

  const scale = options.preview
    ? `<style>
      html { transform-origin: top left; }
      body { background: #e9edec; }
      .sheet { box-shadow: 0 2px 12px rgba(0,0,0,.18); margin: 0 auto 8px; }
    </style>
    <script>
      (function () {
        var mmToPx = 96 / 25.4;
        var sheetPx = ${A4.widthMm} * mmToPx;
        var available = window.innerWidth;
        var scale = Math.min(1, available / sheetPx);
        document.documentElement.style.transform = 'scale(' + scale + ')';
        document.documentElement.style.width = sheetPx + 'px';
        document.body.style.width = sheetPx + 'px';
        document.documentElement.style.height = (${A4.heightMm} * mmToPx * ${Math.max(visible.length, 1)}) + 'px';
      })();
    </script>`
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
  body { font-family: -apple-system, 'Roboto', 'Segoe UI', sans-serif; color: #111; }

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

  .label {
    width: ${preset.widthMm}mm;
    height: ${preset.heightMm}mm;
    border: 0.2mm dashed #b9c2c0;
    padding: 1.6mm;
    display: flex;
    align-items: center;
    gap: 1.6mm;
    overflow: hidden;
    break-inside: avoid;
  }

  .qr { flex: 0 0 auto; display: flex; }
  .qr svg { display: block; }

  .meta { flex: 1 1 auto; min-width: 0; overflow: hidden; }
  .name {
    font-size: 2.9mm;
    font-weight: 700;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub {
    font-size: 2.2mm;
    color: #4a5a57;
    margin-top: 0.6mm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .code {
    font-family: 'Roboto Mono', ui-monospace, monospace;
    font-size: 2.4mm;
    letter-spacing: 0.4mm;
    color: #222;
    margin-top: 0.8mm;
  }
  ${scale}
</style>
</head>
<body>
${renderedPages.join('\n')}
</body>
</html>`;

  return { html, pages: Math.max(pages.length, 1) };
}

export { perSheet };
