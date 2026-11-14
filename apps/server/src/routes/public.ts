import { Router } from 'express';
import type { DB } from '../db/index.ts';
import { env } from '../env.ts';
import { countMembers } from '../lib/users.ts';

/** Endpoint sem autenticação: a tela de login precisa saber se a casa já existe. */
export function publicRoutes(db: DB): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const household = db
      .prepare('SELECT id, name FROM households ORDER BY created_at LIMIT 1')
      .get() as { id: string; name: string } | undefined;

    res.json({
      initialized: Boolean(household),
      householdName: household?.name ?? null,
      maxMembers: env.MAX_MEMBERS,
      memberCount: household ? countMembers(db, household.id) : 0,
      serverTime: Date.now(),
      version: 1,
    });
  });

  return router;
}
