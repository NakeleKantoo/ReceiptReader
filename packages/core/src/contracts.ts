import { z } from 'zod';
import { BASE_UNITS } from './units';

// ─────────────────────────────────────────────── família

export const MAX_MEMBERS = 5;
export const INVITE_LENGTH = 6;
/** sem I, L, O, U, 0, 1 — evita confusão ao digitar */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function generateInviteCode(randomByte: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[randomByte(INVITE_ALPHABET.length)];
  }
  return code;
}

export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeSecret(input: string): string {
  return input.trim().normalize('NFKC');
}

/** PIN de exatamente 6 dígitos OU senha com 8+ caracteres. */
export const secretSchema = z
  .string()
  .trim()
  .min(6, 'Mínimo de 6 caracteres')
  .max(128, 'Máximo de 128 caracteres')
  .refine((value) => /^\d{6}$/.test(value) || value.length >= 8, {
    message: 'Use um PIN de 6 dígitos ou uma senha com 8+ caracteres',
  });

export const personNameSchema = z.string().trim().min(1, 'Informe um nome').max(60);

export const loginSchema = z.object({
  secret: secretSchema,
  deviceName: z.string().trim().max(80).optional(),
});

export const bootstrapSchema = z.object({
  householdName: z.string().trim().min(1, 'Informe o nome da casa').max(60),
  name: personNameSchema,
  secret: secretSchema,
  deviceName: z.string().trim().max(80).optional(),
});

export const joinSchema = z.object({
  inviteCode: z.string().trim().min(4).max(20),
  name: personNameSchema,
  secret: secretSchema,
  deviceName: z.string().trim().max(80).optional(),
});

export const changeSecretSchema = z.object({
  secret: secretSchema,
});

export const updateMemberSchema = z.object({
  name: personNameSchema.optional(),
  role: z.enum(['admin', 'member']).optional(),
});

// ─────────────────────────────────────────────── catálogo

export const baseUnitSchema = z.enum(BASE_UNITS);

export const itemKindSchema = z.enum(['consumable', 'durable']);

export const assetStatusSchema = z.enum([
  'available',
  'in_use',
  'loaned',
  'maintenance',
  'lost',
  'disposed',
]);

export const movementTypeSchema = z.enum([
  'in',
  'consume',
  'checkout',
  'checkin',
  'adjust',
  'transfer',
  'discard',
  'maintenance',
  'revert',
]);

export const MOVEMENT_LABEL: Record<z.infer<typeof movementTypeSchema>, string> = {
  in: 'Entrada',
  consume: 'Consumo',
  checkout: 'Retirada',
  checkin: 'Devolução',
  adjust: 'Ajuste',
  transfer: 'Transferência',
  discard: 'Descarte',
  maintenance: 'Manutenção',
  revert: 'Desfeito',
};

/** Movimento que soma (entrada) ou subtrai (saída) no saldo do item. */
export const INBOUND_TYPES = new Set(['in', 'checkin']);
export const OUTBOUND_TYPES = new Set(['consume', 'discard', 'checkout']);

/** Dias até `YYYY-MM-DD` (negativo = já passou). null se não houver data. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;

  const [year, month, day] = parts as [number, number, number];
  const target = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((target - today) / 86_400_000);
}

/** Data de hoje no fuso do aparelho, em `YYYY-MM-DD`. */
export function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type ExpiryTone = 'expired' | 'soon' | 'ok' | 'none';

export function expiryTone(date: string | null | undefined, soonDays = 7): ExpiryTone {
  const days = daysUntil(date);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= soonDays) return 'soon';
  return 'ok';
}

export function expiryLabel(date: string | null | undefined): string {
  const days = daysUntil(date);
  if (days === null) return 'sem validade';
  if (days === 0) return 'vence hoje';
  if (days < 0) return `vencido há ${Math.abs(days)}d`;
  if (days <= 7) return `vence em ${days}d`;
  return `vence em ${Math.round(days / 30)} ${Math.round(days / 30) === 1 ? 'mês' : 'meses'}`;
}

export const ASSET_STATUS_LABEL: Record<z.infer<typeof assetStatusSchema>, string> = {
  available: 'disponível',
  in_use: 'em uso',
  loaned: 'emprestado',
  maintenance: 'em manutenção',
  lost: 'perdido',
  disposed: 'descartado',
};
