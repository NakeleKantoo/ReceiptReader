import { Router } from 'express';
import type { RequestHandler } from 'express';
import { loginSchema } from '@quanto/core';
import type { DB } from '../db/index.ts';
import { env } from '../env.ts';
import { AppError, asyncHandler, unauthorized } from '../lib/errors.ts';
import { checkRateLimit, recordFailure, recordSuccess } from '../lib/rate-limit.ts';
import {
  createSession,
  findUserBySecret,
  getHouseholdSummary,
} from '../lib/users.ts';

const isRateLimited = (req: { ip?: string }) => req.ip ?? 'desconhecido';

export function authRoutes(db: DB, authRequired: RequestHandler): Router {
  const router = Router();

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const key = isRateLimited(req);
      const state = checkRateLimit(key);

      if (!state.allowed) {
        res.setHeader('Retry-After', String(state.retryAfterSec));
        throw new AppError(429, 'Muitas tentativas. Aguarde alguns minutos.', 'rate_limited');
      }

      let secret: string;
      let deviceName: string | undefined;

      try {
        ({ secret, deviceName } = loginSchema.parse(req.body));
      } catch (error) {
        // payload inválido também conta como tentativa (evita sondar o validador)
        recordFailure(key);
        throw error;
      }

      const user = await findUserBySecret(db, secret);

      if (!user) {
        recordFailure(key);
        throw unauthorized('PIN ou senha incorretos');
      }

      recordSuccess(key);
      const session = createSession(db, user.id, deviceName);

      res.json({
        token: session.token,
        expiresAt: session.expiresAt,
        user,
        household: getHouseholdSummary(db, user.householdId, { includeInvite: user.role === 'admin' }),
      });
    }),
  );

  router.post(
    '/logout',
    authRequired,
    asyncHandler(async (req, res) => {
      if (req.auth) {
        db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(Date.now(), req.auth.sessionId);
      }
      res.json({ ok: true });
    }),
  );

  router.get(
    '/me',
    authRequired,
    asyncHandler(async (req, res) => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      res.json({
        user: {
          id: auth.userId,
          name: auth.name,
          role: auth.role,
          householdId: auth.householdId,
        },
        household: getHouseholdSummary(db, auth.householdId, { includeInvite: auth.role === 'admin' }),
        limits: { sessionTtlDays: env.SESSION_TTL_DAYS },
      });
    }),
  );

  return router;
}
