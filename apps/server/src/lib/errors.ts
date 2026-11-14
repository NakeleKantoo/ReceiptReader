import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, code?: string) => new AppError(400, message, code);
export const unauthorized = (message = 'Não autorizado') => new AppError(401, message, 'unauthorized');
export const forbidden = (message = 'Sem permissão') => new AppError(403, message, 'forbidden');
export const notFound = (message = 'Não encontrado') => new AppError(404, message, 'not_found');
export const conflict = (message: string, code?: string) => new AppError(409, message, code);

export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    res.status(400).json({
      error: first?.message ?? 'Dados inválidos',
      code: 'validation_error',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }

  console.error('[erro não tratado]', error);
  res.status(500).json({ error: 'Erro interno', code: 'internal_error' });
}

/** Envolve handlers async para que o Express receba as rejeições. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
