import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { usePalette } from '@/theme';
import { AppText, Button, Screen } from '@/components/ui';

export function BootScreen() {
  const palette = usePalette();

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <AppText variant="title">Quanto</AppText>
      <ActivityIndicator color={palette.primary} />
    </View>
  );
}

export function LockScreen() {
  const { unlock, usePin } = useAuth();
  const palette = usePalette();

  useEffect(() => {
    void unlock();
  }, [unlock]);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16, paddingTop: 120 }}>
        <AppText variant="title">Quanto</AppText>
        <AppText variant="caption">Desbloqueie com sua biometria para continuar.</AppText>

        <Button title="Desbloquear" onPress={() => void unlock()} />
        <Button title="Usar PIN" variant="ghost" onPress={() => void usePin()} />
        <ActivityIndicator color={palette.primary} />
      </View>
    </Screen>
  );
}
