import { z } from 'zod';
import { BASE_UNITS } from './units';

// ─────────────────────────────────────────────── família

export const MAX_MEMBERS = 5;
export const INVITE_LENGTH = 6;
/** sem I, L, O, U, 0, 1 — evita confusão ao digitar */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function generateInviteCode(randomByte: () => number): string {
  let code = '';
  for (let i = 0; i < INVITE_LENGTH; i += 1) {
    code += INVITE_ALPHABET[randomByte() % INVITE_ALPHABET.length];
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

// ─────────────────────────────────────────────── sync

const syncBase = {
  id: z.string().min(1).max(64),
  /** preenchido pelo servidor a partir da sessão; ignorado no push */
  householdId: z.string().max(64).optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable().optional(),
  /** preenchido pelo servidor; ignorado no push */
  rev: z.number().int().optional(),
};

export const categoryRowSchema = z.object({
  ...syncBase,
  name: z.string().trim().min(1).max(80),
  parentId: z.string().max(64).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const locationRowSchema = z.object({
  ...syncBase,
  name: z.string().trim().min(1).max(80),
  parentId: z.string().max(64).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type CategoryRow = z.infer<typeof categoryRowSchema>;
export type LocationRow = z.infer<typeof locationRowSchema>;

/** Tabelas sincronizadas na F0. Novas entradas entram aqui + no SYNC_TABLES do servidor. */
export const SYNC_TABLES = ['categories', 'locations'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export const syncRequestSchema = z.object({
  // cursor por tabela: um cursor global poderia pular linhas quando uma tabela
  // bate no limite de página e outra não.
  cursor: z
    .object({
      categories: z.number().int().min(0).default(0),
      locations: z.number().int().min(0).default(0),
    })
    .default({ categories: 0, locations: 0 }),
  changes: z
    .object({
      categories: z.array(categoryRowSchema).max(500).optional(),
      locations: z.array(locationRowSchema).max(500).optional(),
    })
    .default({}),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncCursor = { categories: number; locations: number };

export type SyncResponse = {
  cursor: SyncCursor;
  hasMore: boolean;
  /** relógio do servidor — o app usa isso para corrigir o skew ao gravar `updatedAt` */
  serverTime: number;
  changes: {
    categories: CategoryRow[];
    locations: LocationRow[];
  };
};

// ─────────────────────────────────────────────── catálogo (usado a partir da F1)

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
