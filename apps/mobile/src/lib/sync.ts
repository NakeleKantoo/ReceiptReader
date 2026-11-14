import type { LocationRow, SyncCursor, SyncResponse } from '@quanto/core';
import { getDatabase, getSetting, setSetting } from '@/db';
import { api } from './api';

const CURSOR_KEY = 'sync_cursor';
const LAST_SYNC_KEY = 'last_sync_at';
const CLOCK_SKEW_KEY = 'clock_skew_ms';
const PAGE_LIMIT = 200;

export type SyncResult = {
  pushed: number;
  pulled: number;
  at: number;
};

type LocalRow = Record<string, unknown>;

function readCursor(): SyncCursor {
  const raw = getSetting(CURSOR_KEY);
  if (!raw) return { categories: 0, locations: 0 };

  try {
    const parsed = JSON.parse(raw) as Partial<SyncCursor>;
    return { categories: parsed.categories ?? 0, locations: parsed.locations ?? 0 };
  } catch {
    return { categories: 0, locations: 0 };
  }
}

export function getLastSyncAt(): number | null {
  const raw = getSetting(LAST_SYNC_KEY);
  return raw ? Number(raw) : null;
}

export function getClockSkewMs(): number {
  const raw = getSetting(CLOCK_SKEW_KEY);
  return raw ? Number(raw) : 0;
}

/** `updatedAt` com o relógio do servidor — LWW só funciona se os relógios concordarem. */
export function serverNow(): number {
  return Date.now() - getClockSkewMs();
}

// ─────────────────────────────────────────────── push: linha local → JSON

function toLocationRow(row: LocalRow): LocationRow {
  return {
    id: String(row.id),
    name: String(row.name),
    parentId: (row.parent_id as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    deletedAt: (row.deleted_at as number | null) ?? null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    rev: Number(row.rev ?? 0),
  };
}

// ─────────────────────────────────────────────── pull: JSON → banco local

function writeLocation(row: LocationRow): void {
  getDatabase().runSync(
    `INSERT INTO locations
      (id, household_id, name, parent_id, icon, notes, sort_order, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       household_id = excluded.household_id,
       name         = excluded.name,
       parent_id    = excluded.parent_id,
       icon         = excluded.icon,
       notes        = excluded.notes,
       sort_order   = excluded.sort_order,
       deleted_at   = excluded.deleted_at,
       created_at   = excluded.created_at,
       updated_at   = excluded.updated_at,
       rev          = excluded.rev`,
    row.id,
    row.householdId ?? '',
    row.name,
    row.parentId ?? null,
    row.icon ?? null,
    row.notes ?? null,
    row.sortOrder ?? 0,
    row.deletedAt ?? null,
    row.createdAt,
    row.updatedAt,
    row.rev ?? 0,
  );
}

function writeCategory(row: SyncResponse['changes']['categories'][number]): void {
  getDatabase().runSync(
    `INSERT INTO categories
      (id, household_id, name, parent_id, icon, color, sort_order, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       household_id = excluded.household_id,
       name         = excluded.name,
       parent_id    = excluded.parent_id,
       icon         = excluded.icon,
       color        = excluded.color,
       sort_order   = excluded.sort_order,
       deleted_at   = excluded.deleted_at,
       created_at   = excluded.created_at,
       updated_at   = excluded.updated_at,
       rev          = excluded.rev`,
    row.id,
    row.householdId ?? '',
    row.name,
    row.parentId ?? null,
    row.icon ?? null,
    row.color ?? null,
    row.sortOrder ?? 0,
    row.deletedAt ?? null,
    row.createdAt,
    row.updatedAt,
    row.rev ?? 0,
  );
}

/**
 * Um round-trip por página: push das linhas sujas (rev = 0) + pull do que mudou.
 * Repete enquanto o servidor disser que há mais.
 */
export async function runSync(token: string): Promise<SyncResult> {
  const db = getDatabase();
  let cursor = readCursor();
  let pushed = 0;
  let pulled = 0;
  let at = Date.now();

  for (let page = 0; page < 5; page += 1) {
    const dirtyLocations = db.getAllSync<LocalRow>(
      'SELECT * FROM locations WHERE rev = 0 LIMIT ?',
      PAGE_LIMIT,
    );
    const dirtyCategories = db.getAllSync<LocalRow>(
      'SELECT * FROM categories WHERE rev = 0 LIMIT ?',
      PAGE_LIMIT,
    );

    const response = await api<SyncResponse>('/api/sync', {
      method: 'POST',
      token,
      body: {
        cursor,
        changes: {
          categories: dirtyCategories.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            parentId: (row.parent_id as string | null) ?? null,
            icon: (row.icon as string | null) ?? null,
            color: (row.color as string | null) ?? null,
            sortOrder: Number(row.sort_order ?? 0),
            deletedAt: (row.deleted_at as number | null) ?? null,
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
            rev: Number(row.rev ?? 0),
          })),
          locations: dirtyLocations.map(toLocationRow),
        },
      },
    });

    db.withTransactionSync(() => {
      for (const row of response.changes.categories) writeCategory(row);
      for (const row of response.changes.locations) writeLocation(row);
    });

    pushed += dirtyLocations.length + dirtyCategories.length;
    pulled += response.changes.locations.length + response.changes.categories.length;
    cursor = response.cursor;
    at = response.serverTime;

    setSetting(CURSOR_KEY, JSON.stringify(cursor));
    setSetting(LAST_SYNC_KEY, String(at));
    setSetting(CLOCK_SKEW_KEY, String(Date.now() - response.serverTime));

    if (!response.hasMore && dirtyLocations.length < PAGE_LIMIT && dirtyCategories.length < PAGE_LIMIT) {
      break;
    }
  }

  return { pushed, pulled, at };
}

/** Esquece o cursor: próximo sync baixa tudo de novo (útil se o banco local se perder). */
export function resetSyncCursor(): void {
  setSetting(CURSOR_KEY, JSON.stringify({ categories: 0, locations: 0 }));
}
