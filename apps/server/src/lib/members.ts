import type { DB } from '../db/index.ts';
import { nextRev } from '../db/index.ts';
import type { UserRole } from '@quanto/core';

/**
 * `users` é do servidor (tem hash de senha). `members` é o que sincroniza, então
 * toda mudança de pessoa precisa ser espelhada aqui.
 */
export function upsertMember(
  db: DB,
  householdId: string,
  user: { id: string; name: string; role: UserRole; avatarPath?: string | null; createdAt: number },
): void {
  db.prepare(
    `INSERT INTO members (id, household_id, name, role, avatar_path, deleted_at, created_at, updated_at, rev)
     VALUES (@id, @householdId, @name, @role, @avatarPath, NULL, @createdAt, @updatedAt, @rev)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       role = excluded.role,
       avatar_path = excluded.avatar_path,
       deleted_at = excluded.deleted_at,
       updated_at = max(excluded.updated_at, members.updated_at + 1),
       rev = excluded.rev`,
  ).run({
    id: user.id,
    householdId,
    name: user.name,
    role: user.role,
    avatarPath: user.avatarPath ?? null,
    createdAt: user.createdAt,
    updatedAt: Date.now(),
    rev: nextRev(db),
  });
}

export function removeMember(db: DB, householdId: string, userId: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE members SET deleted_at = ?, updated_at = ?, rev = ? WHERE id = ? AND household_id = ?`,
  ).run(now, now, nextRev(db), userId, householdId);
}

/** Ids válidos da casa: usados para não aceitar `user_id` inventado no sync. */
export function memberIds(db: DB, householdId: string): Set<string> {
  const rows = db
    .prepare('SELECT id FROM members WHERE household_id = ? AND deleted_at IS NULL')
    .all(householdId) as { id: string }[];
  return new Set(rows.map((row) => row.id));
}
