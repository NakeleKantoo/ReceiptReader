import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { formatBRL } from '@quanto/core';
import { useAuth } from '@/lib/auth';
import { useSync } from '@/lib/useSync';
import { useFocusReload } from '@/lib/useFocusReload';
import { countPendingChanges, countRows, countTotalValueCents, lowStockItems } from '@/db/repo';
import { greeting, relativeTime } from '@/lib/format';
import { AppText, Badge, Button, Card, Screen, SectionTitle } from '@/components/ui';
import { radius, spacing, usePalette } from '@/theme';

type Counts = {
  locations: number;
  categories: number;
  items: number;
  assets: number;
  pending: number;
  valueCents: number;
};

type ActionTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  primary?: boolean;
};

function ActionTile({ icon, title, subtitle, onPress, primary }: ActionTileProps) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 104,
        justifyContent: 'space-between',
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: primary ? palette.primary : palette.card,
        borderWidth: 1,
        borderColor: primary ? palette.primary : palette.border,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Ionicons name={icon} size={26} color={primary ? palette.primaryText : palette.primary} />
      <View style={{ gap: 2 }}>
        <AppText
          style={{ fontWeight: '700', fontSize: 16 }}
          color={primary ? palette.primaryText : palette.text}
        >
          {title}
        </AppText>
        <AppText
          variant="caption"
          color={primary ? `${palette.primaryText}CC` : palette.textMuted}
          numberOfLines={2}
        >
          {subtitle}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { state } = useAuth();
  const router = useRouter();
  const palette = usePalette();
  const sync = useSync();

  const [lowStock, setLowStock] = useState<{ id: string; name: string }[]>([]);
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
    setLowStock(lowStockItems().map((item) => ({ id: item.id, name: item.name })));
  }, []);

  useFocusReload(reload);
  useEffect(reload, [reload, sync.lastAt]);

  const session = state.status === 'authenticated' ? state.session : null;
  if (!session) return null;

  const stats = [
    { label: 'itens', value: counts.items },
    { label: 'bens', value: counts.assets },
    { label: 'locais', value: counts.locations },
    { label: 'categorias', value: counts.categories },
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
        <ActionTile
          primary
          icon="scan-outline"
          title="Escanear"
          subtitle="código de barras ou etiqueta"
          onPress={() => router.push('/scan')}
        />
        <ActionTile
          icon="remove-circle-outline"
          title="Usar item"
          subtitle="dá baixa no estoque"
          onPress={() => router.push('/pick-item?type=consume')}
        />
        <ActionTile
          icon="add-circle-outline"
          title="Dar entrada"
          subtitle="compra ou recebido"
          onPress={() => router.push('/pick-item?type=in')}
        />
        <ActionTile
          icon="qr-code-outline"
          title="Imprimir etiquetas"
          subtitle="QR para caixas e potes"
          onPress={() => router.push('/print')}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={{
              flex: 1,
              backgroundColor: palette.card,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: palette.border,
              paddingVertical: spacing.md,
              alignItems: 'center',
              gap: 2,
            }}
          >
            <AppText style={{ fontSize: 20, fontWeight: '700' }}>{stat.value}</AppText>
            <AppText variant="caption">{stat.label}</AppText>
          </View>
        ))}
      </View>

      {lowStock.length > 0 ? (
        <Card>
          <SectionTitle action={<Badge text={`${lowStock.length}`} tone="warning" />}>
            Para comprar
          </SectionTitle>
          {lowStock.slice(0, 5).map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/item/${item.id}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 }}
            >
              <Ionicons name="cart-outline" size={16} color={palette.warning} />
              <AppText style={{ flex: 1 }} numberOfLines={1}>
                {item.name}
              </AppText>
              <Ionicons name="chevron-forward" size={14} color={palette.textMuted} />
            </Pressable>
          ))}
          {lowStock.length > 5 ? (
            <AppText variant="caption">e mais {lowStock.length - 5}…</AppText>
          ) : null}
        </Card>
      ) : null}

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

        {sync.error ? (
          <AppText variant="caption" color={palette.danger}>
            {sync.error}
          </AppText>
        ) : null}

        <Button
          title="Sincronizar agora"
          variant="secondary"
          onPress={() => void sync.run()}
          loading={sync.running}
        />
      </Card>
    </Screen>
  );
}
