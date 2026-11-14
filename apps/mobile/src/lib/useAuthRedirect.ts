import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from './auth';

/**
 * Um único lugar decide a rota válida para o estado atual. Nada de depender do
 * destino padrão de `Stack.Protected`: era isso que prendia o usuário na tela de
 * convite, sem histórico e com o botão voltar morto.
 */
export function useAuthRedirect(): void {
  const { state } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const group = (segments[0] ?? '') as string;

  useEffect(() => {
    if (state.status === 'loading' || state.status === 'locked') return;

    const inTabs = group === '(tabs)';
    const inAnonymousArea = group === 'login' || group === 'setup' || group === 'join';

    if (state.status === 'needs-server') {
      if (group !== 'server') router.replace('/server');
      return;
    }

    if (state.status === 'anonymous') {
      if (!inAnonymousArea) router.replace('/login');
      return;
    }

    // autenticado
    if (!inTabs) router.replace('/(tabs)');
  }, [state.status, group, router]);
}
