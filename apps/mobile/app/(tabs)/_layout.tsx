import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { usePalette } from '@/theme';

export default function TabsLayout() {
  const palette = usePalette();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopColor: palette.border,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="locations"
        options={{
          title: 'Locais',
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Escanear',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Estoque',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color as string} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>
  );
}
