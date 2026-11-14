/**
 * DDL compartilhado entre app (expo-sqlite) e servidor (better-sqlite3).
 * Fonte única da verdade: se `schema.ts` mudar, entra uma nova migração aqui.
 *
 * Aplicação: `PRAGMA user_version` guarda a última versão aplicada.
 */

export type Migration = { version: number; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT,
  invite_expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  avatar_path TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS users_household_idx ON users(household_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  device_name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS categories_household_idx ON categories(household_id, rev);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  icon TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS locations_household_idx ON locations(household_id, rev);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category_id TEXT,
  kind TEXT NOT NULL DEFAULT 'consumable',
  base_unit TEXT NOT NULL DEFAULT 'un',
  min_qty INTEGER NOT NULL DEFAULT 0,
  default_location_id TEXT,
  barcode TEXT,
  photo_path TEXT,
  notes TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS items_public_id_idx ON items(public_id);
CREATE INDEX IF NOT EXISTS items_household_idx ON items(household_id, rev);
CREATE INDEX IF NOT EXISTS items_name_idx ON items(name);

CREATE TABLE IF NOT EXISTS item_barcodes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  format TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS item_barcodes_code_idx ON item_barcodes(barcode);

CREATE TABLE IF NOT EXISTS item_aliases (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS item_aliases_item_idx ON item_aliases(item_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_tags (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS item_tags_item_idx ON item_tags(item_id);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL,
  nickname TEXT,
  serial TEXT,
  location_id TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  holder_user_id TEXT,
  acquired_on TEXT,
  value_cents INTEGER NOT NULL DEFAULT 0,
  warranty_until TEXT,
  photo_path TEXT,
  notes TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS assets_public_id_idx ON assets(public_id);
CREATE INDEX IF NOT EXISTS assets_household_idx ON assets(household_id, rev);
CREATE INDEX IF NOT EXISTS assets_item_idx ON assets(item_id);

CREATE TABLE IF NOT EXISTS lots (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  code TEXT,
  location_id TEXT,
  received_on TEXT,
  expires_on TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lots_item_idx ON lots(item_id);
CREATE INDEX IF NOT EXISTS lots_expires_idx ON lots(expires_on);

CREATE TABLE IF NOT EXISTS movements (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  asset_id TEXT,
  lot_id TEXT,
  location_id TEXT,
  delta INTEGER NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT,
  note TEXT,
  reverses_id TEXT,
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS movements_item_idx ON movements(item_id, created_at);
CREATE INDEX IF NOT EXISTS movements_asset_idx ON movements(asset_id, created_at);
CREATE INDEX IF NOT EXISTS movements_household_idx ON movements(household_id, rev);

CREATE TABLE IF NOT EXISTS maintenance (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind TEXT,
  done_on TEXT,
  next_on TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  notes TEXT,
  user_id TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS maintenance_asset_idx ON maintenance(asset_id);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  borrower_user_id TEXT,
  borrower_name TEXT,
  due_on TEXT,
  returned_at INTEGER,
  note TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS loans_asset_idx ON loans(asset_id);

CREATE TABLE IF NOT EXISTS shopping_list (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_id TEXT,
  label TEXT,
  qty INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  note TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS shopping_household_idx ON shopping_list(household_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  item_id TEXT,
  asset_id TEXT,
  kind TEXT,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS attachments_item_idx ON attachments(item_id);

CREATE TABLE IF NOT EXISTS product_cache (
  barcode TEXT PRIMARY KEY,
  name TEXT,
  brand TEXT,
  image_url TEXT,
  fetched_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('rev', '0');
`,
  },
  {
    version: 2,
    /**
     * F1: tabelas filhas ganham `household_id` próprio. Sem isso o pull precisa
     * fazer join com o pai só para saber de quem é a linha.
     */
    sql: `
ALTER TABLE item_barcodes ADD COLUMN household_id TEXT NOT NULL DEFAULT '';
ALTER TABLE item_aliases ADD COLUMN household_id TEXT NOT NULL DEFAULT '';
ALTER TABLE item_tags ADD COLUMN household_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS item_barcodes_household_idx ON item_barcodes(household_id, rev);
CREATE INDEX IF NOT EXISTS item_aliases_household_idx ON item_aliases(household_id, rev);
CREATE INDEX IF NOT EXISTS item_tags_household_idx ON item_tags(household_id, rev);
CREATE INDEX IF NOT EXISTS tags_household_idx ON tags(household_id, rev);
CREATE INDEX IF NOT EXISTS lots_household_idx ON lots(household_id, rev);
CREATE INDEX IF NOT EXISTS maintenance_household_idx ON maintenance(household_id, rev);
CREATE INDEX IF NOT EXISTS loans_household_idx ON loans(household_id, rev);
CREATE INDEX IF NOT EXISTS attachments_household_idx ON attachments(household_id, rev);
`,
  },
  {
    version: 3,
    /**
     * F3: a timeline de movimentações precisa do nome de quem fez. `users`
     * guarda hash de senha e nunca sai do servidor, então o que sincroniza é
     * `members` — pessoas da casa, sem segredo.
     */
    sql: `
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  avatar_path TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS members_household_idx ON members(household_id, rev);

INSERT OR IGNORE INTO members (id, household_id, name, role, created_at, updated_at, rev)
SELECT id, household_id, name, role, created_at, created_at, 0 FROM users;
`,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
