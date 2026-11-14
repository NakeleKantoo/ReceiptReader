/**
 * Cliente HTTP mínimo. O app é offline-first: erro de rede vira `ApiError` com
 * `code: 'offline'`, e a tela decide se mostra aviso ou segue com o banco local.
 */

/**
 * O servidor é configurável em runtime (self-hosted): a tela inicial do app pede
 * o endereço e guarda no SecureStore. Nada de URL fixa no bundle.
 */
let apiBaseUrl = '';

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isOffline(): boolean {
    return this.code === 'offline' || this.code === 'timeout';
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  timeoutMs?: number;
};

function safeJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

  try {
    if (!apiBaseUrl) throw new ApiError(0, 'Servidor não configurado', 'no_server');

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? safeJson(text) : null;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        typeof payload?.error === 'string' ? payload.error : `Erro ${response.status}`,
        typeof payload?.code === 'string' ? payload.code : undefined,
        payload,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError(0, 'O servidor demorou para responder', 'timeout');
    }

    throw new ApiError(0, 'Sem conexão com o servidor', 'offline');
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────── tipos das respostas

export type UserRole = 'admin' | 'member';

export type AuthUser = {
  id: string;
  name: string;
  role: UserRole;
  householdId: string;
};

export type HouseholdSummary = {
  id: string;
  name: string;
  maxMembers: number;
  memberCount: number;
  inviteCode: string | null;
  inviteExpiresAt: number | null;
  createdAt: number;
};

export type Member = {
  id: string;
  name: string;
  role: UserRole;
  createdAt: number;
  avatarPath: string | null;
};

export type ServerStatus = {
  initialized: boolean;
  householdName: string | null;
  maxMembers: number;
  memberCount: number;
  serverTime: number;
  version: number;
};

export type AuthResponse = {
  token: string;
  expiresAt: number;
  user: AuthUser;
  household: HouseholdSummary;
};

/** `baseUrl` permite testar um endereço antes de salvar. */
export async function getServerStatus(baseUrl?: string): Promise<ServerStatus> {
  if (baseUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/public/status`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new ApiError(response.status, `Servidor respondeu ${response.status}`);
      return (await response.json()) as ServerStatus;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error)?.name === 'AbortError') {
        throw new ApiError(0, 'O servidor demorou para responder', 'timeout');
      }
      throw new ApiError(0, 'Não foi possível falar com esse endereço', 'offline');
    } finally {
      clearTimeout(timeout);
    }
  }

  return api<ServerStatus>('/api/public/status', { timeoutMs: 8000 });
}

export const apiLogin = (secret: string, deviceName?: string) =>
  api<AuthResponse>('/api/auth/login', { method: 'POST', body: { secret, deviceName } });

export const apiBootstrap = (input: {
  householdName: string;
  name: string;
  secret: string;
  deviceName?: string;
}) => api<AuthResponse>('/api/household', { method: 'POST', body: input });

export const apiJoin = (input: {
  inviteCode: string;
  name: string;
  secret: string;
  deviceName?: string;
}) => api<AuthResponse>('/api/household/join', { method: 'POST', body: input });

export const apiLogout = (token: string) =>
  api<{ ok: boolean }>('/api/auth/logout', { method: 'POST', token });

export const apiMe = (token: string) =>
  api<{ user: AuthUser; household: HouseholdSummary }>('/api/auth/me', { token });

export const apiHousehold = (token: string) =>
  api<{ household: HouseholdSummary; members: Member[] }>('/api/household', { token });

export const apiCreateInvite = (token: string) =>
  api<{ inviteCode: string; expiresAt: number; maxMembers: number }>('/api/household/invite', {
    method: 'POST',
    token,
  });

export const apiChangeSecret = (token: string, secret: string) =>
  api<{ ok: boolean }>('/api/household/me/secret', { method: 'POST', token, body: { secret } });

export const apiRemoveMember = (token: string, memberId: string) =>
  api<{ ok: boolean; members: Member[] }>(`/api/household/members/${memberId}`, {
    method: 'DELETE',
    token,
  });

export const apiResetMemberSecret = (token: string, memberId: string, secret: string) =>
  api<{ ok: boolean }>(`/api/household/members/${memberId}/secret`, {
    method: 'POST',
    token,
    body: { secret },
  });
