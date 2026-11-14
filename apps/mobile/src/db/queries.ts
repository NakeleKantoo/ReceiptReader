import type { Category, Location } from '@quanto/core';
import { getDatabase } from './index';
import { newId } from '@/lib/id';

type LocationRow = {
  id: string;
  household_id: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  notes: string | null;
  sort_order: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  rev: number;
};

type CategoryRow = {
  id: string;
  household_id: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  rev: number;
};

function toLocation(row: LocationRow): Location {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    parentId: row.parent_id,
    icon: row.icon,
    notes: row.notes,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: row.rev,
  };
}

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    parentId: row.parent_id,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: row.rev,
  };
}

export function listLocations(): Location[] {
  const rows = getDatabase().getAllSync<LocationRow>(
    'SELECT * FROM locations WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
  );
  return rows.map(toLocation);
}

export function listCategories(): Category[] {
  const rows = getDatabase().getAllSync<CategoryRow>(
    'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name COLLATE NOCASE',
  );
  return rows.map(toCategory);
}

export function countRows(table: 'locations' | 'categories' | 'items' | 'assets'): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${table} WHERE deleted_at IS NULL`,
  );
  return row?.total ?? 0;
}

export function countPendingChanges(): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    `SELECT (SELECT COUNT(*) FROM locations WHERE rev = 0) + (SELECT COUNT(*) FROM categories WHERE rev = 0) AS total`,
  );
  return row?.total ?? 0;
}

export function createLocation(input: {
  householdId: string;
  name: string;
  parentId?: string | null;
  icon?: string | null;
  notes?: string | null;
}): Location {
  const now = Date.now();
  const id = newId();

  getDatabase().runSync(
    `INSERT INTO locations
      (id, household_id, name, parent_id, icon, notes, sort_order, deleted_at, created_at, updated_at, rev)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 0)`,
    id,
    input.householdId,
    input.name.trim(),
    input.parentId ?? null,
    input.icon ?? null,
    input.notes ?? null,
    now,
    now,
  );

  return {
    id,
    householdId: input.householdId,
    name: input.name.trim(),
    parentId: input.parentId ?? null,
    icon: input.icon ?? null,
    notes: input.notes ?? null,
    sortOrder: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

export function renameLocation(id: string, name: string): void {
  const now = Date.now();
  getDatabase().runSync(
    'UPDATE locations SET name = ?, updated_at = ?, rev = 0 WHERE id = ?',
    name.trim(),
    now,
    id,
  );
}

export function deleteLocation(id: string): void {
  const now = Date.now();
  getDatabase().runSync(
    'UPDATE locations SET deleted_at = ?, updated_at = ?, rev = 0 WHERE id = ?',
    now,
    now,
    id,
  );
}

/** Quantos itens estão neste local (F1 vai usar de verdade). */
export function countItemsInLocation(locationId: string): number {
  const row = getDatabase().getFirstSync<{ total: number }>(
    'SELECT COUNT(*) AS total FROM items WHERE default_location_id = ? AND deleted_at IS NULL',
    locationId,
  );
  return row?.total ?? 0;
}
