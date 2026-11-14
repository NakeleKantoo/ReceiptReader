import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'quanto.serverUrl';

/**
 * Endereço sugerido na primeira execução. Quem roda o app aponta para o próprio
 * servidor — por isso a tela de servidor é a primeira do app.
 */
export const SUGGESTED_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.5:3030';

/** "192.168.1.5:3030" → "http://192.168.1.5:3030" · devolve null se não der para interpretar */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    // guarda só origem + path, sem barra final
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export async function loadServerUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEY);
}

export async function saveServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, url);
}

export async function clearServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
