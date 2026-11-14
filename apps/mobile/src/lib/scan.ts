import {
  buildAssetUri,
  buildItemUri,
  buildLocationUri,
  parseQuantoUri,
  type Asset,
  type Location,
} from '@quanto/core';
import {
  findAssetByPublicId,
  findItemByBarcode,
  findItemByPublicId,
  getLocation,
  type ItemRow,
} from '@/db/repo';

export { buildAssetUri, buildItemUri, buildLocationUri, parseQuantoUri };

export type ResolvedScan =
  | { kind: 'item'; code: string; item: ItemRow }
  | { kind: 'asset'; code: string; asset: Asset; item: ItemRow | null }
  | { kind: 'location'; code: string; location: Location }
  | { kind: 'unknown'; code: string };

/**
 * Resolve um código lido sem tocar na rede: etiqueta do app primeiro, depois
 * código de barras do catálogo. Desconhecido é um resultado válido.
 */
export function resolveScan(raw: string): ResolvedScan {
  const code = raw.trim();

  const uri = parseQuantoUri(code);
  if (uri) {
    if (uri.type === 'item') {
      const item = findItemByPublicId(uri.id);
      if (item) return { kind: 'item', code, item };
    }

    if (uri.type === 'asset') {
      const asset = findAssetByPublicId(uri.id);
      if (asset) return { kind: 'asset', code, asset, item: null };
    }

    if (uri.type === 'location') {
      const location = getLocation(uri.id);
      if (location) return { kind: 'location', code, location };
    }

    return { kind: 'unknown', code };
  }

  const item = findItemByBarcode(code);
  if (item) return { kind: 'item', code, item };

  return { kind: 'unknown', code };
}

/** Normaliza códigos lidos: UPC-A às vezes vem com 13 dígitos e zero à esquerda. */
export function normalizeScannedCode(code: string): string {
  const trimmed = code.trim();

  if (/^\d{13}$/.test(trimmed) && trimmed.startsWith('0')) {
    const withoutZero = trimmed.slice(1);
    if (findItemByBarcode(withoutZero)) return withoutZero;
  }

  if (/^\d{12}$/.test(trimmed) && findItemByBarcode(`0${trimmed}`)) {
    return `0${trimmed}`;
  }

  return trimmed;
}
