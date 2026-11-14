import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  ApiError,
  api,
  apiBootstrap,
  apiJoin,
  apiLogin,
  apiLogout,
  apiMe,
  getServerStatus,
  setApiBaseUrl,
  type AuthUser,
  type HouseholdSummary,
  type ServerStatus,
} from '@/lib/api';
import { setCurrentHousehold, setCurrentUser } from '@/db/repo';
import { rememberServerProtocol } from '@/lib/sync';
import {
  SUGGESTED_SERVER_URL,
  clearServerUrl,
  loadServerUrl,
  normalizeServerUrl,
  saveServerUrl,
} from '@/lib/server-config';

const SESSION_KEY = 'quanto.session';

export type Session = {
  token: string;
  user: AuthUser;
  household: HouseholdSummary;
};

type AuthState =
  | { status: 'loading' }
  /** primeiro passo do app: qual servidor? */
  | { status: 'needs-server' }
  | { status: 'locked'; session: Session }
  | { status: 'anonymous' }
  | { status: 'authenticated'; session: Session };

type AuthContextValue = {
  state: AuthState;
  serverUrl: string;
  suggestedServerUrl: string;
  server: ServerStatus | null;
  serverError: string | null;
  biometricAvailable: boolean;
  configureServer: (url: string) => Promise<ServerStatus>;
  forgetServer: () => Promise<void>;
  login: (secret: string) => Promise<void>;
  bootstrap: (input: { householdName: string; name: string; secret: string }) => Promise<void>;
  join: (input: { inviteCode: string; name: string; secret: string }) => Promise<void>;
  logout: () => Promise<void>;
  unlock: () => Promise<boolean>;
  usePin: () => Promise<void>;
  refreshServerStatus: () => Promise<void>;
  updateHousehold: (household: HouseholdSummary) => void;
  token: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const deviceName = (): string =>
  Constants.deviceName ?? `Android ${Constants.platform?.android?.version ?? ''}`.trim();

async function readSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function writeSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [serverUrl, setServerUrl] = useState('');
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const mounted = useRef(true);

  const refreshServerStatus = useCallback(async () => {
    try {
      const status = await getServerStatus();
      rememberServerProtocol(status.protocol);
      if (!mounted.current) return;
      setServer(status);
      setServerError(null);
    } catch (error) {
      if (!mounted.current) return;
      setServer(null);
      setServerError((error as ApiError).message ?? 'Não foi possível falar com o servidor');
    }
  }, []);

  const validateSession = useCallback(async (session: Session) => {
    try {
      const me = await apiMe(session.token);
      const refreshed: Session = { ...session, user: me.user, household: me.household };
      await writeSession(refreshed);
      setCurrentHousehold(refreshed.user.householdId);
      setCurrentUser(refreshed.user.id);
      if (mounted.current) setState({ status: 'authenticated', session: refreshed });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        await clearSession();
        if (mounted.current) setState({ status: 'anonymous' });
      }
      // offline: segue com a sessão local (o app funciona sem servidor)
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      const [hasHardware, enrolled, storedUrl] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        loadServerUrl(),
      ]);

      if (mounted.current) setBiometricAvailable(hasHardware && enrolled);

      if (!storedUrl) {
        if (mounted.current) setState({ status: 'needs-server' });
        return;
      }

      setApiBaseUrl(storedUrl);
      if (mounted.current) setServerUrl(storedUrl);

      const session = await readSession();
      if (session) {
        setCurrentHousehold(session.user.householdId);
        setCurrentUser(session.user.id);
      }

      if (session) {
        if (hasHardware && enrolled) {
          setState({ status: 'locked', session });
        } else {
          setState({ status: 'authenticated', session });
        }
        void validateSession(session);
      } else {
        setState({ status: 'anonymous' });
        void refreshServerStatus();
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [refreshServerStatus, validateSession]);

  /**
   * Testa o endereço ANTES de salvar: apontar para um servidor morto é o erro
   * mais comum de self-hosted, e a mensagem precisa ser clara.
   */
  const configureServer = useCallback(async (input: string): Promise<ServerStatus> => {
    const normalized = normalizeServerUrl(input);
    if (!normalized) throw new ApiError(0, 'Endereço inválido. Exemplo: http://192.168.1.5:3030');

    const status = await getServerStatus(normalized);
    rememberServerProtocol(status.protocol);

    // trocar de servidor nunca reaproveita sessão de outro
    await clearSession();
    await saveServerUrl(normalized);
    setApiBaseUrl(normalized);
    setServerUrl(normalized);
    setServer(status);
    setServerError(null);
    setState({ status: 'anonymous' });

    return status;
  }, []);

  const forgetServer = useCallback(async () => {
    await clearSession();
    await clearServerUrl();
    setApiBaseUrl('');
    setServerUrl('');
    setServer(null);
    setState({ status: 'needs-server' });
  }, []);

  const unlock = useCallback(async () => {
    if (state.status !== 'locked') return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquear o Quanto',
      cancelLabel: 'Usar PIN',
      disableDeviceFallback: false,
    });

    if (result.success) {
      setState({ status: 'authenticated', session: state.session });
      return true;
    }

    return false;
  }, [state]);

  const usePin = useCallback(async () => {
    if (state.status !== 'locked') return;
    await clearSession();
    setState({ status: 'anonymous' });
    void refreshServerStatus();
  }, [state, refreshServerStatus]);

  const adopt = useCallback(async (session: Session) => {
    await writeSession(session);
    setCurrentHousehold(session.user.householdId);
    setCurrentUser(session.user.id);
    setState({ status: 'authenticated', session });
  }, []);

  const login = useCallback(
    async (secret: string) => {
      const response = await apiLogin(secret, deviceName());
      await adopt({ token: response.token, user: response.user, household: response.household });
    },
    [adopt],
  );

  const bootstrap = useCallback(
    async (input: { householdName: string; name: string; secret: string }) => {
      const response = await apiBootstrap({ ...input, deviceName: deviceName() });
      await adopt({ token: response.token, user: response.user, household: response.household });
    },
    [adopt],
  );

  const join = useCallback(
    async (input: { inviteCode: string; name: string; secret: string }) => {
      const response = await apiJoin({ ...input, deviceName: deviceName() });
      await adopt({ token: response.token, user: response.user, household: response.household });
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    const token =
      state.status === 'authenticated' || state.status === 'locked' ? state.session.token : null;

    if (token) {
      try {
        await apiLogout(token);
      } catch {
        // sem rede: a sessão local sai de qualquer forma
      }
    }

    await clearSession();
    setState({ status: 'anonymous' });
    void refreshServerStatus();
  }, [state, refreshServerStatus]);

  const updateHousehold = useCallback((household: HouseholdSummary) => {
    setState((current) => {
      if (current.status !== 'authenticated') return current;
      const updated: Session = { ...current.session, household };
      void writeSession(updated);
      return { status: 'authenticated', session: updated };
    });
  }, []);

  const token =
    state.status === 'authenticated' || state.status === 'locked' ? state.session.token : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      serverUrl,
      suggestedServerUrl: SUGGESTED_SERVER_URL,
      server,
      serverError,
      biometricAvailable,
      configureServer,
      forgetServer,
      login,
      bootstrap,
      join,
      logout,
      unlock,
      usePin,
      refreshServerStatus,
      updateHousehold,
      token,
    }),
    [
      state,
      serverUrl,
      server,
      serverError,
      biometricAvailable,
      configureServer,
      forgetServer,
      login,
      bootstrap,
      join,
      logout,
      unlock,
      usePin,
      refreshServerStatus,
      updateHousehold,
      token,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return context;
}

/** Sessão garantida (usar só em telas protegidas). */
export function useSession(): Session {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('Sessão não disponível');
  return state.session;
}

export { api };
