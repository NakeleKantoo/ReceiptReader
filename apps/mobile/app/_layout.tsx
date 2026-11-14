import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { usePalette } from '@/theme';
import { BootScreen, LockScreen } from '@/components/session-screens';
import { getDatabase } from '@/db';
import { useAuthRedirect } from '@/lib/useAuthRedirect';

/** `boot` é a rota âncora: o redirect manda para o lugar certo a partir dela. */
export const unstable_settings = { anchor: 'boot' };

export default function RootLayout() {
  // abre/migra o banco antes da primeira tela
  useEffect(() => {
    getDatabase();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { state } = useAuth();
  const palette = usePalette();

  useAuthRedirect();

  if (state.status === 'loading') return <BootScreen />;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="boot" />
        <Stack.Screen name="server" />
        <Stack.Screen name="login" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="join" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="item-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="asset-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="categories" />
      </Stack>

      {/* overlay: trocar de estado não desmonta o navegador (evita perder a pilha) */}
      {state.status === 'locked' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}
