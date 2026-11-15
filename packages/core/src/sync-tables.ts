/**
 * Registro das tabelas sincronizadas.
 *
 * O sync é genérico: esta lista é a única coisa que muda quando uma tabela nova
 * entra. As linhas viajam em **snake_case** (nome das colunas no banco) — sem
 * camada de mapeamento, que é onde nascem os bugs de campo trocado.
 *
 * Ordem importa: pais antes dos filhos (FKs).
 */

/**
 * Versão do contrato de sync. Muda quando o formato do payload muda.
 * O app recusa sincronizar com servidor de outra versão: erro claro é melhor do
 * que zod reclamando de campo ausente.
 */
export const PROTOCOL_VERSION = 2;

export type ColumnKind = 'text' | 'int';

export type SyncTableSpec = {
  name: string;
  columns: Record<string, ColumnKind>;
  /** colunas que precisam vir preenchidas */
  required: readonly string[];
  /**
   * Colunas `NOT NULL DEFAULT` no banco: `null` do cliente vira o default em vez
   * de estourar constraint (INSERT explícito de NULL ignora o DEFAULT do SQLite).
   */
  defaults?: Readonly<Record<string, string | number>>;
  /** append-only: sem updated_at/deleted_at, insert-only (movimentações) */
  appendOnly?: boolean;
};

const syncTail = {
  deleted_at: 'int',
  created_at: 'int',
  updated_at: 'int',
  rev: 'int',
} as const satisfies Record<string, ColumnKind>;

export const SYNC_TABLES: readonly SyncTableSpec[] = [
  {
    name: 'categories',
    columns: {
      id: 'text',
      household_id: 'text',
      name: 'text',
      parent_id: 'text',
      icon: 'text',
      color: 'text',
      sort_order: 'int',
      ...syncTail,
    },
    required: ['id', 'household_id', 'name', 'created_at', 'updated_at'],
    defaults: { sort_order: 0 },
  },
  {
    name: 'locations',
    columns: {
      id: 'text',
      household_id: 'text',
      name: 'text',
      parent_id: 'text',
      icon: 'text',
      notes: 'text',
      sort_order: 'int',
      ...syncTail,
    },
    required: ['id', 'household_id', 'name', 'created_at', 'updated_at'],
    defaults: { sort_order: 0 },
  },
  {
    name: 'members',
    columns: {
      id: 'text',
      household_id: 'text',
      name: 'text',
      role: 'text',
      avatar_path: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'name', 'role', 'created_at', 'updated_at'],
  },
  {
    name: 'items',
    columns: {
      id: 'text',
      household_id: 'text',
      public_id: 'text',
      name: 'text',
      brand: 'text',
      category_id: 'text',
      kind: 'text',
      base_unit: 'text',
      min_qty: 'int',
      default_location_id: 'text',
      barcode: 'text',
      photo_path: 'text',
      notes: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'public_id', 'name', 'kind', 'base_unit', 'created_at', 'updated_at'],
    defaults: { min_qty: 0 },
  },
  {
    name: 'item_barcodes',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      barcode: 'text',
      format: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'item_id', 'barcode', 'created_at', 'updated_at'],
  },
  {
    name: 'item_aliases',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      alias: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'item_id', 'alias', 'created_at', 'updated_at'],
  },
  {
    name: 'tags',
    columns: {
      id: 'text',
      household_id: 'text',
      name: 'text',
      color: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'name', 'created_at', 'updated_at'],
  },
  {
    name: 'item_tags',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      tag_id: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'item_id', 'tag_id', 'created_at', 'updated_at'],
  },
  {
    name: 'assets',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      public_id: 'text',
      nickname: 'text',
      serial: 'text',
      location_id: 'text',
      status: 'text',
      holder_user_id: 'text',
      acquired_on: 'text',
      value_cents: 'int',
      warranty_until: 'text',
      photo_path: 'text',
      notes: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'item_id', 'public_id', 'status', 'created_at', 'updated_at'],
    defaults: { value_cents: 0 },
  },
  {
    name: 'lots',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      code: 'text',
      location_id: 'text',
      received_on: 'text',
      expires_on: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'item_id', 'created_at', 'updated_at'],
  },
  {
    name: 'movements',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      asset_id: 'text',
      lot_id: 'text',
      location_id: 'text',
      delta: 'int',
      type: 'text',
      price_cents: 'int',
      user_id: 'text',
      note: 'text',
      reverses_id: 'text',
      created_at: 'int',
      rev: 'int',
    },
    required: ['id', 'household_id', 'item_id', 'delta', 'type', 'created_at'],
    defaults: { price_cents: 0 },
    appendOnly: true,
  },
  {
    name: 'maintenance',
    columns: {
      id: 'text',
      household_id: 'text',
      asset_id: 'text',
      kind: 'text',
      done_on: 'text',
      next_on: 'text',
      cost_cents: 'int',
      provider: 'text',
      notes: 'text',
      user_id: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'asset_id', 'created_at', 'updated_at'],
    defaults: { cost_cents: 0 },
  },
  {
    name: 'loans',
    columns: {
      id: 'text',
      household_id: 'text',
      asset_id: 'text',
      borrower_user_id: 'text',
      borrower_name: 'text',
      due_on: 'text',
      returned_at: 'int',
      note: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'asset_id', 'created_at', 'updated_at'],
  },
  {
    name: 'shopping_list',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      label: 'text',
      qty: 'int',
      done_at: 'int',
      note: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'created_at', 'updated_at'],
    defaults: { qty: 0 },
  },
  {
    name: 'attachments',
    columns: {
      id: 'text',
      household_id: 'text',
      item_id: 'text',
      asset_id: 'text',
      kind: 'text',
      path: 'text',
      ...syncTail,
    },
    required: ['id', 'household_id', 'path', 'created_at', 'updated_at'],
  },
];

export const SYNC_TABLE_NAMES = SYNC_TABLES.map((table) => table.name);

export type SyncTableName = (typeof SYNC_TABLES)[number]['name'];

export type SyncRow = Record<string, string | number | null>;

export type SyncCursor = Record<string, number>;

export type SyncPush = Partial<Record<string, SyncRow[]>>;

export type SyncResponse = {
  cursor: SyncCursor;
  hasMore: boolean;
  /** relógio do servidor — o app corrige o skew ao gravar `updated_at` */
  serverTime: number;
  changes: Record<string, SyncRow[]>;
  /** linhas recusadas na validação (não deveria acontecer; ajuda a depurar) */
  rejected: { table: string; id: string | null; reason: string }[];
};

export const emptyCursor = (): SyncCursor =>
  Object.fromEntries(SYNC_TABLES.map((table) => [table.name, 0]));

export function getTableSpec(name: string): SyncTableSpec | undefined {
  return SYNC_TABLES.find((table) => table.name === name);
}

/** Ids públicos das etiquetas QR: 6 chars, sem letras/números ambíguos. */
export const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const PUBLIC_ID_LENGTH = 6;

export function makePublicId(randomByte: (max: number) => number): string {
  let id = '';
  for (let i = 0; i < PUBLIC_ID_LENGTH; i += 1) {
    id += PUBLIC_ID_ALPHABET[randomByte(PUBLIC_ID_ALPHABET.length)];
  }
  return id;
}

/** Compara sem acento e sem caixa — "café" acha "CAFE". */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
