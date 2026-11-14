import { Router } from 'express';
import { syncRequestSchema } from '@quanto/core';
import type { DB } from '../db/index.ts';
import { nextRev } from '../db/index.ts';
import { asyncHandler } from '../lib/errors.ts';

/** Quantas linhas por tabela em cada pull. */
const PAGE_LIMIT = 500;

type PulledRow = { rev: number };

/**
 * Sync bidirecional em um round-trip.
 *
 * Push: LWW por `updated_at` do próprio registro, com carimbo do servidor
 * (`max(cliente, servidor+1)`) para que a comparação seja sempre consistente.
 * Pull: cursor **por tabela** — um cursor global pularia linhas quando uma tabela
 * bate no limite de página e a outra não.
 */
export function syncRoutes(db: DB): Router {
  const router = Router();

  const upsertCategory = db.prepare(`
    INSERT INTO categories
      (id, household_id, name, parent_id, icon, color, sort_order, deleted_at, created_at, updated_at, rev)
    VALUES
      (@id, @householdId, @name, @parentId, @icon, @color, @sortOrder, @deletedAt, @createdAt, @updatedAt, @rev)
    ON CONFLICT(id) DO UPDATE SET
      name       = excluded.name,
      parent_id  = excluded.parent_id,
      icon       = excluded.icon,
      color      = excluded.color,
      sort_order = excluded.sort_order,
      deleted_at = excluded.deleted_at,
      updated_at = max(excluded.updated_at, categories.updated_at + 1),
      rev        = excluded.rev
    WHERE excluded.household_id = categories.household_id
      AND excluded.updated_at >= categories.updated_at
  `);

  const upsertLocation = db.prepare(`
    INSERT INTO locations
      (id, household_id, name, parent_id, icon, notes, sort_order, deleted_at, created_at, updated_at, rev)
    VALUES
      (@id, @householdId, @name, @parentId, @icon, @notes, @sortOrder, @deletedAt, @createdAt, @updatedAt, @rev)
    ON CONFLICT(id) DO UPDATE SET
      name       = excluded.name,
      parent_id  = excluded.parent_id,
      icon       = excluded.icon,
      notes      = excluded.notes,
      sort_order = excluded.sort_order,
      deleted_at = excluded.deleted_at,
      updated_at = max(excluded.updated_at, locations.updated_at + 1),
      rev        = excluded.rev
    WHERE excluded.household_id = locations.household_id
      AND excluded.updated_at >= locations.updated_at
  `);

  const pullCategories = db.prepare(`
    SELECT id, household_id AS householdId, name, parent_id AS parentId, icon, color,
           sort_order AS sortOrder, deleted_at AS deletedAt, created_at AS createdAt,
           updated_at AS updatedAt, rev
    FROM categories
    WHERE household_id = ? AND rev > ?
    ORDER BY rev ASC
    LIMIT ?
  `);

  const pullLocations = db.prepare(`
    SELECT id, household_id AS householdId, name, parent_id AS parentId, icon, notes,
           sort_order AS sortOrder, deleted_at AS deletedAt, created_at AS createdAt,
           updated_at AS updatedAt, rev
    FROM locations
    WHERE household_id = ? AND rev > ?
    ORDER BY rev ASC
    LIMIT ?
  `);

  const countPending = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM categories WHERE household_id = ?) AS categories,
      (SELECT COUNT(*) FROM locations WHERE household_id = ?) AS locations
  `);

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      const { cursor, changes } = syncRequestSchema.parse(req.body ?? {});

      const payload = db.transaction(() => {
        let pushed = 0;

        for (const row of changes.categories ?? []) {
          const info = upsertCategory.run({
            id: row.id,
            householdId: auth.householdId,
            name: row.name,
            parentId: row.parentId ?? null,
            icon: row.icon ?? null,
            color: row.color ?? null,
            sortOrder: row.sortOrder ?? 0,
            deletedAt: row.deletedAt ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            rev: nextRev(db),
          });
          pushed += info.changes;
        }

        for (const row of changes.locations ?? []) {
          const info = upsertLocation.run({
            id: row.id,
            householdId: auth.householdId,
            name: row.name,
            parentId: row.parentId ?? null,
            icon: row.icon ?? null,
            notes: row.notes ?? null,
            sortOrder: row.sortOrder ?? 0,
            deletedAt: row.deletedAt ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            rev: nextRev(db),
          });
          pushed += info.changes;
        }

        const categories = pullCategories.all(auth.householdId, cursor.categories, PAGE_LIMIT) as PulledRow[];
        const locations = pullLocations.all(auth.householdId, cursor.locations, PAGE_LIMIT) as PulledRow[];

        return {
          pushed,
          hasMore: categories.length === PAGE_LIMIT || locations.length === PAGE_LIMIT,
          cursor: {
            categories: categories.length ? categories[categories.length - 1]!.rev : cursor.categories,
            locations: locations.length ? locations[locations.length - 1]!.rev : cursor.locations,
          },
          changes: { categories, locations },
        };
      })();

      res.json({ ...payload, serverTime: Date.now() });
    }),
  );

  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      res.json({
        ...(countPending.get(auth.householdId, auth.householdId) as object),
        serverTime: Date.now(),
      });
    }),
  );

  return router;
}
