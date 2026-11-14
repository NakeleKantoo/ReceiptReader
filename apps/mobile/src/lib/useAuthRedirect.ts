import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from './auth';

/**
 * Um único lugar decide a rota válida para o estado atual. Nada de depender do
 * destino padrão de `Stack.Protected`: era isso que prendia o usuário na tela de
 * convite, sem histórico e com o botão voltar morto.
 */
/** Telas que só fazem sentido sem sessão. */
const ANONYMOUS_ROUTES = new Set(['login', 'setup', 'join']);

/** Telas de entrada: com sessão ativa, o usuário não deve ficar nelas. */
const AUTH_ROUTES = new Set(['boot', 'server', 'login', 'setup', 'join']);

export function useAuthRedirect(): void {
  const { state } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const group = (segments[0] ?? '') as string;

  useEffect(() => {
    if (state.status === 'loading' || state.status === 'locked') return;

    if (state.status === 'needs-server') {
      if (group !== 'server') router.replace('/server');
      return;
    }

    if (state.status === 'anonymous') {
      // só as telas de entrada são válidas sem sessão
      if (!ANONYMOUS_ROUTES.has(group)) router.replace('/login');
      return;
    }

    // Autenticado: qualquer rota do app vale (tabs, item, item-form, categories...).
    // Só sai das telas de entrada. `''` = rota ainda não resolvida (boot).
    if (group === '' || AUTH_ROUTES.has(group)) router.replace('/(tabs)');
  }, [state.status, group, router]);
}
