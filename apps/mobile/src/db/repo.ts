import { getRandomBytes } from 'expo-crypto';
import {
  daysUntil,
  makePublicId,
  normalizeSearch,
  todayIso,
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
const USER_KEY = 'user_id';

/** Gravado no login: toda linha nova precisa do escopo da casa. */
export function setCurrentHousehold(householdId: string): void {
  setSetting(HOUSEHOLD_KEY, householdId);
}

export function setCurrentUser(userId: string): void {
  setSetting(USER_KEY, userId);
}

export function getCurrentUser(): string | null {
  return getSetting(USER_KEY);
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

// ─────────────────────────────────────────────── pessoas

export type MemberRow = { id: string; name: string; role: 'admin' | 'member' };

export function listMembers(): MemberRow[] {
  return getDatabase().getAllSync<Row>(
    'SELECT id, name, role FROM members WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE',
  ) as unknown as MemberRow[];
}

// ─────────────────────────────────────────────── movimentações

export type MovementType =
  | 'in'
  | 'consume'
  | 'checkout'
  | 'checkin'
  | 'adjust'
  | 'transfer'
  | 'discard'
  | 'maintenance'
  | 'revert';

export type MovementRow = {
  id: string;
  itemId: string;
  assetId: string | null;
  lotId: string | null;
  locationId: string | null;
  delta: number;
  type: MovementType;
  userId: string | null;
  userName: string | null;
  locationName: string | null;
  note: string | null;
  reversesId: string | null;
  createdAt: number;
  /** já existe um movimento que desfaz este */
  reverted: boolean;
};

const MOVEMENT_SELECT = `
  SELECT m.*, u.name AS user_name, l.name AS location_name,
         EXISTS (SELECT 1 FROM movements r WHERE r.reverses_id = m.id) AS reverted
  FROM movements m
  LEFT JOIN members u ON u.id = m.user_id
  LEFT JOIN locations l ON l.id = m.location_id
`;

function toMovement(row: Row): MovementRow {
  return {
    id: str(row.id),
    itemId: str(row.item_id),
    assetId: strOrNull(row.asset_id),
    lotId: strOrNull(row.lot_id),
    locationId: strOrNull(row.location_id),
    delta: num(row.delta),
    type: str(row.type) as MovementType,
    userId: strOrNull(row.user_id),
    userName: strOrNull(row.user_name),
    locationName: strOrNull(row.location_name),
    note: strOrNull(row.note),
    reversesId: strOrNull(row.reverses_id),
    createdAt: num(row.created_at),
    reverted: num(row.reverted) === 1,
  };
}

export function listMovements(filter: { itemId?: string; assetId?: string; limit?: number } = {}): MovementRow[] {
  const limit = filter.limit ?? 50;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.itemId) {
    conditions.push('m.item_id = ?');
    params.push(filter.itemId);
  }
  if (filter.assetId) {
    conditions.push('m.asset_id = ?');
    params.push(filter.assetId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = getDatabase().getAllSync<Row>(
    `${MOVEMENT_SELECT} ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    ...params,
    limit,
  );
  return rows.map(toMovement);
}

export type MovementInput = {
  itemId: string;
  delta: number;
  type: MovementType;
  locationId?: string | null;
  assetId?: string | null;
  note?: string | null;
  reversesId?: string | null;
  lotId?: string | null;
  /** data explícita (usado ao transferir: par de movimentos com o mesmo instante) */
  createdAt?: number;
};

function insertMovement(input: MovementInput): string {
  const id = newId();
  getDatabase().runSync(
    `INSERT INTO movements
       (id, household_id, item_id, asset_id, lot_id, location_id, delta, type, user_id, note, reverses_id, created_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    id,
    getCurrentHousehold(),
    input.itemId,
    input.assetId ?? null,
    input.lotId ?? null,
    input.locationId ?? null,
    input.delta,
    input.type,
    getCurrentUser(),
    input.note?.trim() || null,
    input.reversesId ?? null,
    input.createdAt ?? serverNow(),
  );
  return id;
}

/**
 * Saída para consumo/descarte: delta negativo. Se o item tem lotes, a baixa
 * segue FEFO — primeiro a vencer primeiro — e pode virar várias linhas.
 */
export function registerMovement(input: {
  itemId: string;
  type: MovementType;
  amount: number;
  locationId?: string | null;
  assetId?: string | null;
  lotId?: string | null;
  note?: string | null;
}): string[] {
  const amount = Math.abs(input.amount);
  const negative = input.type === 'consume' || input.type === 'discard' || input.type === 'checkout';

  if (!negative || input.lotId) {
    return [insertMovement({ ...input, delta: negative ? -amount : amount })];
  }

  const lots = listLots(input.itemId).filter((lot) => lot.remaining > 0);
  if (lots.length === 0) return [insertMovement({ ...input, delta: -amount })];

  const ordered = [...lots].sort((a, b) => {
    if (a.expiresOn && b.expiresOn) return a.expiresOn.localeCompare(b.expiresOn);
    if (a.expiresOn) return -1;
    if (b.expiresOn) return 1;
    return a.createdAt - b.createdAt;
  });

  const ids: string[] = [];
  let left = amount;

  getDatabase().withTransactionSync(() => {
    for (const lot of ordered) {
      if (left <= 0) break;
      const take = Math.min(lot.remaining, left);
      ids.push(insertMovement({ ...input, delta: -take, lotId: lot.id }));
      left -= take;
    }
    // sobrou consumo além dos lotes registrados
    if (left > 0) ids.push(insertMovement({ ...input, delta: -left, lotId: null }));
  });

  return ids;
}

/** Transferência: par de movimentos com o mesmo instante (o total não muda). */
export function transferStock(input: {
  itemId: string;
  amount: number;
  fromLocationId: string;
  toLocationId: string;
  note?: string | null;
}): void {
  const amount = Math.abs(input.amount);
  const at = serverNow();
  const db = getDatabase();

  db.withTransactionSync(() => {
    insertMovement({
      itemId: input.itemId,
      delta: -amount,
      type: 'transfer',
      locationId: input.fromLocationId,
      note: input.note,
      createdAt: at,
    });
    insertMovement({
      itemId: input.itemId,
      delta: amount,
      type: 'transfer',
      locationId: input.toLocationId,
      note: input.note,
      createdAt: at + 1,
    });
  });
}

/** Ajuste: o delta é a diferença entre o contado e o saldo atual. */
export function adjustStock(input: {
  itemId: string;
  counted: number;
  locationId?: string | null;
  note?: string | null;
}): number {
  const current = stockFor(input.itemId).quantity;
  const delta = input.counted - current;
  if (delta === 0) return 0;

  insertMovement({
    itemId: input.itemId,
    delta,
    type: 'adjust',
    locationId: input.locationId ?? null,
    note: input.note,
  });
  return delta;
}

export function isReverted(movementId: string): boolean {
  const row = getDatabase().getFirstSync<Row>(
    'SELECT id FROM movements WHERE reverses_id = ? LIMIT 1',
    movementId,
  );
  return Boolean(row);
}

/**
 * Desfazer não apaga: insere a linha inversa apontando para a original.
 * Assim o histórico continua auditável e o sync segue append-only.
 */
export function revertMovement(movementId: string): void {
  const row = getDatabase().getFirstSync<Row>('SELECT * FROM movements WHERE id = ?', movementId);
  if (!row) throw new Error('Movimentação não encontrada');

  if (row.reverses_id) throw new Error('Não é possível desfazer um desfazimento');
  if (isReverted(movementId)) throw new Error('Essa movimentação já foi desfeita');

  const movement = toMovement(row);

  insertMovement({
    itemId: movement.itemId,
    delta: -movement.delta,
    type: 'revert',
    locationId: movement.locationId,
    assetId: movement.assetId,
    note: `desfaz ${movement.type}`,
    reversesId: movement.id,
  });

  // retirada/devolução de bem também mexe no estado da unidade
  if (movement.assetId) {
    if (movement.type === 'checkout') syncAssetFromMovements(movement.assetId);
    if (movement.type === 'checkin') syncAssetFromMovements(movement.assetId);
  }
}

// ─────────────────────────────────────────────── saldo

export type StockInfo = {
  /** inteiro na unidade base (consumível) ou contagem de bens (durável) */
  quantity: number;
  byLocation: { locationId: string | null; locationName: string | null; quantity: number }[];
};

/**
 * Consumível: saldo = soma dos movimentos. Durável: saldo = unidades físicas
 * existentes (cada bem é uma linha em `assets`).
 */
export function stockFor(itemId: string): StockInfo {
  const item = getItem(itemId);

  if (item?.kind === 'durable') {
    const rows = getDatabase().getAllSync<Row>(
      `SELECT location_id, COUNT(*) AS total
       FROM assets WHERE item_id = ? AND deleted_at IS NULL AND status != 'disposed'
       GROUP BY location_id`,
      itemId,
    );

    return {
      quantity: rows.reduce((total, row) => total + num(row.total), 0),
      byLocation: rows.map((row) => ({
        locationId: strOrNull(row.location_id),
        locationName: null,
        quantity: num(row.total),
      })),
    };
  }

  const rows = getDatabase().getAllSync<Row>(
    `SELECT m.location_id, l.name AS location_name, SUM(m.delta) AS total
     FROM movements m
     LEFT JOIN locations l ON l.id = m.location_id
     WHERE m.item_id = ?
     GROUP BY m.location_id`,
    itemId,
  );

  return {
    quantity: rows.reduce((total, row) => total + num(row.total), 0),
    byLocation: rows
      .map((row) => ({
        locationId: strOrNull(row.location_id),
        locationName: strOrNull(row.location_name),
        quantity: num(row.total),
      }))
      .filter((entry) => entry.quantity !== 0),
  };
}

export function lowStockItems(): ItemRow[] {
  return listItems().filter((item) => item.kind === 'consumable' && item.minQty > 0 && stockFor(item.id).quantity <= item.minQty);
}

/** Última movimentação de um bem, para saber quem está com ele. */
export function lastAssetMovement(assetId: string): MovementRow | null {
  const [movement] = listMovements({ assetId, limit: 1 });
  return movement ?? null;
}

/** Recalcula status/dono do bem a partir da timeline (retirada sem devolução = em uso). */
export function syncAssetFromMovements(assetId: string): void {
  const movement = lastAssetMovement(assetId);
  if (!movement) return;

  const asset = getAsset(assetId);
  if (!asset) return;

  const holder = movement.type === 'checkout' || movement.type === 'checkin' ? movement.userId : asset.holderUserId;
  const status =
    movement.type === 'checkout'
      ? 'in_use'
      : movement.type === 'checkin'
        ? 'available'
        : asset.status;

  getDatabase().runSync(
    'UPDATE assets SET status = ?, holder_user_id = ?, updated_at = ?, rev = 0 WHERE id = ?',
    status,
    movement.type === 'checkin' ? null : holder,
    serverNow(),
    assetId,
  );
}

export function checkoutAsset(assetId: string, note?: string | null): void {
  const asset = getAsset(assetId);
  if (!asset) throw new Error('Bem não encontrado');

  insertMovement({
    itemId: asset.itemId,
    assetId,
    delta: -1,
    type: 'checkout',
    locationId: asset.locationId,
    note,
  });
  syncAssetFromMovements(assetId);
}

export function checkinAsset(assetId: string, locationId?: string | null, note?: string | null): void {
  const asset = getAsset(assetId);
  if (!asset) throw new Error('Bem não encontrado');

  insertMovement({
    itemId: asset.itemId,
    assetId,
    delta: 1,
    type: 'checkin',
    locationId: locationId ?? asset.locationId,
    note,
  });
  syncAssetFromMovements(assetId);
}

// ─────────────────────────────────────────────── lotes e validade

export type LotRow = {
  id: string;
  itemId: string;
  itemName: string;
  code: string | null;
  expiresOn: string | null;
  receivedOn: string | null;
  locationId: string | null;
  /** quanto ainda existe neste lote (soma dos movimentos ligados a ele) */
  remaining: number;
  /** unidade base do item, para formatar a quantidade */
  baseUnit: BaseUnitName;
  createdAt: number;
};

const LOT_SELECT = `
  SELECT l.id, l.item_id, l.code, l.expires_on, l.received_on, l.location_id, l.created_at,
         i.name AS item_name, i.base_unit AS base_unit,
         (SELECT COALESCE(SUM(m.delta), 0) FROM movements m WHERE m.lot_id = l.id) AS remaining
  FROM lots l
  JOIN items i ON i.id = l.item_id
  WHERE l.deleted_at IS NULL AND i.deleted_at IS NULL
`;

function toLot(row: Row): LotRow {
  return {
    id: str(row.id),
    itemId: str(row.item_id),
    itemName: str(row.item_name),
    code: strOrNull(row.code),
    expiresOn: strOrNull(row.expires_on),
    receivedOn: strOrNull(row.received_on),
    locationId: strOrNull(row.location_id),
    remaining: num(row.remaining),
    baseUnit: (str(row.base_unit) || 'un') as BaseUnitName,
    createdAt: num(row.created_at),
  };
}

export function listLots(itemId?: string): LotRow[] {
  const rows = itemId
    ? getDatabase().getAllSync<Row>(
        `${LOT_SELECT} AND l.item_id = ? ORDER BY l.expires_on IS NULL, l.expires_on`,
        itemId,
      )
    : getDatabase().getAllSync<Row>(
        `${LOT_SELECT} ORDER BY l.expires_on IS NULL, l.expires_on`,
      );

  return rows.map(toLot);
}

/** Lotes com saldo, vencidos ou vencendo em `days` dias. */
export function expiringLots(days = 7): LotRow[] {
  return listLots().filter((lot) => {
    if (lot.remaining <= 0 || !lot.expiresOn) return false;
    const until = daysUntil(lot.expiresOn);
    return until !== null && until <= days;
  });
}

export function createLot(input: {
  itemId: string;
  expiresOn?: string | null;
  receivedOn?: string | null;
  code?: string | null;
  locationId?: string | null;
}): string {
  const id = newId();
  const now = serverNow();

  getDatabase().runSync(
    `INSERT INTO lots (id, household_id, item_id, code, location_id, received_on, expires_on, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
    id,
    getCurrentHousehold(),
    input.itemId,
    input.code?.trim() || null,
    input.locationId ?? null,
    input.receivedOn ?? todayIso(),
    input.expiresOn ?? null,
    now,
    now,
  );

  return id;
}

export function deleteLot(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE lots SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

/** Entrada com validade: cria o lote e amarra a movimentação a ele. */
export function registerEntryWithLot(input: {
  itemId: string;
  amount: number;
  expiresOn?: string | null;
  locationId?: string | null;
  note?: string | null;
}): void {
  const lotId = input.expiresOn
    ? createLot({ itemId: input.itemId, expiresOn: input.expiresOn, locationId: input.locationId })
    : null;

  insertMovement({
    itemId: input.itemId,
    delta: Math.abs(input.amount),
    type: 'in',
    locationId: input.locationId ?? null,
    lotId,
    note: input.note,
  });
}

// ─────────────────────────────────────────────── lista de compras

export type ShoppingRow = {
  id: string;
  itemId: string | null;
  label: string;
  qty: number;
  doneAt: number | null;
  note: string | null;
  unit: BaseUnitName;
};

export function listShopping(): ShoppingRow[] {
  return getDatabase()
    .getAllSync<Row>(
      `SELECT s.id, s.item_id, s.label, s.qty, s.done_at, s.note, i.name AS item_name, i.base_unit
       FROM shopping_list s
       LEFT JOIN items i ON i.id = s.item_id
       WHERE s.deleted_at IS NULL
       ORDER BY s.done_at IS NOT NULL, i.name COLLATE NOCASE, s.label COLLATE NOCASE`,
    )
    .map((row) => ({
      id: str(row.id),
      itemId: strOrNull(row.item_id),
      label: strOrNull(row.item_name) ?? str(row.label),
      qty: num(row.qty),
      doneAt: row.done_at === null ? null : num(row.done_at),
      note: strOrNull(row.note),
      unit: (str(row.base_unit) || 'un') as BaseUnitName,
    }));
}

export function addShopping(input: { itemId?: string | null; label?: string | null; qty?: number }): void {
  const now = serverNow();
  getDatabase().runSync(
    `INSERT INTO shopping_list (id, household_id, item_id, label, qty, done_at, note, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 0)`,
    newId(),
    getCurrentHousehold(),
    input.itemId ?? null,
    input.label?.trim() || null,
    input.qty ?? 0,
    now,
    now,
  );
}

export function setShoppingDone(id: string, done: boolean): void {
  getDatabase().runSync(
    'UPDATE shopping_list SET done_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    done ? serverNow() : null,
    serverNow(),
    id,
  );
}

export function deleteShopping(id: string): void {
  const now = serverNow();
  getDatabase().runSync(
    'UPDATE shopping_list SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

/** Itens abaixo do mínimo que ainda não estão na lista. */
export function shoppingSuggestions(): { itemId: string; name: string; missing: number; unit: BaseUnitName }[] {
  const open = new Set(listShopping().filter((row) => row.doneAt === null && row.itemId).map((row) => row.itemId));

  return lowStockItems()
    .filter((item) => !open.has(item.id))
    .map((item) => {
      const current = stockFor(item.id).quantity;
      return {
        itemId: item.id,
        name: item.name,
        missing: Math.max(1, item.minQty - current),
        unit: item.baseUnit,
      };
    });
}

/** "Comprei": dá entrada no item e fecha a linha da lista. */
export function markPurchased(row: ShoppingRow): void {
  if (row.itemId) {
    const amount = row.qty > 0 ? row.qty : 1;
    registerMovement({ itemId: row.itemId, type: 'in', amount });
  }
  setShoppingDone(row.id, true);
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
