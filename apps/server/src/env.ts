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
  /**
   * Como confiar em X-Forwarded-For. O Quanto não assume qual proxy está na
   * frente — aceita a mesma sintaxe do Express:
   *
   *   TRUST_PROXY=1            → confia em 1 salto (proxy local)
   *   TRUST_PROXY=2            → proxy + CDN na frente
   *   TRUST_PROXY=true         → confia em qualquer origem (só atrás de proxy)
   *   TRUST_PROXY=false        → exposto direto, usa o IP da conexão
   *   TRUST_PROXY=127.0.0.1,10.0.0.0/8  → só nessas subredes
   */
  TRUST_PROXY: z.string().default('1'),
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';

/** Traduz TRUST_PROXY para o formato que o Express entende. */
export function trustProxySetting(
  raw: string = env.TRUST_PROXY,
): boolean | number | string {
  const value = raw.trim().toLowerCase();

  if (value === '' || value === 'false' || value === 'off' || value === '0') return false;
  if (value === 'true' || value === 'on') return true;

  const hops = Number(value);
  if (Number.isInteger(hops) && hops > 0) return hops;

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(',');
}
