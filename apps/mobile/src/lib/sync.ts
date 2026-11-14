import {
  SYNC_TABLES,
  emptyCursor,
  type SyncCursor,
  type SyncResponse,
  type SyncRow,
  type SyncTableSpec,
} from '@quanto/core';
import { getDatabase, getSetting, setSetting } from '@/db';
import { api } from './api';

const CURSOR_KEY = 'sync_cursor';
const LAST_SYNC_KEY = 'last_sync_at';
const CLOCK_SKEW_KEY = 'clock_skew_ms';
const PUSH_LIMIT = 200;

export type SyncResult = { pushed: number; pulled: number; at: number; rejected: number };

export function readCursor(): SyncCursor {
  const raw = getSetting(CURSOR_KEY);
  const cursor = emptyCursor();
  if (!raw) return cursor;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const table of SYNC_TABLES) {
      const value = Number(parsed[table.name]);
      cursor[table.name] = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
    }
  } catch {
    return emptyCursor();
  }

  return cursor;
}

export function getLastSyncAt(): number | null {
  const raw = getSetting(LAST_SYNC_KEY);
  return raw ? Number(raw) : null;
}

export function getClockSkewMs(): number {
  const raw = getSetting(CLOCK_SKEW_KEY);
  return raw ? Number(raw) : 0;
}

/** `updated_at` com o relógio do servidor — LWW só funciona se os relógios concordarem. */
export function serverNow(): number {
  return Date.now() - getClockSkewMs();
}

export function resetSyncCursor(): void {
  setSetting(CURSOR_KEY, JSON.stringify(emptyCursor()));
}

const upsertCache = new Map<string, { columns: string[]; sql: string }>();

function buildLocalUpsert(spec: SyncTableSpec) {
  const cached = upsertCache.get(spec.name);
  if (cached) return cached;

  const columns = Object.keys(spec.columns);
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((column) => !['id', 'household_id', 'created_at'].includes(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');

  // pull sobrescreve: depois do push o servidor é a autoridade
  const sql = spec.appendOnly
    ? `INSERT OR IGNORE INTO ${spec.name} (${columns.join(', ')}) VALUES (${placeholders})`
    : `INSERT INTO ${spec.name} (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates}`;

  const entry = { columns, sql };
  upsertCache.set(spec.name, entry);
  return entry;
}

function applyRow(spec: SyncTableSpec, row: SyncRow): void {
  const { columns, sql } = buildLocalUpsert(spec);
  getDatabase().runSync(sql, ...columns.map((column) => row[column] ?? null));
}

/**
 * Push das linhas sujas (`rev = 0`) + pull do que mudou, por página.
 * Genérico sobre `SYNC_TABLES`: tabela nova não exige código novo aqui.
 */
export async function runSync(token: string): Promise<SyncResult> {
  const db = getDatabase();
  let cursor = readCursor();
  let pushed = 0;
  let pulled = 0;
  let rejected = 0;
  let at = Date.now();

  for (let page = 0; page < 5; page += 1) {
    const changes: Record<string, SyncRow[]> = {};
    let dirtyCount = 0;

    for (const spec of SYNC_TABLES) {
      const rows = db.getAllSync<SyncRow>(
        `SELECT * FROM ${spec.name} WHERE rev = 0 LIMIT ?`,
        PUSH_LIMIT,
      );
      if (rows.length === 0) continue;
      changes[spec.name] = rows;
      dirtyCount += rows.length;
    }

    const response = await api<SyncResponse>('/api/sync', {
      method: 'POST',
      token,
      body: { cursor, changes },
    });

    db.withTransactionSync(() => {
      for (const spec of SYNC_TABLES) {
        for (const row of response.changes[spec.name] ?? []) applyRow(spec, row);
      }
    });

    pushed += dirtyCount;
    rejected += response.rejected?.length ?? 0;
    pulled += Object.values(response.changes).reduce((total, rows) => total + rows.length, 0);

    cursor = { ...cursor, ...response.cursor };
    at = response.serverTime;

    setSetting(CURSOR_KEY, JSON.stringify(cursor));
    setSetting(LAST_SYNC_KEY, String(at));
    setSetting(CLOCK_SKEW_KEY, String(Date.now() - response.serverTime));

    if (!response.hasMore && dirtyCount < PUSH_LIMIT) break;
  }

  return { pushed, pulled, at, rejected };
}
