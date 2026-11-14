import { Router } from 'express';
import {
  SYNC_TABLES,
  coerceSyncRow,
  emptyCursor,
  getTableSpec,
  rowId,
  type SyncRow,
  type SyncTableSpec,
} from '@quanto/core';
import type { DB } from '../db/index.ts';
import { nextRev } from '../db/index.ts';
import { asyncHandler } from '../lib/errors.ts';

/** Linhas por tabela em cada pull. */
const PAGE_LIMIT = 500;

type Cursor = Record<string, number>;

function normalizeCursor(input: unknown): Cursor {
  const cursor = emptyCursor();
  if (!input || typeof input !== 'object') return cursor;

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!getTableSpec(key)) continue;
    const number = Number(value);
    cursor[key] = Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
  }

  return cursor;
}

/** `better-sqlite3` genérico o suficiente para não vazar para as assinaturas. */
type PreparedStatement = {
  run: (params: Record<string, unknown>) => { changes: number };
  all: (...params: unknown[]) => unknown[];
};

type CachedStatements = {
  spec: SyncTableSpec;
  upsert: PreparedStatement | null;
  pull: PreparedStatement;
};

function buildStatements(db: DB): CachedStatements[] {
  return SYNC_TABLES.map((spec) => {
    const columns = Object.keys(spec.columns);
    const columnList = columns.join(', ');
    const placeholders = columns.map((column) => `@${column}`).join(', ');

    let upsert: PreparedStatement | null = null;

    if (spec.appendOnly) {
      // append-only: nunca sobrescreve (desfazer = inserir a linha inversa)
      upsert = db.prepare(
        `INSERT OR IGNORE INTO ${spec.name} (${columnList}) VALUES (${placeholders})`,
      ) as unknown as PreparedStatement;
    } else {
      const immutable = new Set(['id', 'household_id', 'created_at']);
      const updates = columns
        .filter((column) => !immutable.has(column))
        .map((column) =>
          column === 'updated_at'
            ? // carimbo do servidor: LWW só é consistente se o valor nunca andar para trás
              `updated_at = max(excluded.updated_at, ${spec.name}.updated_at + 1)`
            : `${column} = excluded.${column}`,
        )
        .join(',\n        ');

      upsert = db.prepare(`
        INSERT INTO ${spec.name} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT(id) DO UPDATE SET
        ${updates}
        WHERE excluded.household_id = ${spec.name}.household_id
          AND excluded.updated_at >= ${spec.name}.updated_at
      `) as unknown as PreparedStatement;
    }

    const pull = db.prepare(`
      SELECT ${columnList} FROM ${spec.name}
      WHERE household_id = ? AND rev > ?
      ORDER BY rev ASC
      LIMIT ?
    `) as unknown as PreparedStatement;

    return { spec, upsert, pull };
  });
}

/**
 * Sync bidirecional em um round-trip, genérico sobre `SYNC_TABLES`.
 *
 * Push: LWW por `updated_at` com carimbo do servidor; append-only é insert-only.
 * Pull: cursor **por tabela** — um cursor global pularia linhas quando uma
 * tabela bate no limite de página e outra não.
 */
export function syncRoutes(db: DB): Router {
  const router = Router();
  const statements = buildStatements(db);
  const pending = db.prepare(`
    SELECT 'items' AS table_name, COUNT(*) AS total FROM items WHERE household_id = ?
    UNION ALL SELECT 'assets', COUNT(*) FROM assets WHERE household_id = ?
    UNION ALL SELECT 'movements', COUNT(*) FROM movements WHERE household_id = ?
  `);

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      const body = (req.body ?? {}) as { cursor?: unknown; changes?: unknown };
      const cursor = normalizeCursor(body.cursor);
      const changes =
        body.changes && typeof body.changes === 'object'
          ? (body.changes as Record<string, unknown>)
          : {};

      const payload = db.transaction(() => {
        let pushed = 0;
        const rejected: { table: string; id: string | null; reason: string }[] = [];
        const nextCursor: Cursor = { ...cursor };
        const pulled: Record<string, SyncRow[]> = {};

        for (const { spec, upsert, pull } of statements) {
          const incoming = changes[spec.name];

          if (Array.isArray(incoming)) {
            for (const raw of incoming) {
              const parsed = coerceSyncRow(spec, raw, auth.householdId);
              if (!parsed.ok) {
                rejected.push({ table: spec.name, id: rowId((raw ?? {}) as SyncRow), reason: parsed.reason });
                continue;
              }

              const row: SyncRow = { ...parsed.row, rev: nextRev(db) };

              if (spec.name === 'movements') {
                // a movimentação é imutável: o autor vem da sessão, não do cliente
                row.user_id = typeof row.user_id === 'string' && row.user_id ? row.user_id : auth.userId;
              }

              try {
                const info = upsert!.run(row);
                pushed += info.changes;
              } catch (error) {
                rejected.push({
                  table: spec.name,
                  id: rowId(row),
                  reason: (error as Error).message,
                });
              }
            }
          }

          const rows = pull.all(auth.householdId, cursor[spec.name] ?? 0, PAGE_LIMIT) as SyncRow[];
          pulled[spec.name] = rows;
          if (rows.length > 0) nextCursor[spec.name] = Number(rows[rows.length - 1]!.rev);
        }

        const hasMore = Object.values(pulled).some((rows) => rows.length >= PAGE_LIMIT);

        return { cursor: nextCursor, hasMore, changes: pulled, rejected, pushed };
      })();

      res.json({ ...payload, serverTime: Date.now() });
    }),
  );

  router.get(
    '/status',
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      res.json({
        rows: pending.all(auth.householdId, auth.householdId, auth.householdId),
        tables: SYNC_TABLES.length,
        serverTime: Date.now(),
      });
    }),
  );

  return router;
}
