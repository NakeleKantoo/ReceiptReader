/**
 * Formato das etiquetas do Quanto. Puro (sem I/O) para poder ser usado no app,
 * no servidor e na geração de folhas de etiqueta (F4).
 *
 *   quanto://i/<publicId>   item
 *   quanto://a/<publicId>   bem (unidade física)
 *   quanto://l/<uuid>       local
 */

export type QuantoUriType = 'item' | 'asset' | 'location';

export type QuantoUri = { type: QuantoUriType; id: string };

const LETTERS: Record<string, QuantoUriType> = { i: 'item', a: 'asset', l: 'location' };
const TYPE_LETTER: Record<QuantoUriType, string> = { item: 'i', asset: 'a', location: 'l' };

const URI_PATTERN = /^quanto:\/\/([ial])\/([A-Za-z0-9-]{1,64})\/?$/;

export const buildItemUri = (publicId: string): string => `quanto://i/${publicId}`;
export const buildAssetUri = (publicId: string): string => `quanto://a/${publicId}`;
export const buildLocationUri = (id: string): string => `quanto://l/${id}`;

export function buildQuantoUri(type: QuantoUriType, id: string): string {
  return `quanto://${TYPE_LETTER[type]}/${id}`;
}

export function parseQuantoUri(raw: string): QuantoUri | null {
  const match = URI_PATTERN.exec(raw.trim());
  if (!match) return null;

  const letter = match[1]!;
  const type = LETTERS[letter];
  if (!type) return null;

  return { type, id: match[2]! };
}
