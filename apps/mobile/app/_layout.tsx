import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { usePalette } from '@/theme';
import { BootScreen, LockScreen } from '@/components/session-screens';
import { getDatabase } from '@/db';

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

  if (state.status === 'loading') return <BootScreen />;
  if (state.status === 'locked') return <LockScreen />;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Protected guard={state.status === 'needs-server'}>
          <Stack.Screen name="server" />
        </Stack.Protected>

        <Stack.Protected guard={state.status === 'authenticated'}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>

        <Stack.Protected guard={state.status === 'anonymous'}>
          <Stack.Screen name="login" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="join" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
