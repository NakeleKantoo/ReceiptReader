import * as SQLite from 'expo-sqlite';
import { LATEST_VERSION, MIGRATIONS } from '@quanto/core';

const DB_NAME = 'quanto.db';

let database: SQLite.SQLiteDatabase | null = null;

function migrate(db: SQLite.SQLiteDatabase): void {
  const current =
    db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;

  if (current >= LATEST_VERSION) return;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    db.withTransactionSync(() => {
      db.execSync(migration.sql);
      // PRAGMA não aceita parâmetro; o valor vem do código, não do usuário.
      db.execSync(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
    });
  }
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (database) return database;

  const db = SQLite.openDatabaseSync(DB_NAME);
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');
  migrate(db);

  // tabela que existe só no aparelho (cursor de sync, preferências)
  db.execSync(
    'CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  );

  database = db;
  return db;
}

export function getSetting(key: string): string | null {
  const row = getDatabase().getFirstSync<{ value: string }>(
    'SELECT value FROM local_settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDatabase().runSync(
    'INSERT INTO local_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function removeSetting(key: string): void {
  getDatabase().runSync('DELETE FROM local_settings WHERE key = ?', key);
}

export function resetLocalDatabase(): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    for (const table of ['locations', 'categories', 'items', 'assets', 'movements']) {
      db.execSync(`DELETE FROM ${table};`);
    }
    db.execSync('DELETE FROM local_settings;');
  });
}
