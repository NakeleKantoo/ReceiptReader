import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { countPendingChanges, countRows, countTotalValueCents } from '@/db/repo';
import { greeting, relativeTime } from '@/lib/format';
import { AppText, Badge, Button, Card, Screen } from '@/components/ui';
import { formatBRL } from '@quanto/core';
import { radius, spacing, usePalette } from '@/theme';

type Counts = {
  locations: number;
  categories: number;
  items: number;
  assets: number;
  pending: number;
  valueCents: number;
};

export default function DashboardScreen() {
  const { state } = useAuth();
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync();

  const [counts, setCounts] = useState<Counts>({
    locations: 0,
    categories: 0,
    items: 0,
    assets: 0,
    pending: 0,
    valueCents: 0,
  });

  const reload = useCallback(() => {
    setCounts({
      locations: countRows('locations'),
      categories: countRows('categories'),
      items: countRows('items'),
      assets: countRows('assets'),
      pending: countPendingChanges(),
      valueCents: countTotalValueCents(),
    });
  }, []);

  useFocusReload(reload);
  useEffect(reload, [reload, sync.lastAt]);

  const session = state.status === 'authenticated' ? state.session : null;
  if (!session) return null;

  const stats = [
    { label: 'Locais', value: counts.locations, icon: 'map-outline' as const },
    { label: 'Categorias', value: counts.categories, icon: 'pricetags-outline' as const },
    { label: 'Itens', value: counts.items, icon: 'cube-outline' as const },
    { label: 'Bens', value: counts.assets, icon: 'construct-outline' as const },
  ];

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="caption">{greeting()}</AppText>
        <AppText variant="title">{session.user.name}</AppText>
        <AppText variant="caption">
          {session.household.name} · patrimônio {formatBRL(counts.valueCents)}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={{
              flexBasis: '47%',
              flexGrow: 1,
              backgroundColor: palette.card,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: palette.border,
              padding: spacing.lg,
              gap: spacing.xs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name={stat.icon} color={palette.textMuted} size={14} />
              <AppText variant="caption">{stat.label}</AppText>
            </View>
            <AppText variant="title">{stat.value}</AppText>
          </View>
        ))}
      </View>

      {counts.locations === 0 ? (
        <Card>
          <AppText variant="subtitle">Comece pelos lugares</AppText>
          <AppText variant="caption">
            Despensa, garagem, caixa de ferramentas... Cada lugar ganha uma etiqueta QR depois.
          </AppText>
          <Button title="Criar primeiro local" onPress={() => router.push('/locations')} />
        </Card>
      ) : null}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="subtitle">Sincronização</AppText>
          {sync.running ? (
            <Badge text="sincronizando" />
          ) : sync.offline ? (
            <Badge text="offline" tone="warning" />
          ) : sync.error ? (
            <Badge text="erro" tone="danger" />
          ) : (
            <Badge text={relativeTime(sync.lastAt)} tone="success" />
          )}
        </View>

        <AppText variant="caption">
          {counts.pending > 0
            ? `${counts.pending} alteração(ões) esperando envio`
            : 'Tudo enviado para a casa'}
        </AppText>

        {sync.error ? <AppText variant="caption" color={palette.danger}>{sync.error}</AppText> : null}

        <Button
          title="Sincronizar agora"
          variant="secondary"
          onPress={() => void sync.run()}
          loading={sync.running}
        />
      </Card>

      <Card>
        <AppText variant="subtitle">Próximos passos</AppText>
        <AppText variant="caption">
          Catálogo de itens e bens chega na F1. Leitura de código de barras e etiquetas QR, nas F2 e F4.
        </AppText>
      </Card>
    </Screen>
  );
}
