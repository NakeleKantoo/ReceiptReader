/**
 * QR como string SVG — o HTML de impressão precisa do código vetorial, e o
 * `expo-print` só recebe HTML.
 *
 * Usa o build de navegador do `qrcode` (o entry principal importa `fs`) e o
 * formato de callback, porque `canPromise()` do pacote não reconhece o Promise
 * do Hermes e lançaria "Callback required".
 */

type QrToString = (
  text: string,
  options: Record<string, unknown>,
  callback: (error: Error | null, svg?: string) => void,
) => void;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const qrcode = require('qrcode/lib/browser') as { toString: QrToString };

const cache = new Map<string, string>();

export function qrSvg(text: string, sizeMm: number, margin = 0): Promise<string> {
  const key = `${text}|${sizeMm}|${margin}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    qrcode.toString(
      text,
      { type: 'svg', margin, errorCorrectionLevel: 'M', width: Math.round(sizeMm * 4) },
      (error, svg) => {
        if (error || !svg) {
          reject(error ?? new Error('QR vazio'));
          return;
        }

        // o SVG do pacote vem com width/height em px; troco por mm para imprimir
        // no tamanho exato da etiqueta
        const scaled = svg
          .replace(/<svg([^>]*?)width="[^"]*"/, '<svg$1')
          .replace(/<svg([^>]*?)height="[^"]*"/, '<svg$1')
          .replace('<svg', `<svg width="${sizeMm}mm" height="${sizeMm}mm"`);

        cache.set(key, scaled);
        resolve(scaled);
      },
    );
  });
}
