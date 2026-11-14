import { Router } from 'express';
import type { RequestHandler } from 'express';
import {
  bootstrapSchema,
  changeSecretSchema,
  generateInviteCode,
  joinSchema,
  normalizeInviteCode,
  normalizeSecret,
  updateMemberSchema,
  type UserRole,
} from '@quanto/core';
import type { DB } from '../db/index.ts';
import { env } from '../env.ts';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId, randomIndex } from '../lib/ids.ts';
import { hashSecret } from '../lib/secret.ts';
import {
  assertSecretIsFree,
  countMembers,
  createSession,
  getHouseholdSummary,
  setSecret,
  toPublicUser,
} from '../lib/users.ts';

type MemberRow = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: number;
  avatarPath: string | null;
};

function listMembers(db: DB, householdId: string): MemberRow[] {
  return db
    .prepare(
      `SELECT id, name, role, created_at AS createdAt, avatar_path AS avatarPath
       FROM users WHERE household_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    )
    .all(householdId) as MemberRow[];
}

export function householdRoutes(db: DB, authRequired: RequestHandler): Router {
  const router = Router();

  /** Bootstrap: só pode existir uma casa por servidor. */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { householdName, name, secret, deviceName } = bootstrapSchema.parse(req.body);

      const existing = db.prepare('SELECT COUNT(*) AS total FROM households').get() as { total: number };
      if (existing.total > 0) {
        throw conflict('Esta casa já está configurada. Entre com seu PIN.', 'already_initialized');
      }

      const householdId = newId();
      const userId = newId();
      const now = Date.now();
      const secretHash = await hashSecret(normalizeSecret(secret));

      db.transaction(() => {
        db.prepare('INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)').run(
          householdId,
          householdName,
          now,
        );
        db.prepare(
          `INSERT INTO users (id, household_id, name, secret_hash, role, created_at)
           VALUES (?, ?, ?, ?, 'admin', ?)`,
        ).run(userId, householdId, name, secretHash, now);
      })();

      const session = createSession(db, userId, deviceName);
      res.status(201).json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: { id: userId, name, role: 'admin', householdId },
        household: getHouseholdSummary(db, householdId, { includeInvite: true }),
      });
    }),
  );

  /** Entrada por código de convite. */
  router.post(
    '/join',
    asyncHandler(async (req, res) => {
      const { inviteCode, name, secret, deviceName } = joinSchema.parse(req.body);
      const code = normalizeInviteCode(inviteCode);

      const household = db
        .prepare('SELECT id, invite_expires_at AS inviteExpiresAt FROM households WHERE invite_code = ?')
        .get(code) as { id: string; inviteExpiresAt: number | null } | undefined;

      if (!household) throw notFound('Código de convite inválido');
      if ((household.inviteExpiresAt ?? 0) <= Date.now()) {
        throw badRequest('Convite expirado. Peça um código novo para o administrador.', 'invite_expired');
      }
      if (countMembers(db, household.id) >= env.MAX_MEMBERS) {
        throw conflict(`A casa já tem ${env.MAX_MEMBERS} pessoas`, 'house_full');
      }

      const normalized = normalizeSecret(secret);
      await assertSecretIsFree(db, normalized);

      const userId = newId();
      const now = Date.now();
      db.prepare(
        `INSERT INTO users (id, household_id, name, secret_hash, role, created_at)
         VALUES (?, ?, ?, ?, 'member', ?)`,
      ).run(userId, household.id, name, await hashSecret(normalized), now);

      const session = createSession(db, userId, deviceName);
      res.status(201).json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: { id: userId, name, role: 'member', householdId: household.id },
        household: getHouseholdSummary(db, household.id),
      });
    }),
  );

  router.get(
    '/',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      res.json({
        household: getHouseholdSummary(db, auth.householdId, { includeInvite: auth.role === 'admin' }),
        members: listMembers(db, auth.householdId),
      });
    }),
  );

  /** Gera um código de convite novo (24 h, uso múltiplo até o limite de membros). */
  router.post(
    '/invite',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      if (auth.role !== 'admin') throw forbidden('Apenas o administrador gera convites');

      const code = generateInviteCode(randomIndex);
      const expiresAt = Date.now() + env.INVITE_TTL_HOURS * 60 * 60 * 1000;

      db.prepare('UPDATE households SET invite_code = ?, invite_expires_at = ? WHERE id = ?').run(
        code,
        expiresAt,
        auth.householdId,
      );

      res.json({ inviteCode: code, expiresAt, maxMembers: env.MAX_MEMBERS });
    }),
  );

  router.patch(
    '/members/:id',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      if (auth.role !== 'admin') throw forbidden('Apenas o administrador edita membros');

      const id = String(req.params.id);
      const patch = updateMemberSchema.parse(req.body);

      const member = db
        .prepare('SELECT id FROM users WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
        .get(id, auth.householdId);
      if (!member) throw notFound('Membro não encontrado');

      if (patch.role === 'member' && id === auth.userId) {
        throw badRequest('Você não pode rebaixar a si mesmo', 'cannot_demote_self');
      }

      if (patch.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(patch.name, id);
      if (patch.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);

      res.json({ ok: true, members: listMembers(db, auth.householdId) });
    }),
  );

  router.delete(
    '/members/:id',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      if (auth.role !== 'admin') throw forbidden('Apenas o administrador remove membros');

      const id = String(req.params.id);
      if (id === auth.userId) throw badRequest('Você não pode remover a si mesmo', 'cannot_remove_self');

      const member = db
        .prepare('SELECT id, role FROM users WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
        .get(id, auth.householdId) as { id: string; role: UserRole } | undefined;
      if (!member) throw notFound('Membro não encontrado');

      if (member.role === 'admin') {
        const admins = db
          .prepare(
            `SELECT COUNT(*) AS total FROM users
             WHERE household_id = ? AND role = 'admin' AND deleted_at IS NULL`,
          )
          .get(auth.householdId) as { total: number };
        if (admins.total <= 1) throw conflict('A casa precisa de pelo menos um administrador', 'last_admin');
      }

      const now = Date.now();
      db.transaction(() => {
        db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(now, id);
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(now, id);
      })();

      res.json({ ok: true, members: listMembers(db, auth.householdId) });
    }),
  );

  /** Troca o próprio PIN/senha. */
  router.post(
    '/me/secret',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      const { secret } = changeSecretSchema.parse(req.body);
      await setSecret(db, auth.userId, normalizeSecret(secret));
      res.json({ ok: true });
    }),
  );

  /** Admin redefine o PIN de alguém que esqueceu. */
  router.post(
    '/members/:id/secret',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth!;
      if (auth.role !== 'admin') throw forbidden('Apenas o administrador redefine o PIN');

      const id = String(req.params.id);
      const { secret } = changeSecretSchema.parse(req.body);

      const member = db
        .prepare('SELECT id FROM users WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
        .get(id, auth.householdId);
      if (!member) throw notFound('Membro não encontrado');

      await setSecret(db, id, normalizeSecret(secret));
      db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(Date.now(), id);

      res.json({ ok: true });
    }),
  );

  return router;
}

export { toPublicUser };
