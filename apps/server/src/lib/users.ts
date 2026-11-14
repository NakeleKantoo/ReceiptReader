import type { DB } from '../db/index.ts';
import type { UserRole } from '@quanto/core';
import { env } from '../env.ts';
import { newId } from '../lib/ids.ts';
import { generateToken, hashToken } from '../lib/token.ts';
import { conflict } from '../lib/errors.ts';
import { hashSecret, verifySecret } from '../lib/secret.ts';

export type PublicUser = {
  id: string;
  name: string;
  role: UserRole;
  householdId: string;
};

type UserWithSecret = PublicUser & { secretHash: string };

export function listUsers(db: DB): UserWithSecret[] {
  const rows = db
    .prepare(
      `SELECT id, name, role, household_id AS householdId, secret_hash AS secretHash
       FROM users WHERE deleted_at IS NULL`,
    )
    .all() as UserWithSecret[];
  return rows;
}

export function toPublicUser(user: PublicUser): PublicUser {
  return { id: user.id, name: user.name, role: user.role, householdId: user.householdId };
}

export function countMembers(db: DB, householdId: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM users WHERE household_id = ? AND deleted_at IS NULL')
    .get(householdId) as { total: number };
  return row.total;
}

/**
 * O login é só um segredo: ele precisa identificar a conta.
 * Compara contra todos os hashes (≤5) e garante tempo uniforme.
 */
export async function findUserBySecret(db: DB, secret: string): Promise<PublicUser | null> {
  const users = listUsers(db);
  let matched: PublicUser | null = null;

  for (const user of users) {
    const ok = await verifySecret(secret, user.secretHash);
    if (ok && !matched) matched = toPublicUser(user);
  }

  return matched;
}

/** Garante que o PIN/senha ainda não é usado por ninguém (senão o login seria ambíguo). */
export async function assertSecretIsFree(
  db: DB,
  secret: string,
  exceptUserId?: string,
): Promise<void> {
  for (const user of listUsers(db)) {
    if (user.id === exceptUserId) continue;
    if (await verifySecret(secret, user.secretHash)) {
      throw conflict('Esse PIN ou senha já é usado por outra pessoa da casa', 'secret_taken');
    }
  }
}

export async function setSecret(db: DB, userId: string, secret: string): Promise<void> {
  await assertSecretIsFree(db, secret, userId);
  const hash = await hashSecret(secret);
  db.prepare('UPDATE users SET secret_hash = ? WHERE id = ?').run(hash, userId);
}

export function createSession(
  db: DB,
  userId: string,
  deviceName: string | undefined,
): { token: string; expiresAt: number } {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, device_name, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId(), userId, hashToken(token), deviceName ?? null, now, now, expiresAt);

  return { token, expiresAt };
}

export type HouseholdSummary = {
  id: string;
  name: string;
  maxMembers: number;
  memberCount: number;
  inviteCode: string | null;
  inviteExpiresAt: number | null;
  createdAt: number;
};

export function getHouseholdSummary(
  db: DB,
  householdId: string,
  options: { includeInvite?: boolean } = {},
): HouseholdSummary {
  const row = db
    .prepare(
      `SELECT id, name, invite_code AS inviteCode, invite_expires_at AS inviteExpiresAt, created_at AS createdAt
       FROM households WHERE id = ?`,
    )
    .get(householdId) as {
    id: string;
    name: string;
    inviteCode: string | null;
    inviteExpiresAt: number | null;
    createdAt: number;
  };

  const inviteValid = row.inviteCode !== null && (row.inviteExpiresAt ?? 0) > Date.now();

  return {
    id: row.id,
    name: row.name,
    maxMembers: env.MAX_MEMBERS,
    memberCount: countMembers(db, householdId),
    inviteCode: options.includeInvite && inviteValid ? row.inviteCode : null,
    inviteExpiresAt: options.includeInvite && inviteValid ? row.inviteExpiresAt : null,
    createdAt: row.createdAt,
  };
}
