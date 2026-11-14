/**
 * Tipos das linhas — espelham `ddl.ts` um-para-um (mesma ordem, mesmos campos).
 * Banco usa snake_case; aqui é camelCase, mapeado explicitamente no servidor/app.
 *
 * Regras: quantidade = inteiro na unidade base · dinheiro = centavos · datas = unix ms
 * (exceto campos `*On`, que são `YYYY-MM-DD` em texto).
 */

/** Campos comuns a toda entidade sincronizável. */
export type SyncFields = {
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** cursor do servidor; 0 = alteração local ainda não confirmada */
  rev: number;
};

export type Household = {
  id: string;
  name: string;
  inviteCode: string | null;
  inviteExpiresAt: number | null;
  createdAt: number;
};

export type UserRole = 'admin' | 'member';

/** `secretHash` só existe no servidor; o app nunca recebe este campo. */
export type User = {
  id: string;
  householdId: string;
  name: string;
  role: UserRole;
  avatarPath: string | null;
  createdAt: number;
  deletedAt: number | null;
};

export type Session = {
  id: string;
  userId: string;
  deviceName: string | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
};

export type Category = SyncFields & {
  id: string;
  householdId: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
};

export type Location = SyncFields & {
  id: string;
  householdId: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  notes: string | null;
  sortOrder: number;
};

export type ItemKind = 'consumable' | 'durable';
export type BaseUnitName = 'g' | 'ml' | 'un' | 'mm';

export type Item = SyncFields & {
  id: string;
  householdId: string;
  /** 6 chars — vai na etiqueta QR quanto://i/<publicId> */
  publicId: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  kind: ItemKind;
  baseUnit: BaseUnitName;
  minQty: number;
  defaultLocationId: string | null;
  barcode: string | null;
  photoPath: string | null;
  notes: string | null;
};

export type ItemBarcode = SyncFields & {
  id: string;
  itemId: string;
  barcode: string;
  format: string | null;
};

export type ItemAlias = SyncFields & {
  id: string;
  itemId: string;
  alias: string;
};

export type Tag = SyncFields & {
  id: string;
  householdId: string;
  name: string;
  color: string | null;
};

export type ItemTag = SyncFields & {
  id: string;
  itemId: string;
  tagId: string;
};

export type AssetStatus =
  | 'available'
  | 'in_use'
  | 'loaned'
  | 'maintenance'
  | 'lost'
  | 'disposed';

/** Uma linha por unidade física de um item durável. */
export type Asset = SyncFields & {
  id: string;
  householdId: string;
  itemId: string;
  publicId: string;
  nickname: string | null;
  serial: string | null;
  locationId: string | null;
  status: AssetStatus;
  holderUserId: string | null;
  acquiredOn: string | null;
  valueCents: number;
  warrantyUntil: string | null;
  photoPath: string | null;
  notes: string | null;
};

/** Lote de consumível; saída consome FEFO (primeiro a vencer). */
export type Lot = SyncFields & {
  id: string;
  householdId: string;
  itemId: string;
  code: string | null;
  locationId: string | null;
  receivedOn: string | null;
  expiresOn: string | null;
};

export type MovementType =
  | 'in'
  | 'consume'
  | 'checkout'
  | 'checkin'
  | 'adjust'
  | 'transfer'
  | 'discard'
  | 'maintenance'
  | 'revert';

/** Append-only: nunca é atualizado; desfazer = inserir a linha inversa. */
export type Movement = {
  id: string;
  householdId: string;
  itemId: string;
  assetId: string | null;
  lotId: string | null;
  locationId: string | null;
  /** inteiro na unidade base do item: + entra, − sai */
  delta: number;
  type: MovementType;
  userId: string | null;
  note: string | null;
  reversesId: string | null;
  createdAt: number;
  rev: number;
};

export type Maintenance = SyncFields & {
  id: string;
  householdId: string;
  assetId: string;
  kind: string | null;
  doneOn: string | null;
  nextOn: string | null;
  costCents: number;
  provider: string | null;
  notes: string | null;
  userId: string | null;
};

export type Loan = SyncFields & {
  id: string;
  householdId: string;
  assetId: string;
  borrowerUserId: string | null;
  borrowerName: string | null;
  dueOn: string | null;
  returnedAt: number | null;
  note: string | null;
};

export type ShoppingListEntry = SyncFields & {
  id: string;
  householdId: string;
  itemId: string | null;
  label: string | null;
  qty: number;
  doneAt: number | null;
  note: string | null;
};

export type Attachment = SyncFields & {
  id: string;
  householdId: string;
  itemId: string | null;
  assetId: string | null;
  kind: string | null;
  path: string;
};

/** Cache local do OpenFoodFacts — não sincroniza. */
export type ProductCache = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  fetchedAt: number;
};

/** Metadados por aparelho (usado no app para o cursor de sync). */
export const LOCAL_SETTINGS_TABLE = 'local_settings';
