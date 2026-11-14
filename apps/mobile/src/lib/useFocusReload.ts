import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Recarrega dados locais sempre que a aba volta ao foco.
 *
 * A função fica numa ref: um callback inline (novo a cada render) não pode
 * refazer o efeito, senão atualizar estado dentro dele vira loop infinito.
 */
export function useFocusReload(reload: () => void): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useFocusEffect(
    useCallback(() => {
      reloadRef.current();
    }, []),
  );
}
