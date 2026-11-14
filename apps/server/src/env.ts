import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3030),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/quanto.db'),
  PUBLIC_URL: z.string().default('https://quanto.leonnaviegas.dev.br'),
  /** dias de validade da sessão de um aparelho */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(90),
  INVITE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  MAX_MEMBERS: z.coerce.number().int().positive().max(50).default(5),
  /** 1 = confiar em X-Forwarded-For (reverse proxy na frente) */
  TRUST_PROXY: z
    .string()
    .default('1')
    .transform((value) => value === '1' || value === 'true'),
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
