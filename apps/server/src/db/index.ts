import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from '@quanto/core';
import { env, isProd } from '../env.ts';

export type DB = Database.Database;

let instance: DB | null = null;

export function openDatabase(path = env.DATABASE_PATH): DB {
  const filename = resolve(path);
  mkdirSync(dirname(filename), { recursive: true });

  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (isProd) db.pragma('synchronous = NORMAL');

  return db;
}

export function applyMigrations(db: DB, migrations: Migration[] = MIGRATIONS): number[] {
  const current = Number(db.pragma('user_version', { simple: true }) ?? 0);
  const applied: number[] = [];

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    applied.push(migration.version);
  }

  return applied;
}

export function getDb(): DB {
  if (!instance) {
    instance = openDatabase();
    applyMigrations(instance);
  }
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** Rev global e monotônico — cursor de sync entre todas as tabelas. */
export function nextRev(db: DB): number {
  const row = db.prepare(`SELECT value FROM meta WHERE key = 'rev'`).get() as { value: string } | undefined;
  const next = Number(row?.value ?? 0) + 1;
  db.prepare(`INSERT INTO meta (key, value) VALUES ('rev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    String(next),
  );
  return next;
}
