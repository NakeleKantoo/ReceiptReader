import { getDatabase } from '@/db';

/**
 * OpenFoodFacts como conveniência: preenche nome, marca e foto de alimento a
 * partir do código de barras. Nunca é obrigatório — offline ou 404 significa
 * cadastro manual.
 */
export type ProductInfo = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  quantity: string | null;
  source: 'cache' | 'openfoodfacts';
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

type CacheRow = {
  barcode: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  fetched_at: number;
};

function readCache(barcode: string): CacheRow | null {
  const row = getDatabase().getFirstSync<CacheRow>(
    'SELECT * FROM product_cache WHERE barcode = ?',
    barcode,
  );
  if (!row) return null;
  if (Date.now() - row.fetched_at > CACHE_TTL_MS) return null;
  return row;
}

function writeCache(product: Omit<ProductInfo, 'source'> & { quantity?: string | null }): void {
  getDatabase().runSync(
    `INSERT INTO product_cache (barcode, name, brand, image_url, fetched_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name = excluded.name, brand = excluded.brand,
       image_url = excluded.image_url, fetched_at = excluded.fetched_at`,
    product.barcode,
    product.name,
    product.brand,
    product.imageUrl,
    Date.now(),
  );
}

export async function lookupProduct(barcode: string): Promise<ProductInfo | null> {
  const cached = readCache(barcode);
  if (cached) {
    return {
      barcode: cached.barcode,
      name: cached.name,
      brand: cached.brand,
      imageUrl: cached.image_url,
      quantity: null,
      source: 'cache',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
        '?fields=product_name,brands,image_front_small_url,quantity',
      { signal: controller.signal, headers: { 'user-agent': 'Quanto/0.1 (self-hosted home inventory)' } },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        brands?: string;
        image_front_small_url?: string;
        quantity?: string;
      };
    };

    if (payload.status === 0 || !payload.product) return null;

    const info = {
      barcode,
      name: payload.product.product_name?.trim() || null,
      brand: payload.product.brands?.split(',')[0]?.trim() || null,
      imageUrl: payload.product.image_front_small_url ?? null,
      quantity: payload.product.quantity ?? null,
    };

    if (info.name || info.brand) writeCache(info);

    return { ...info, source: 'openfoodfacts' };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
