import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db/index.ts';
import { env, isProd } from './env.ts';
import { errorHandler } from './lib/errors.ts';
import { createAuthMiddleware } from './middleware/auth.ts';
import { authRoutes } from './routes/auth.ts';
import { householdRoutes } from './routes/household.ts';
import { publicRoutes } from './routes/public.ts';
import { syncRoutes } from './routes/sync.ts';

const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export function createApp(db: DB) {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  const authRequired = createAuthMiddleware(db, SESSION_TTL_MS);

  if (!isProd) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - startedAt} ms)`);
      });
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: 1, time: Date.now() });
  });

  app.use('/api/public', publicRoutes(db));
  app.use('/api/auth', authRoutes(db, authRequired));

  // Daqui pra baixo, tudo exige sessão.
  app.use('/api/household', householdRoutes(db, authRequired));
  app.use('/api/sync', authRequired, syncRoutes(db));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada', code: 'not_found' });
  });

  app.use(errorHandler);

  return app;
}
