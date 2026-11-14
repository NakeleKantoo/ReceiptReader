import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/** Recarrega dados locais sempre que a aba volta ao foco. */
export function useFocusReload(reload: () => void): void {
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
}
