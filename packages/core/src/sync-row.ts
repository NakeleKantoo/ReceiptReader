import type { SyncRow, SyncTableSpec } from './sync-tables';

/**
 * Validação/coerção de linha de sync sem zod (13 tabelas × ~15 colunas: um schema
 * por tabela seria só repetição do `SYNC_TABLES`). Colunas desconhecidas são
 * descartadas; tipos errados recusam a linha.
 */

export type CoerceResult = { ok: true; row: SyncRow } | { ok: false; reason: string };

export function coerceSyncRow(
  spec: SyncTableSpec,
  input: unknown,
  householdId: string,
): CoerceResult {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'linha não é objeto' };

  const source = input as Record<string, unknown>;
  const row: SyncRow = {};

  for (const [column, kind] of Object.entries(spec.columns)) {
    const value = source[column];

    if (value === undefined || value === null) {
      row[column] = spec.defaults?.[column] ?? null;
      continue;
    }

    if (kind === 'int') {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) return { ok: false, reason: `coluna ${column} não é número` };
      row[column] = Math.trunc(number);
      continue;
    }

    if (typeof value !== 'string') return { ok: false, reason: `coluna ${column} não é texto` };
    row[column] = value;
  }

  // o cliente nunca decide de quem é a linha — e isso vem antes da checagem de
  // obrigatórios, senão household_id (obrigatório) nunca estaria presente
  if ('household_id' in spec.columns) row.household_id = householdId;

  for (const column of spec.required) {
    if (row[column] === null || row[column] === undefined || row[column] === '') {
      return { ok: false, reason: `coluna obrigatória ausente: ${column}` };
    }
  }

  return { ok: true, row };
}

export const rowId = (row: SyncRow): string | null =>
  typeof row.id === 'string' && row.id.length > 0 ? row.id : null;
