import { getRandomBytes } from 'expo-crypto';
import {
  makePublicId,
  normalizeSearch,
  type Asset,
  type AssetStatus,
  type BaseUnitName,
  type Category,
  type Item,
  type ItemKind,
  type Location,
} from '@quanto/core';
import { getDatabase, getSetting, setSetting } from './index';
import { serverNow } from '@/lib/sync';
import { newId } from '@/lib/id';

const HOUSEHOLD_KEY = 'household_id';

/** Gravado no login: toda linha nova precisa do escopo da casa. */
export function setCurrentHousehold(householdId: string): void {
  setSetting(HOUSEHOLD_KEY, householdId);
}

export function getCurrentHousehold(): string {
  const householdId = getSetting(HOUSEHOLD_KEY);
  if (!householdId) throw new Error('Casa não definida — faça login novamente');
  return householdId;
}

// ─────────────────────────────────────────────── mapeamento snake → camel

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

function toLocation(row: Row): Location {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    name: str(row.name),
    parentId: strOrNull(row.parent_id),
    icon: strOrNull(row.icon),
    notes: strOrNull(row.notes),
    sortOrder: num(row.sort_order),
    deletedAt: row.deleted_at === null ? null : num(row.deleted_at),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
    rev: num(row.rev),
  };
}

export function toCategory(row: Row): Category {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    name: str(row.name),
    parentId: strOrNull(row.parent_id),
    icon: strOrNull(row.icon),
    color: strOrNull(row.color),
    sortOrder: num(row.sort_order),
    deletedAt: row.deleted_at === null ? null : num(row.deleted_at),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
    rev: num(row.rev),
  };
}

function toItem(row: Row): Item {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    publicId: str(row.public_id),
    name: str(row.name),
    brand: strOrNull(row.brand),
    categoryId: strOrNull(row.category_id),
    kind: str(row.kind) as ItemKind,
    baseUnit: str(row.base_unit) as BaseUnitName,
    minQty: num(row.min_qty),
    defaultLocationId: strOrNull(row.default_location_id),
    barcode: strOrNull(row.barcode),
    photoPath: strOrNull(row.photo_path),
    notes: strOrNull(row.notes),
    deletedAt: row.deleted_at === null ? null : num(row.deleted_at),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
    rev: num(row.rev),
  };
}

function toAsset(row: Row): Asset {
  return {
    id: str(row.id),
    householdId: str(row.household_id),
    itemId: str(row.item_id),
    publicId: str(row.public_id),
    nickname: strOrNull(row.nickname),
    serial: strOrNull(row.serial),
    locationId: strOrNull(row.location_id),
    status: str(row.status) as AssetStatus,
    holderUserId: strOrNull(row.holder_user_id),
    acquiredOn: strOrNull(row.acquired_on),
    valueCents: num(row.value_cents),
    warrantyUntil: strOrNull(row.warranty_until),
    photoPath: strOrNull(row.photo_path),
    notes: strOrNull(row.notes),
    deletedAt: row.deleted_at === null ? null : num(row.deleted_at),
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
    rev: num(row.rev),
  };
}

// ─────────────────────────────────────────────── locais e categorias

export function listLocations(): Location[] {
  return getDatabase()
    .getAllSync<Row>('SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE')
    .map(toLocation);
}

export function listCategories(): Category[] {
  return getDatabase()
    .getAllSync<Row>(
      'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
    )
    .map(toCategory);
}

export function createCategory(name: string): void {
  const now = serverNow();
  getDatabase().runSync(
    `INSERT INTO categories (id, household_id, name, sort_order, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, 0, NULL, ?, ?, 0)`,
    newId(),
    getCurrentHousehold(),
    name.trim(),
    now,
    now,
  );
}

export function renameCategory(id: string, name: string): void {
  getDatabase().runSync(
    'UPDATE categories SET name = ?, updated_at = ?, rev = 0 WHERE id = ?',
    name.trim(),
    serverNow(),
    id,
  );
}

export function deleteCategory(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE categories SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
  getDatabase().runSync(
    'UPDATE items SET category_id = NULL, updated_at = ?, rev = 0 WHERE category_id = ?',
    now,
    id,
  );
}

export function createLocation(input: { name: string; parentId?: string | null; notes?: string | null }): void {
  const now = serverNow();
  getDatabase().runSync(
    `INSERT INTO locations (id, household_id, name, parent_id, icon, notes, sort_order, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, NULL, ?, 0, NULL, ?, ?, 0)`,
    newId(),
    getCurrentHousehold(),
    input.name.trim(),
    input.parentId ?? null,
    input.notes ?? null,
    now,
    now,
  );
}

export function renameLocation(id: string, name: string): void {
  getDatabase().runSync(
    'UPDATE locations SET name = ?, updated_at = ?, rev = 0 WHERE id = ?',
    name.trim(),
    serverNow(),
    id,
  );
}

export function deleteLocation(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE locations SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

// ─────────────────────────────────────────────── itens

export type ItemRow = Item & {
  categoryName: string | null;
  locationName: string | null;
  assetCount: number;
};

const ITEM_SELECT = `
  SELECT i.*, c.name AS category_name, l.name AS location_name,
         (SELECT COUNT(*) FROM assets a WHERE a.item_id = i.id AND a.deleted_at IS NULL) AS asset_count
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN locations l ON l.id = i.default_location_id
  WHERE i.deleted_at IS NULL
`;

function toItemRow(row: Row): ItemRow {
  return {
    ...toItem(row),
    categoryName: strOrNull(row.category_name),
    locationName: strOrNull(row.location_name),
    assetCount: num(row.asset_count),
  };
}

export type ItemFilter = { query?: string; kind?: ItemKind | null; categoryId?: string | null };

export function listItems(filter: ItemFilter = {}): ItemRow[] {
  const rows = getDatabase()
    .getAllSync<Row>(`${ITEM_SELECT} ORDER BY i.name COLLATE NOCASE`)
    .map(toItemRow);

  const query = normalizeSearch(filter.query ?? '');

  return rows.filter((item) => {
    if (filter.kind && item.kind !== filter.kind) return false;
    if (filter.categoryId && item.categoryId !== filter.categoryId) return false;
    if (!query) return true;

    const haystack = normalizeSearch([item.name, item.brand ?? '', item.categoryName ?? ''].join(' '));
    return haystack.includes(query);
  });
}

export function getItem(id: string): ItemRow | null {
  const row = getDatabase().getFirstSync<Row>(`${ITEM_SELECT} AND i.id = ?`, id);
  return row ? toItemRow(row) : null;
}

function uniquePublicId(prefix: 'item' | 'asset'): string {
  const db = getDatabase();
  const table = prefix === 'item' ? 'items' : 'assets';

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = makePublicId((max) => getRandomBytes(1)[0]! % max);
    const exists = db.getFirstSync<{ id: string }>(`SELECT id FROM ${table} WHERE public_id = ?`, candidate);
    if (!exists) return candidate;
  }

  // 32^6 ≈ 1 bilhão; se colidir 8 vezes algo está muito errado
  throw new Error('Não foi possível gerar um código único');
}

export type ItemInput = {
  name: string;
  brand?: string | null;
  categoryId?: string | null;
  kind: ItemKind;
  baseUnit: BaseUnitName;
  minQty?: number;
  defaultLocationId?: string | null;
  barcode?: string | null;
  notes?: string | null;
};

export function createItem(input: ItemInput): Item {
  const now = serverNow();
  const id = newId();
  const publicId = uniquePublicId('item');

  getDatabase().runSync(
    `INSERT INTO items
       (id, household_id, public_id, name, brand, category_id, kind, base_unit, min_qty,
        default_location_id, barcode, photo_path, notes, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, 0)`,
    id,
    getCurrentHousehold(),
    publicId,
    input.name.trim(),
    input.brand?.trim() || null,
    input.categoryId ?? null,
    input.kind,
    input.baseUnit,
    input.minQty ?? 0,
    input.defaultLocationId ?? null,
    input.barcode?.trim() || null,
    input.notes?.trim() || null,
    now,
    now,
  );

  return getItem(id)!;
}

export function updateItem(id: string, input: ItemInput): void {
  getDatabase().runSync(
    `UPDATE items SET
       name = ?, brand = ?, category_id = ?, kind = ?, base_unit = ?, min_qty = ?,
       default_location_id = ?, barcode = ?, notes = ?, updated_at = ?, rev = 0
     WHERE id = ?`,
    input.name.trim(),
    input.brand?.trim() || null,
    input.categoryId ?? null,
    input.kind,
    input.baseUnit,
    input.minQty ?? 0,
    input.defaultLocationId ?? null,
    input.barcode?.trim() || null,
    input.notes?.trim() || null,
    serverNow(),
    id,
  );
}

export function deleteItem(id: string): void {
  const now = serverNow();
  const db = getDatabase();

  db.withTransactionSync(() => {
    db.runSync('UPDATE items SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?', now, now, id);
    for (const table of ['assets', 'item_barcodes', 'item_aliases']) {
      db.runSync(
        `UPDATE ${table} SET deleted_at = ?, updated_at = ?, rev = 0 WHERE item_id = ? AND deleted_at IS NULL`,
        now,
        now,
        id,
      );
    }
  });
}

// ─────────────────────────────────────────────── códigos de barras e apelidos

export type BarcodeRow = { id: string; barcode: string; format: string | null };

export function listBarcodes(itemId: string): BarcodeRow[] {
  return getDatabase().getAllSync<Row>(
    'SELECT id, barcode, format FROM item_barcodes WHERE item_id = ? AND deleted_at IS NULL ORDER BY created_at',
    itemId,
  ) as unknown as BarcodeRow[];
}

export function addBarcode(itemId: string, barcode: string, format = 'ean13'): void {
  const now = serverNow();
  getDatabase().runSync(
    `INSERT INTO item_barcodes (id, household_id, item_id, barcode, format, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
    newId(),
    getCurrentHousehold(),
    itemId,
    barcode.trim(),
    format,
    now,
    now,
  );
}

export function removeBarcode(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE item_barcodes SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

export type AliasRow = { id: string; alias: string };

export function listAliases(itemId: string): AliasRow[] {
  return getDatabase().getAllSync<Row>(
    'SELECT id, alias FROM item_aliases WHERE item_id = ? AND deleted_at IS NULL ORDER BY alias COLLATE NOCASE',
    itemId,
  ) as unknown as AliasRow[];
}

export function addAlias(itemId: string, alias: string): void {
  const now = serverNow();
  getDatabase().runSync(
    `INSERT INTO item_aliases (id, household_id, item_id, alias, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 0)`,
    newId(),
    getCurrentHousehold(),
    itemId,
    alias.trim(),
    now,
    now,
  );
}

export function removeAlias(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE item_aliases SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

// ─────────────────────────────────────────────── bens (unidades físicas)

export function listAssets(itemId?: string): Asset[] {
  const sql = itemId
    ? 'SELECT * FROM assets WHERE item_id = ? AND deleted_at IS NULL ORDER BY created_at'
    : 'SELECT * FROM assets WHERE deleted_at IS NULL ORDER BY created_at';
  const rows = itemId
    ? getDatabase().getAllSync<Row>(sql, itemId)
    : getDatabase().getAllSync<Row>(sql);
  return rows.map(toAsset);
}

export function getAsset(id: string): Asset | null {
  const row = getDatabase().getFirstSync<Row>('SELECT * FROM assets WHERE id = ?', id);
  return row ? toAsset(row) : null;
}

export type AssetInput = {
  itemId: string;
  nickname?: string | null;
  serial?: string | null;
  locationId?: string | null;
  status?: AssetStatus;
  acquiredOn?: string | null;
  valueCents?: number;
  warrantyUntil?: string | null;
  notes?: string | null;
};

export function createAsset(input: AssetInput): string {
  const now = serverNow();
  const id = newId();

  getDatabase().runSync(
    `INSERT INTO assets
       (id, household_id, item_id, public_id, nickname, serial, location_id, status, holder_user_id,
        acquired_on, value_cents, warranty_until, photo_path, notes, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, 0)`,
    id,
    getCurrentHousehold(),
    input.itemId,
    uniquePublicId('asset'),
    input.nickname?.trim() || null,
    input.serial?.trim() || null,
    input.locationId ?? null,
    input.status ?? 'available',
    input.acquiredOn ?? null,
    input.valueCents ?? 0,
    input.warrantyUntil ?? null,
    input.notes?.trim() || null,
    now,
    now,
  );

  return id;
}

export function updateAsset(id: string, patch: Omit<AssetInput, 'itemId'>): void {
  getDatabase().runSync(
    `UPDATE assets SET
       nickname = ?, serial = ?, location_id = ?, status = ?, acquired_on = ?,
       value_cents = ?, warranty_until = ?, notes = ?, updated_at = ?, rev = 0
     WHERE id = ?`,
    patch.nickname?.trim() || null,
    patch.serial?.trim() || null,
    patch.locationId ?? null,
    patch.status ?? 'available',
    patch.acquiredOn ?? null,
    patch.valueCents ?? 0,
    patch.warrantyUntil ?? null,
    patch.notes?.trim() || null,
    serverNow(),
    id,
  );
}

export function deleteAsset(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE assets SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

// ─────────────────────────────────────────────── contadores

// ─────────────────────────────────────────────── busca por código (scanner)

/** Procura por qualquer código: lista de códigos do item ou o código principal. */
export function findItemByBarcode(code: string): ItemRow | null {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const byList = getDatabase().getFirstSync<{ item_id: string }>(
    'SELECT item_id FROM item_barcodes WHERE barcode = ? AND deleted_at IS NULL LIMIT 1',
    trimmed,
  );
  if (byList) return getItem(byList.item_id);

  const byMain = getDatabase().getFirstSync<{ id: string }>(
    'SELECT id FROM items WHERE barcode = ? AND deleted_at IS NULL LIMIT 1',
    trimmed,
  );
  return byMain ? getItem(byMain.id) : null;
}

export function findItemByPublicId(publicId: string): ItemRow | null {
  const row = getDatabase().getFirstSync<{ id: string }>(
    'SELECT id FROM items WHERE public_id = ? AND deleted_at IS NULL LIMIT 1',
    publicId.toUpperCase(),
  );
  return row ? getItem(row.id) : null;
}

export function findAssetByPublicId(publicId: string): Asset | null {
  const row = getDatabase().getFirstSync<Row>(
    'SELECT * FROM assets WHERE public_id = ? AND deleted_at IS NULL LIMIT 1',
    publicId.toUpperCase(),
  );
  return row ? toAsset(row) : null;
}

export function getLocation(id: string): Location | null {
  const row = getDatabase().getFirstSync<Row>('SELECT * FROM locations WHERE id = ?', id);
  return row ? toLocation(row) : null;
}

/** Já existe esse código em algum item? Devolve o dono, se houver. */
export function findBarcodeOwner(code: string): ItemRow | null {
  return findItemByBarcode(code);
}

export function countRows(table: 'locations' | 'categories' | 'items' | 'assets'): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${table} WHERE deleted_at IS NULL`,
  );
  return row?.total ?? 0;
}

export function countTotalValueCents(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(value_cents), 0) AS total FROM assets WHERE deleted_at IS NULL',
  );
  return row?.total ?? 0;
}

export function countPendingChanges(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE rev = 0) +
       (SELECT COUNT(*) FROM assets WHERE rev = 0) +
       (SELECT COUNT(*) FROM categories WHERE rev = 0) +
       (SELECT COUNT(*) FROM locations WHERE rev = 0) +
       (SELECT COUNT(*) FROM item_barcodes WHERE rev = 0) +
       (SELECT COUNT(*) FROM item_aliases WHERE rev = 0) AS total`,
  );
  return row?.total ?? 0;
}
