import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@quanto/core';
import type { DB } from '../db/index.ts';
import { forbidden, unauthorized } from '../lib/errors.ts';
import { hashToken } from '../lib/token.ts';

type SessionRow = {
  session_id: string;
  user_id: string;
  household_id: string;
  name: string;
  role: UserRole;
  expires_at: number;
  last_seen_at: number;
};

const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;

export function createAuthMiddleware(db: DB, sessionTtlMs: number) {
  const findSession = db.prepare(`
    SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
           u.id AS user_id, u.household_id, u.name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.deleted_at IS NULL
  `);

  const touchSession = db.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?');

  return function authRequired(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(unauthorized('Token ausente'));
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      next(unauthorized('Token ausente'));
      return;
    }

    const row = findSession.get(hashToken(token)) as SessionRow | undefined;
    if (!row) {
      next(unauthorized('Sessão inválida'));
      return;
    }

    const now = Date.now();
    if (row.expires_at <= now) {
      next(unauthorized('Sessão expirada'));
      return;
    }

    if (now - row.last_seen_at > LAST_SEEN_REFRESH_MS) {
      touchSession.run(now, now + sessionTtlMs, row.session_id);
    }

    req.auth = {
      sessionId: row.session_id,
      userId: row.user_id,
      householdId: row.household_id,
      name: row.name,
      role: row.role,
    };

    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'admin') {
    next(forbidden('Apenas o administrador da casa pode fazer isso'));
    return;
  }
  next();
}

export function currentAuth(req: Request) {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
